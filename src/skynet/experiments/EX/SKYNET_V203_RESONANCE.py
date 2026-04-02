import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

# ==============================================================================
# CONFIGURACIÓN FÍSICA: V203 RESONANCE (CAVIDAD ÓPTICA)
# ==============================================================================
COMPLEX_DTYPE = torch.complex64 

class ComplexModReLU(nn.Module):
    def __init__(self, features, device='cuda'):
        super().__init__()
        self.bias = nn.Parameter(torch.zeros(features, device=device))
        
    def forward(self, z):
        norm = torch.abs(z)
        scale = F.relu(norm + self.bias) / (norm + 1e-6)
        return z * scale

class KerrUnitaryCell(nn.Module):
    """
    NÚCLEO V100.5 (Generador de Ondas)
    """
    def __init__(self, n_freq_bins, embedding_dim, device='cuda'):
        super().__init__()
        self.n_freq = n_freq_bins
        self.device = device

        self.theta_base = nn.Parameter(torch.rand(n_freq_bins, device=device) * 2 * math.pi)
        self.gamma = nn.Parameter(torch.randn(n_freq_bins, device=device) * 0.1)
        
        self.gate_gen = nn.Sequential(
            nn.Linear(n_freq_bins * 2, n_freq_bins, device=device), 
            nn.Sigmoid()
        )
        self.act = ComplexModReLU(n_freq_bins, device=device)

    def forward(self, h_freq, u_freq):
        u_cat = torch.cat([u_freq.real, u_freq.imag], dim=-1)
        beta = self.gate_gen(u_cat)
        
        intensity = h_freq.real.pow(2) + h_freq.imag.pow(2)
        theta_dynamic = self.theta_base + (self.gamma * intensity)
        rotor = torch.complex(torch.cos(theta_dynamic), torch.sin(theta_dynamic))

        h_rotated = h_freq * rotor
        beta_complex = torch.complex(beta, torch.zeros_like(beta))
        u_gated = u_freq * beta_complex
        h_pre_act = h_rotated + u_gated

        h_next = self.act(h_pre_act)
        h_next = h_next / (torch.abs(h_next).max(dim=1, keepdim=True)[0] + 1e-6)
        return h_next

class PhaseMirror(nn.Module):
    def __init__(self, n_freq_bins, n_agents=2, device='cuda'):
        super().__init__()
        # Zeros Init = "Laminar Start". Assumes perfect empathy (Identity) initially.
        # This allows signal to flow coherently from Ep 0, matching MLP speed.
        self.agent_shifts = nn.Parameter(torch.zeros(n_agents, n_freq_bins, device=device))

    def reflect(self, h_wave, agent_idx):
        if isinstance(agent_idx, int):
            shift = self.agent_shifts[agent_idx] # [F]
        else:
             shift = self.agent_shifts[agent_idx] # [B, F]
        
        rotor = torch.complex(torch.cos(shift), torch.sin(shift))
        return h_wave * rotor

class ResonanceCavity(nn.Module):
    """
    CAVIDAD DE RESONANCIA (CORE V203)
    Itera la onda entre Perspectiva EGO y ALTER para amplificar la coherencia.
    Equivalent to a Recurrent Attention Mechanism but in Phase Space.
    """
    def __init__(self, cell, mirror, iterations=3):
        super().__init__()
        self.cell = cell
        self.mirror = mirror
        self.iterations = iterations # Factor de Calidad (Q) de la cavidad

    def forward(self, h_init, u_stimulus):
        h_standing = h_init
        
        # Bucle de Resonancia (Time-Independent Loop)
        for _ in range(self.iterations):
            # 1. Camino Ego (Directo)
            h_ego = self.cell(h_standing, u_stimulus)
            
            # 2. Camino Alter (Reflejado)
            # Reflejamos el estado actual para ver qué "piensa" el otro
            h_mirror_input = self.mirror.reflect(h_standing, agent_idx=1)
            h_alter = self.cell(h_mirror_input, u_stimulus)
            
            # 3. Interferencia Constructiva (Suma Coherente)
            # La nueva onda es la superposición de ambas realidades
            h_combined = h_ego + h_alter
            
            # 4. Normalización (Gain Control)
            # En un láser, el medio de ganancia satura. Aquí normalizamos.
            h_standing = h_combined / (torch.abs(h_combined).max(dim=1, keepdim=True)[0] + 1e-6)
            
        return h_standing

class OpticalRetina(nn.Module):
    def __init__(self, input_dim, hyper_dim, device='cuda'):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hyper_dim, device=device),
            nn.LayerNorm(hyper_dim, device=device),
            nn.GELU(),
            nn.Linear(hyper_dim, hyper_dim, device=device) 
        )
    def forward(self, x): return self.net(x)

class SkynetV203_Resonance(nn.Module):
    """
    SKYNET V203 'RESONANCE'
    Cerebro Láser: Bucle de Resonancia Óptica para Atención Global.
    """
    def __init__(self, input_dim, hyper_dim, output_dim, n_agents=2, iterations=3, device='cuda'):
        super().__init__()
        self.device = device
        self.hyper_dim = hyper_dim 
        self.freq_dim = hyper_dim // 2 + 1
        
        print(f"🌌 SKYNET V203 'RESONANCE' ONLINE")
        print(f"   >> Cavity: {iterations} Internal Bounces (Q-Factor)")
        print(f"   >> Mechanism: Standing Wave Amplification")
        
        self.retina = OpticalRetina(input_dim, hyper_dim, device)
        
        # Componentes Físicos
        self.cell_core = KerrUnitaryCell(self.freq_dim, hyper_dim, device)
        self.mirror_core = PhaseMirror(self.freq_dim, n_agents, device)
        
        # La Cavidad que los une
        self.cavity = ResonanceCavity(self.cell_core, self.mirror_core, iterations=iterations)
        
        self.readout_norm = nn.LayerNorm(hyper_dim, device=device)
        self.head = nn.Linear(hyper_dim, output_dim, device=device)
        
        self.to(device)

    def init_state(self, batch_size):
        return torch.zeros(batch_size, self.freq_dim, dtype=COMPLEX_DTYPE, device=self.device)

    def forward_step(self, x_t, h_freq_prev):
        # 1. Retina & FFT
        u_time = self.retina(x_t)
        u_freq = torch.fft.rfft(u_time, dim=-1, norm='ortho')
        
        # 2. Resonance Cavity Logic (Thinking Fast)
        # La onda entra a la cavidad y rebota hasta formar una onda estacionaria
        h_standing_next = self.cavity(h_freq_prev, u_freq)
        
        # 3. Readout (Firing)
        y_time = torch.fft.irfft(h_standing_next, n=self.hyper_dim, dim=-1, norm='ortho')
        y_norm = self.readout_norm(y_time)
        logits = self.head(y_norm)
        
        return logits, h_standing_next

    def forward(self, x_seq, h_init=None):
        if x_seq.dim() == 4: x_seq = x_seq.view(x_seq.size(0), 1, -1)
        elif x_seq.dim() == 2: x_seq = x_seq.unsqueeze(1)
             
        B, T, _ = x_seq.shape
        if h_init is None: h_freq = self.init_state(B)
        else: h_freq = h_init

        logits_list = []
        for t in range(T):
            x_t = x_seq[:, t, :]
            logits, h_freq = self.forward_step(x_t, h_freq)
            logits_list.append(logits)
            
        return torch.stack(logits_list, dim=1), h_freq

if __name__ == "__main__":
    model = SkynetV203_Resonance(32, 128, 10, iterations=3, device='cpu')
    x = torch.randn(4, 10, 32)
    y, h = model(x)
    print(f"Output Shape: {y.shape}")
    print(">> Laser Cavity Stable.")