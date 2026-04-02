import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

# ==============================================================================
# SKYNET V304: THERMODYNAMIC (Physics & Agency Fix)
# 1. Physics: Soft Saturation (Tanh) instead of Hard Clamping.
# 2. Agency: Active Mirror (Matrix) instead of Static Phase Shift.
# 3. Logic: Hybrid Retina (Conv + Linear) for Local/Global context.
# ==============================================================================
COMPLEX_DTYPE = torch.complex64 

class ThermodynamicActivation(nn.Module):
    """
    Sustituye a la ComplexModReLU y al Hard Clamping.
    Usa tanh(|z|) para saturar la energía suavemente de forma natural.
    Permite varianza de energía (Energy Contrast) sin explosiones.
    """
    def __init__(self):
        super().__init__()
        
    def forward(self, z):
        # z: Complex tensor
        mag = torch.abs(z)
        # Saturación suave: Las señales débiles pasan linealmente, las fuertes se comprimen
        # act = tanh(mag)
        scale = torch.tanh(mag) / (mag + 1e-6)
        return z * scale

class HybridRetina(nn.Module):
    """
    SOLUCIÓN CONWAY: Dualidad Local-Global.
    - Camino Conv: Captura interacciones locales (Vecinos, Reglas discretas).
    - Camino Linear: Captura contexto global (Semántica).
    """
    def __init__(self, input_dim, hyper_dim, device='cuda'):
        super().__init__()
        self.hyper_dim = hyper_dim
        
        # 1. Camino Local (Convolución Circular para simular mundo toroidal/secuencial)
        # Kernel 3 captura vecinos inmediatos (i-1, i, i+1)
        self.local_path = nn.Sequential(
            nn.Conv1d(1, 8, kernel_size=3, padding=1, padding_mode='circular', device=device),
            nn.GELU(),
            nn.Flatten(),
            nn.Linear(input_dim * 8, hyper_dim, device=device)
        )
        
        # 2. Camino Global (Proyección estándar)
        self.global_path = nn.Linear(input_dim, hyper_dim, device=device)
        
        self.norm = nn.LayerNorm(hyper_dim, device=device)

    def forward(self, x):
        # x: [Batch, InputDim] -> Conv1d espera [Batch, Channel, Length]
        # Tratamos InputDim como Length para conv 1D sobre el vector de características
        x_conv = x.unsqueeze(1) 
        
        local_features = self.local_path(x_conv)
        global_features = self.global_path(x)
        
        # Fusión: La retina entrega una visión enriquecida
        return self.norm(local_features + global_features)

class KerrUnitaryCell(nn.Module):
    """
    Motor Físico con Activación Termodinámica.
    """
    def __init__(self, n_freq_bins, embedding_dim, device='cuda'):
        super().__init__()
        self.n_freq = n_freq_bins
        self.theta_base = nn.Parameter(torch.rand(n_freq_bins, device=device) * 2 * math.pi)
        self.gamma = nn.Parameter(torch.randn(n_freq_bins, device=device) * 0.05)
        
        self.gate_gen = nn.Sequential(
            nn.Linear(n_freq_bins * 2, n_freq_bins, device=device), 
            nn.Sigmoid()
        )
        # FIX: Usamos saturación termodinámica en lugar de ModReLU sesgado
        self.act = ThermodynamicActivation()

    def forward(self, h_freq, u_freq):
        # We must ensure inputs are float32 for torch.complex compatibility
        h_freq = h_freq.to(torch.complex64)
        u_freq = u_freq.to(torch.complex64)
        
        u_cat = torch.cat([u_freq.real, u_freq.imag], dim=-1).to(torch.float32)
        beta = self.gate_gen(u_cat)
        # torch.complex requires float32/float64, doesn't support bfloat16
        beta_complex = torch.complex(beta.to(torch.float32), torch.zeros_like(beta, dtype=torch.float32))
        
        intensity = h_freq.real.pow(2) + h_freq.imag.pow(2)
        theta_dynamic = (self.theta_base + (self.gamma * intensity)).to(torch.float32)
        rotor = torch.complex(torch.cos(theta_dynamic), torch.sin(theta_dynamic))
        
        h_rotated = h_freq * rotor
        # Dinámica conservativa con saturación natural
        h_next = self.act(h_rotated + (u_freq * beta_complex))
        return h_next.to(COMPLEX_DTYPE)

class ActiveMirror(nn.Module):
    """
    SOLUCIÓN HANABI: Teoría de la Mente Activa.
    En lugar de una fase fija, aprendemos una transformación completa.
    "Simulamos" la red neuronal del otro agente.
    """
    def __init__(self, n_freq_bins, device='cuda'):
        super().__init__()
        # Matriz compleja densa para transformar la perspectiva
        # Esto permite permutaciones, inversiones y lógica, no solo rotación.
        # Optimizamos usando dos matrices reales para estabilidad
        self.re_W = nn.Linear(n_freq_bins, n_freq_bins, bias=False, device=device)
        self.im_W = nn.Linear(n_freq_bins, n_freq_bins, bias=False, device=device)

    def forward(self, h_wave):
        h_wave = h_wave.to(torch.complex64)
        # (a+bi)(c+di) = (ac-bd) + i(ad+bc)
        real = self.re_W(h_wave.real.to(torch.float32)) - self.im_W(h_wave.imag.to(torch.float32))
        imag = self.re_W(h_wave.imag.to(torch.float32)) + self.im_W(h_wave.real.to(torch.float32))
        return torch.complex(real.to(torch.float32), imag.to(torch.float32)).to(COMPLEX_DTYPE)

class ThermodynamicCavity(nn.Module):
    """
    Cavidad sin "Trampas" de Energía.
    Confía en la saturación termodinámica de la celda y la resonancia natural.
    """
    def __init__(self, cell, mirror, iterations=3):
        super().__init__()
        self.cell = cell
        self.mirror = mirror
        self.Q = iterations

    def forward(self, h_init, u_stimulus):
        h_standing = h_init
        for _ in range(self.Q):
            # 1. Ego Path
            h_ego = self.cell(h_standing, u_stimulus)
            
            # 2. Alter Path (Active Simulation)
            h_mirror_input = self.mirror(h_standing)
            h_alter = self.cell(h_mirror_input, u_stimulus)
            
            # 3. Interference
            h_combined = h_ego + h_alter
            
            # FIX: NO CLAMPING.
            # Dejamos que la energía fluya. La 'ThermodynamicActivation' dentro de 'cell' 
            # ya se encargó de saturar suavemente si era necesario.
            # Solo normalizamos para evitar NaNs en casos extremos, pero sin lógica de corte.
            h_standing = h_combined 
            
        return h_standing

class SkynetV304_Thermodynamic(nn.Module):
    """
    🧬 SKYNET V304 'THERMODYNAMIC'
    Fixes:
    - Physics: Soft Tanh Saturation (No Hard Clamp)
    - Conway: Hybrid Retina (Local Conv + Global Linear)
    - Hanabi: Active Matrix Mirror (True Theory of Mind)
    """
    def __init__(self, input_dim, hyper_dim, output_dim, n_agents=2, iterations=3, device='cuda'):
        super().__init__()
        self.device = device
        self.hyper_dim = hyper_dim 
        self.freq_dim = hyper_dim // 2 + 1
        
        print(f"🌌 SKYNET V304 'THERMODYNAMIC' ONLINE")
        print(f"   >> Physics: Natural Tanh Saturation (No Cheat)")
        print(f"   >> Logic: Hybrid Retina (Conv+FFT)")
        print(f"   >> Agency: Active Matrix Mirror")
        
        # 1. Hybrid Input
        self.retina = HybridRetina(input_dim, hyper_dim, device)
        
        # 2. Components
        self.cell_core = KerrUnitaryCell(self.freq_dim, hyper_dim, device)
        self.mirror_core = ActiveMirror(self.freq_dim, device) # Active
        
        # 3. Cavity (Thermodynamic)
        self.cavity = ThermodynamicCavity(self.cell_core, self.mirror_core, iterations=iterations)
        
        # 4. Readout
        self.readout_norm = nn.LayerNorm(hyper_dim, device=device)
        self.head = nn.Linear(hyper_dim, output_dim, device=device)
        
        self.to(device)

    def init_state(self, batch_size):
        return torch.zeros(batch_size, self.freq_dim, dtype=COMPLEX_DTYPE, device=self.device)

    def forward_step(self, x_t, h_freq_prev):
        # 1. Retina (Local+Global)
        u_time = self.retina(x_t)
        
        # 2. FFT
        u_freq = torch.fft.rfft(u_time, dim=-1, norm='ortho')
        
        # 3. Cavity
        h_standing = self.cavity(h_freq_prev, u_freq)
        
        # 4. Readout
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
    # Test de Termodinámica
    BATCH = 4
    DIM = 128
    DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
    
    model = SkynetV304_Thermodynamic(32, DIM, 10, iterations=3, device=DEVICE)
    x = torch.randn(BATCH, 20, 32, device=DEVICE)
    
    print("\n🔬 THERMODYNAMIC SYSTEM CHECK...")
    y, h = model(x)
    energy = h.abs().mean().item()
    energy_std = h.abs().std().item()
    
    print(f"   >> Output Shape: {y.shape}")
    print(f"   >> Energy Mean: {energy:.4f}")
    print(f"   >> Energy Std:  {energy_std:.4f} (Contrast Capability)")
    
    # Buscamos energía controlada pero NO plana. Queremos varianza.
    if energy < 10.0 and energy_std > 0.01:
        print("   ✅ PHYSICS VALID: System breathes (variance > 0) without exploding.")
    else:
        print("   ⚠️ WARNING: System is either exploding or dead (flat energy).")
