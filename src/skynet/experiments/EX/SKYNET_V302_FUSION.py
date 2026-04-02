import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

# ==============================================================================
# SKYNET V302: FUSION (THE BEST OF BOTH WORLDS)
# Cell: Holographic Interference (V301) -> Physics Stability & Speed
# Arch: Resonance Cavity (V203) -> Infinite Memory & Deep Thought
# ==============================================================================
COMPLEX_DTYPE = torch.complex64 

class ComplexModReLU(nn.Module):
    """
    ACTIVACIÓN NO LINEAL COMPLEJA
    Mantiene la fase (semántica) mientras filtra el ruido de amplitud.
    """
    def __init__(self, features, device='cuda'):
        super().__init__()
        self.bias = nn.Parameter(torch.zeros(features, device=device) + 0.1)
        
    def forward(self, z):
        norm = torch.abs(z)
        scale = F.relu(norm + self.bias) / (norm + 1e-6)
        return z * scale

class HolographicInterferenceCell(nn.Module):
    """
    MOTOR FÍSICO V301 (Estable y Rápido)
    Sustituye a la inestable KerrUnitaryCell.
    Usa interferencia lineal + binding en lugar de auto-modulación caótica.
    """
    def __init__(self, n_freq_bins, embedding_dim, device='cuda'):
        super().__init__()
        self.n_freq = n_freq_bins
        self.device = device
        
        # Rotación Temporal (El "Reloj" implícito aprendido)
        self.time_shift = nn.Parameter(torch.randn(n_freq_bins, device=device))
        
        # Gating Dinámico de Entrada
        self.input_gate = nn.Sequential(
            nn.Linear(n_freq_bins * 2, n_freq_bins, device=device),
            nn.Sigmoid()
        )
        
        self.act = ComplexModReLU(n_freq_bins, device=device)

    def forward(self, h, u):
        # A. BINDING (Lógica Contextual)
        # Mezclamos estado y entrada: h * u
        # Normalizamos u para que actúe como operador
        u_unit = u / (torch.abs(u) + 1e-6)
        binding = h * u_unit 
        
        # B. TIME EVOLUTION (Inercia)
        # Rotamos la memoria hacia t+1
        rotor = torch.complex(torch.cos(self.time_shift), torch.sin(self.time_shift))
        h_rotated = h * rotor
        
        # C. SUPERPOSICIÓN (Interferencia)
        # Calculamos cuánto del input nuevo aceptamos
        u_cat = torch.cat([u.real, u.imag], dim=-1)
        beta = self.input_gate(u_cat)
        beta = torch.complex(beta, torch.zeros_like(beta))
        
        # Ecuación V301: Memoria Rotada + Lógica Nueva + Percepción Directa
        wave_front = h_rotated + (binding * beta) + (u * 0.5)
        
        # D. ACTIVACIÓN
        h_next = self.act(wave_front)
        
        return h_next

class PhaseMirror(nn.Module):
    """
    COMPONENTE SOCIAL (V202)
    Permite ver el estado desde la perspectiva del 'Otro'.
    """
    def __init__(self, n_freq_bins, n_agents=2, device='cuda'):
        super().__init__()
        self.agent_shifts = nn.Parameter(torch.zeros(n_agents, n_freq_bins, device=device))

    def reflect(self, h_wave, agent_idx=1):
        shift = self.agent_shifts[agent_idx]
        rotor = torch.complex(torch.cos(shift), torch.sin(shift))
        return h_wave * rotor

class ResonanceCavity(nn.Module):
    """
    ESTRUCTURA DE ATENCIÓN (V203)
    Bucle de retroalimentación que fuerza la persistencia de la memoria.
    Aquí es donde V301 fallaba (amnesia) y V203 brillaba.
    """
    def __init__(self, cell, mirror, iterations=3):
        super().__init__()
        self.cell = cell
        self.mirror = mirror
        self.Q = iterations # Profundidad de pensamiento

    def forward(self, h_init, u_stimulus):
        h_standing = h_init
        
        # Bucle de Resonancia
        for _ in range(self.Q):
            # 1. Camino Ego (Procesamiento directo con Celda V301)
            h_ego = self.cell(h_standing, u_stimulus)
            
            # 2. Camino Alter (Reflexión + Procesamiento)
            h_mirror_input = self.mirror.reflect(h_standing, agent_idx=1)
            h_alter = self.cell(h_mirror_input, u_stimulus)
            
            # 3. Interferencia Constructiva (Consenso)
            h_combined = h_ego + h_alter
            
            # 4. NORMALIZACIÓN DE ENERGÍA GLOBAL
            # Previene explosiones termodinámicas
            max_val = torch.abs(h_combined).max(dim=1, keepdim=True)[0]
            # Soft-Clamp para mantener la onda cerca de la unidad pero viva
            scale = torch.where(max_val > 1.5, 1.5 / (max_val + 1e-6), torch.ones_like(max_val))
            h_standing = h_combined * scale
            
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

class SkynetV302_Fusion(nn.Module):
    """
    🧬 SKYNET V302 'FUSION'
    El heredero legítimo.
    Core: Holographic Interference (V301)
    Mind: Resonance Cavity (V203)
    """
    def __init__(self, input_dim, hyper_dim, output_dim, n_agents=2, iterations=3, device='cuda'):
        super().__init__()
        self.device = device
        self.hyper_dim = hyper_dim 
        self.freq_dim = hyper_dim // 2 + 1
        
        print(f"🌌 SKYNET V302 'FUSION' ONLINE")
        print(f"   >> Cell: Holographic Interference (Stable V301)")
        print(f"   >> Mind: Resonance Cavity Q={iterations} (Deep V203)")
        
        self.retina = OpticalRetina(input_dim, hyper_dim, device)
        
        # La fusión de componentes
        self.cell_core = HolographicInterferenceCell(self.freq_dim, hyper_dim, device)
        self.mirror_core = PhaseMirror(self.freq_dim, n_agents, device)
        
        # El cerebro resonante
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
        
        # 2. Resonancia (Thinking)
        # La celda V301 corre dentro del bucle V203
        h_standing = self.cavity(h_freq_prev, u_freq)
        
        # 3. Readout
        y_time = torch.fft.irfft(h_standing, n=self.hyper_dim, dim=-1, norm='ortho')
        y_norm = self.readout_norm(y_time)
        logits = self.head(y_norm)
        
        return logits, h_standing

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
    # Test de Integridad Físico-Cognitiva
    BATCH = 4
    DIM = 128
    DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    model = SkynetV302_Fusion(32, DIM, 10, iterations=3, device=DEVICE)
    x = torch.randn(BATCH, 20, 32, device=DEVICE)
    
    print("\n🔬 FUSION ENGINE INTEGRITY CHECK...")
    y, h = model(x)
    energy = h.abs().mean().item()
    print(f"   >> Output Shape: {y.shape}")
    print(f"   >> Resonant Energy: {energy:.4f}")
    
    if energy < 2.0 and energy > 0.1:
        print("   ✅ SYSTEM OPTIMAL. Stability Achieved.")
    else:
        print("   ⚠️ WARNING: Energy out of bounds.")
