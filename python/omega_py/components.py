import torch
import torch.nn as nn
import math

# ==============================================================================
# OMEGA PHYISCAL CORE (Based on SKYNET_V304_THERMODYNAMIC)
# Thermodynamic Activation & Holographic State Prediction
# ==============================================================================

COMPLEX_DTYPE = torch.complex64 

class ThermodynamicActivation(nn.Module):
    def __init__(self):
        super().__init__()
        
    def forward(self, z):
        mag = torch.abs(z)
        scale = torch.tanh(mag) / (mag + 1e-6)
        return z * scale

class KerrUnitaryCell(nn.Module):
    def __init__(self, n_freq_bins, device='cpu'):
        super().__init__()
        self.n_freq = n_freq_bins
        self.theta_base = nn.Parameter(torch.rand(n_freq_bins, device=device) * 2 * math.pi)
        self.gamma = nn.Parameter(torch.randn(n_freq_bins, device=device) * 0.05)
        
        self.gate_gen = nn.Sequential(
            nn.Linear(n_freq_bins * 2, n_freq_bins, device=device), 
            nn.Sigmoid()
        )
        self.act = ThermodynamicActivation()

    def forward(self, h_freq, u_freq):
        h_freq = h_freq.to(COMPLEX_DTYPE)
        u_freq = u_freq.to(COMPLEX_DTYPE)
        
        u_cat = torch.cat([u_freq.real, u_freq.imag], dim=-1).to(torch.float32)
        beta = self.gate_gen(u_cat)
        beta_complex = torch.complex(beta.to(torch.float32), torch.zeros_like(beta, dtype=torch.float32))
        
        intensity = h_freq.real.pow(2) + h_freq.imag.pow(2)
        theta_dynamic = (self.theta_base + (self.gamma * intensity)).to(torch.float32)
        rotor = torch.complex(torch.cos(theta_dynamic), torch.sin(theta_dynamic))
        
        h_rotated = h_freq * rotor
        h_next = self.act(h_rotated + (u_freq * beta_complex))
        return h_next.to(COMPLEX_DTYPE)

class EpisodicFossilMemory(nn.Module):
    """
    Banco de memoria episódica key-value.
    Guarda estados holográficos pasados (fósiles).
    """
    def __init__(self, d_state: int, max_capacity: int = 500, device: str = 'cpu'):
        super().__init__()
        self.d_state = d_state
        self.max_capacity = max_capacity
        self.device = device

        # Buffer circular de fósiles [max_capacity, d_state]
        self.register_buffer('fossil_bank', torch.zeros(max_capacity, d_state, device=device))
        self.register_buffer('write_ptr', torch.tensor(0, dtype=torch.long, device=device))
        self.register_buffer('bank_size', torch.tensor(0, dtype=torch.long, device=device))

    def fossilize(self, state: torch.Tensor):
        state_norm = nn.functional.normalize(state.detach(), p=2, dim=-1)
        ptr = self.write_ptr.item()
        
        # Enforce dimension match
        if state_norm.shape[-1] == self.d_state:
            if state_norm.dim() == 2:
                self.fossil_bank[ptr] = state_norm[0]
            else:
                self.fossil_bank[ptr] = state_norm
                
            self.write_ptr = (self.write_ptr + 1) % self.max_capacity
            self.bank_size = torch.clamp(self.bank_size + 1, max=self.max_capacity)

    def load_state(self, state_dict):
        self.load_state_dict(state_dict)

    def get_state(self):
        return self.state_dict()

class JEPAPredictor(nn.Module):
    """
    Real JEPA Predictor using the Thermodynamic Kerr Unitary Cell.
    Projects state into a complex manifold and calculates predictive divergence (Frustration).
    """
    def __init__(self, d_state=64, device="cpu"):
        super().__init__()
        self.d_state = d_state
        self.device = device
        
        # Project linear state to complex manifold
        self.encoder = nn.Linear(d_state, d_state * 2, device=device) 
        
        # Physical Core
        self.cell = KerrUnitaryCell(n_freq_bins=d_state, device=device)
        
        # We don't train online in this bridge yet, but we use the physics engine
        # to calculate structural loss.
        
    def _to_complex(self, z):
        # Maps raw features to phase/amplitude complex representations
        mapped = self.encoder(z)
        real, imag = mapped.chunk(2, dim=-1)
        return torch.complex(real, imag)
        
    def forward(self, z_curr, z_next):
        """
        Calculates physical frustration based on prediction error in the complex domain.
        """
        if z_curr.shape[-1] < self.d_state:
            z_c = torch.zeros(z_curr.shape[0], self.d_state, device=self.device)
            z_c[:, :z_curr.shape[-1]] = z_curr
        else:
            z_c = z_curr[:, :self.d_state]
            
        if z_next.shape[-1] < self.d_state:
            z_n = torch.zeros(z_next.shape[0], self.d_state, device=self.device)
            z_n[:, :z_next.shape[-1]] = z_next
        else:
            z_n = z_next[:, :self.d_state]

        # Convert to physical waves
        h_wave = self._to_complex(z_c)
        target_wave = self._to_complex(z_n)
        
        # Use target as stimulus for the prediction simulation
        h_pred = self.cell(h_wave, target_wave)
        
        # Frustration is the thermodynamic divergence
        frustration = torch.abs(h_pred - target_wave)
        jepa_loss = torch.mean(frustration**2)
        
        return h_pred, jepa_loss, frustration
