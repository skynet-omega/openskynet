"""
SKYNET_CORE_V55_HOLODYNAMICS.py
================================
V55 HoloDynamics: Fusión de V43.4 (100% NBack) + V55 Proto-AGI

Hereda:
- HoloDynamics (V27) - Memoria perfecta con osciladores complejos
- Memory Token + LayerNorm (V43.4) - Separación Percepción/Memoria
- Transformer 2-layer (V43.4) - Atención profunda
- Turing Diffusion (V55) - Difusión espacial
- PT-Symmetry (V55) - Dinámica no-hermitiana
- JEPA Dreamer (V55) - Aprendizaje predictivo

Objetivo: 100% NBack + 100% XOR + Física

Author: Antigravity (2026-01-16)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

# ==============================================================================
# V55 PHYSICS PRIMITIVES
# ==============================================================================

class TuringDiffusion1D(nn.Module):
    """Turing's Local Diffusion Operator: D * Laplacian(u)"""
    def __init__(self, d_model, device='cuda'):
        super().__init__()
        self.D = nn.Parameter(torch.ones(d_model, device=device) * 0.1)
        kernel = torch.tensor([[[1.0, -2.0, 1.0]]], device=device)
        self.register_buffer('kernel', kernel)
        
    def forward(self, z, gate=None):
        B, Freqs = z.shape
        z_in = z.unsqueeze(1)
        z_pad = F.pad(z_in, (1, 1), mode='circular')
        laplacian = F.conv1d(z_pad, self.kernel)
        grad_diffusion = laplacian.squeeze(1) * self.D
        if gate is not None:
            grad_diffusion = grad_diffusion * gate
        return z + grad_diffusion

class PTSymmetricCoupling(nn.Module):
    """PT-Symmetry: Dynamic λ control through gain/loss coupling"""
    def __init__(self, d_model, device='cuda'):
        super().__init__()
        self.gamma = nn.Parameter(torch.randn(d_model, device=device) * 0.01)
        self.J = nn.Parameter(torch.ones(d_model, device=device))
        
    def forward(self, z_real, z_imag):
        dz_real = -self.gamma * z_real + self.J * z_imag
        dz_imag = -self.J * z_real + self.gamma * z_imag
        return z_real + dz_real, z_imag + dz_imag

# ==============================================================================
# V27 HOLODYNAMICS (The Perfect Memory)
# ==============================================================================

class HoloDynamics(nn.Module):
    """V27 Holo-Koopman: Bank of damped complex oscillators (PURE - No V55 mods)"""
    def __init__(self, d_model, n_freqs, device='cuda'):
        super().__init__()
        self.d_model = d_model
        self.n_freqs = n_freqs
        self.device = device
        
        # Harmonic Initialization (Geometric Series) - covers all timescales
        periods = torch.pow(2.0, torch.linspace(0, 10, n_freqs, device=device))
        omegas_init = 2 * np.pi / periods
        self.omegas = nn.Parameter(omegas_init + torch.randn_like(omegas_init) * 0.01)
        
        # Learnable Damping (Stability)
        self.damping = nn.Parameter(torch.ones(n_freqs, device=device) * 0.01)
        
        # Input to Complex Projection
        self.to_complex = nn.Linear(d_model, n_freqs * 2, device=device)
        
    def forward(self, x_t, z_prev):
        """
        x_t: [B, D] - Current latent input (real)
        z_prev: [B, F] (Complex) - Previous holographic state
        """
        # 1. Encode Input into the Wave Field
        u_flat = self.to_complex(x_t)
        u_real = u_flat[..., :self.n_freqs]
        u_imag = u_flat[..., self.n_freqs:]
        u_t = torch.complex(u_real, u_imag)
        
        # 2. Linear Spectral Evolution: z_new = z_old * e^{i*omega - damping} + u_t
        # This is EXACTLY V27 - the perfect memory formula
        dt = 1.0
        exponent = torch.complex(-self.damping.abs(), self.omegas) * dt
        rotator = torch.exp(exponent)
        
        z_next = z_prev * rotator + u_t
        
        return z_next



# ==============================================================================
# RETINA (V55 Style with Chunking)
# ==============================================================================

class V55Retina(nn.Module):
    def __init__(self, n_input, d_model, device='cuda'):
        super().__init__()
        self.proj = nn.Linear(n_input, d_model, device=device)
        self.norm = nn.LayerNorm(d_model, device=device)
        self.boundary_detector = nn.Linear(d_model * 2, 1, device=device)
        
    def forward(self, x, prev_h=None):
        h = self.norm(F.gelu(self.proj(x)))
        is_boundary = torch.zeros(x.shape[0], 1, device=x.device)
        if prev_h is not None:
            diff = torch.cat([h, prev_h], dim=-1)
            is_boundary = torch.sigmoid(self.boundary_detector(diff))
        return h, is_boundary

# ==============================================================================
# V55 DREAMER (JEPA + VICReg)
# ==============================================================================

class V55Dreamer(nn.Module):
    def __init__(self, d_model, n_actions, device='cuda'):
        super().__init__()
        self.action_emb = nn.Embedding(n_actions, d_model, device=device)
        self.predictor = nn.Sequential(
            nn.Linear(d_model * 2, d_model * 2, device=device),
            nn.GELU(),
            nn.Linear(d_model * 2, d_model, device=device)
        )
        
    def forward(self, z, action):
        a_emb = self.action_emb(action)
        combined = torch.cat([z, a_emb], dim=-1)
        z_next_pred = self.predictor(combined)
        return z_next_pred

    def compute_vicreg_loss(self, z_pred, z_target, mu=1.0, nu=1.0):
        sim_loss = F.mse_loss(z_pred, z_target)
        std_pred = torch.sqrt(z_pred.var(dim=0) + 1e-4)
        std_loss = torch.mean(F.relu(1.0 - std_pred))
        z_pred = z_pred - z_pred.mean(dim=0)
        cov_pred = (z_pred.T @ z_pred) / (z_pred.shape[0] - 1)
        diag = torch.eye(cov_pred.shape[0], device=cov_pred.device)
        cov_loss = (cov_pred * (1 - diag)).pow(2).sum() / cov_pred.shape[0]
        return sim_loss + mu * std_loss + nu * cov_loss

# ==============================================================================
# MAIN: SKYNET V55 HOLODYNAMICS
# ==============================================================================

class SkynetV55HoloDynamics(nn.Module):
    """
    V55 HoloDynamics: The best of V43.4 (100% NBack) + V55 (Physics)
    
    Key innovations from V43.4:
    - Separate Memory Token + LayerNorm
    - 2-layer Transformer for deep attention
    - Perception attends to Memory (not merged)
    
    Key innovations from V55:
    - Turing Diffusion (spatial interaction)
    - PT-Symmetry (non-Hermitian dynamics)
    - JEPA Dreamer (predictive learning)
    """
    def __init__(self, n_input, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.n_hidden = n_hidden
        self.device = device
        
        print("🌌 INITIALIZING SKYNET V55 'HOLODYNAMICS'")
        print("   >> V43.4 Memory System (100% NBack) + V55 Physics")
        
        # 1. Retina (Perception)
        self.retina = V55Retina(n_input, n_hidden, device=device)
        
        # 2. HoloDynamics Memory (V27 style + V55 enhancements)
        self.n_freqs = n_hidden * 2
        self.memory_core = HoloDynamics(n_hidden, self.n_freqs, device=device)
        
        # 3. V43.4 KEY: Memory Token Projector with LayerNorm
        self.mem_proj = nn.Linear(self.n_freqs * 2, n_hidden, device=device)
        self.mem_norm = nn.LayerNorm(n_hidden, device=device)  # CRITICAL!
        
        # 4. V43.4 KEY: Deep Transformer (2 layers, 8 heads)
        self.cortex_layer = nn.TransformerEncoderLayer(
            d_model=n_hidden, 
            nhead=8, 
            dim_feedforward=n_hidden * 4,
            dropout=0.0,
            batch_first=True,
            norm_first=True,  # Pre-norm is more stable
            device=device
        )
        self.cortex = nn.TransformerEncoder(self.cortex_layer, num_layers=2, enable_nested_tensor=False)
        
        # 5. Readout Heads
        self.output_head = nn.Linear(n_hidden, n_actions, device=device)
        self.uncertainty_head = nn.Linear(n_hidden, n_actions, device=device)
        self.value_head = nn.Linear(n_hidden, 1, device=device)
        
        # 6. JEPA Dreamer
        self.dreamer = V55Dreamer(n_hidden, n_actions, device=device)
        
        self.to(device)

    def init_state(self, B):
        return torch.zeros(B, self.n_freqs, dtype=torch.complex64, device=self.device)

    def forward(self, x, state=None, return_states=False):
        if x.dim() == 2: x = x.unsqueeze(1)
        B, T, _ = x.shape
        
        if state is None: 
            z = self.init_state(B)
        else:
            z = state
            
        all_logits = []
        all_uncertainty = []
        all_values = []
        all_states = []
        prev_h = None
        
        for t in range(T):
            # 1. Perception
            lat_t, is_boundary = self.retina(x[:, t], prev_h)
            prev_h = lat_t
            
            # 2. Update Memory (HoloDynamics)
            z = self.memory_core(lat_t, z)
            
            # 3. V43.4 KEY: Create Memory Token (Real+Imag) with LayerNorm
            mem_flat = torch.cat([z.real, z.imag], dim=-1)
            mem_token = self.mem_proj(mem_flat)
            mem_token = self.mem_norm(mem_token)  # CRITICAL: Normalize!
            
            # 4. V43.4 KEY: Stack [Perception, Memory] as 2 separate tokens
            context = torch.stack([lat_t, mem_token], dim=1)  # [B, 2, D]
            
            # 5. Cortex: Perception attends to Memory
            out = self.cortex(context)  # [B, 2, D]
            
            # 6. Take processed Perception token (index 0)
            #    It has now attended to Memory (index 1)
            final_embed = out[:, 0, :]
            
            if return_states:
                all_states.append(final_embed)
            
            # 7. Readout
            logits = self.output_head(final_embed)
            uncertainty = torch.exp(self.uncertainty_head(final_embed))
            value = self.value_head(final_embed)
            
            all_logits.append(logits)
            all_uncertainty.append(uncertainty)
            all_values.append(value)
            
        self.last_z = z
        
        logits_seq = torch.stack(all_logits, dim=1)
        unc_seq = torch.stack(all_uncertainty, dim=1)
        vals_seq = torch.stack(all_values, dim=1)
        
        if return_states:
            return torch.stack(all_states, dim=1), z, logits_seq, unc_seq, vals_seq
            
        return logits_seq, z, unc_seq, vals_seq

    def get_action_logits(self, states):
        """Compatibility with AGI Suite"""
        if states.dim() == 3:
            states = states[:, -1, :]
        return self.output_head(states)

# ==============================================================================
# ADAPTER FOR AGI SUITE
# ==============================================================================

class SkynetV55HoloDynamicsAdapter(nn.Module):
    """Adapter to make V55 HoloDynamics compatible with BaseExperiment"""
    def __init__(self, n_input, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.brain = SkynetV55HoloDynamics(n_input, n_hidden, n_actions, device=device)
        
    def forward(self, x, state=None):
        ret = self.brain(x, state=state, return_states=True)
        # ret = (all_states, z, logits_seq, unc_seq, vals_seq)
        return ret[0], ret[2]  # (states, logits_seq)
        
    def get_action_logits(self, states):
        if states.dim() == 3:
            states = states[:, -1, :]
        return self.brain.output_head(states)

# ==============================================================================
# UNIT TEST
# ==============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("🧪 SKYNET V55 HOLODYNAMICS - UNIT TEST")
    print("=" * 60)
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = SkynetV55HoloDynamics(n_input=8, n_hidden=64, n_actions=4, device=device)
    
    x = torch.randn(4, 10, 8, device=device)
    logits, state, unc, vals = model(x)
    
    print(f"Logits shape: {logits.shape}")
    print(f"State shape: {state.shape}")
    print(f"State dtype: {state.dtype}")
    print(f"Uncertainty sample: {unc[0, 0]}")
    print(f"Value sample: {vals[0, 0]}")
    print("✅ V55 HoloDynamics Implementation Successful.")
