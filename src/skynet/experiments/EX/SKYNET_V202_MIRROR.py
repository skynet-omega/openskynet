import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

# ==============================================================================
# CONFIGURACIÓN FÍSICA: V202 MIRROR (RESONANCIA ESPECULAR)
# ==============================================================================
COMPLEX_DTYPE = torch.complex64 

class ComplexModReLU(nn.Module):
    """
    ACTIVACIÓN NO LINEAL COMPLEJA (ModReLU)
    Filtro de ruido en el dominio de frecuencia.
    """
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
    El mismo motor físico de alta precisión validado en test_physics.py.
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
        # A. Input Gating
        u_cat = torch.cat([u_freq.real, u_freq.imag], dim=-1)
        beta = self.gate_gen(u_cat)
        
        # B. Kerr Dynamics
        intensity = h_freq.real.pow(2) + h_freq.imag.pow(2)
        theta_dynamic = self.theta_base + (self.gamma * intensity)
        rotor = torch.complex(torch.cos(theta_dynamic), torch.sin(theta_dynamic))

        # C. Update
        h_rotated = h_freq * rotor
        beta_complex = torch.complex(beta, torch.zeros_like(beta))
        u_gated = u_freq * beta_complex
        h_pre_act = h_rotated + u_gated

        # D. Clean & Normalize
        h_next = self.act(h_pre_act)
        h_next = h_next / (torch.abs(h_next).max(dim=1, keepdim=True)[0] + 1e-6)
        return h_next

class PhaseMirror(nn.Module):
    """
    MODULO DE NEURONAS ESPEJO HOLOGRÁFICAS
    Simula la mente de otros agentes rotando la fase del estado interno.
    """
    def __init__(self, n_freq_bins, n_agents=2, device='cuda'):
        super().__init__()
        # Cada agente tiene una "Firma de Fase" única.
        # Es como ver el holograma desde un ángulo distinto.
        # Inicializamos con ruido pequeño alrededor de 0 para empezar cerca del self.
        self.agent_shifts = nn.Parameter(torch.randn(n_agents, n_freq_bins, device=device) * 0.1)
        self.device = device

    def reflect(self, h_wave, agent_idx):
        """
        Proyecta mi onda en la mente del agente_idx.
        h_reflected = h * e^(i * phi_agent)
        """
        # En Hanabi 2 jugadores, agent_idx puede ser 0 o 1.
        # Si queremos simular al "otro", usamos el índice opuesto o un índice genérico.
        # Aquí asumiremos que agent_idx es el índice del agente que queremos simular.
        
        # Para simplificar en batch, si agent_idx es un tensor, gather.
        # Si es un int, seleccionamos directo.
        if isinstance(agent_idx, int):
            shift = self.agent_shifts[agent_idx] # [F]
        else:
             # agent_idx: [B]
             shift = self.agent_shifts[agent_idx] # [B, F]
        
        rotor = torch.complex(torch.cos(shift), torch.sin(shift))
        return h_wave * rotor

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

class SkynetV202_Mirror(nn.Module):
    """
    SKYNET V202 'MIRROR'
    Arquitectura basada en Interferencia Constructiva para Teoría de la Mente.
    """
    def __init__(self, input_dim, hyper_dim, output_dim, n_agents=2, device='cuda'):
        super().__init__()
        self.device = device
        self.hyper_dim = hyper_dim 
        self.freq_dim = hyper_dim // 2 + 1
        self.n_agents = n_agents
        
        print(f"🌌 SKYNET V202 'MIRROR' ONLINE")
        print(f"   >> Core: Kerr Unitary (Non-Linear Wave)")
        print(f"   >> Mind: Holographic Phase Mirror (Constructive Interference)")
        
        self.retina = OpticalRetina(input_dim, hyper_dim, device)
        self.cell = KerrUnitaryCell(self.freq_dim, hyper_dim, device)
        self.mirror = PhaseMirror(self.freq_dim, n_agents, device)
        
        self.readout_norm = nn.LayerNorm(hyper_dim, device=device)
        self.head = nn.Linear(hyper_dim, output_dim, device=device)
        
        self.to(device)

    def init_state(self, batch_size):
        return torch.zeros(batch_size, self.freq_dim, dtype=COMPLEX_DTYPE, device=self.device)

    def forward_step(self, x_t, h_freq_prev):
        # 1. Retina & FFT
        u_time = self.retina(x_t)
        u_freq = torch.fft.rfft(u_time, dim=-1, norm='ortho')
        
        # 2. Kerr Core (EGO Perspective)
        # Mi procesamiento normal del mundo
        h_freq_ego = self.cell(h_freq_prev, u_freq)
        
        # 3. Readout EGO
        y_time_ego = torch.fft.irfft(h_freq_ego, n=self.hyper_dim, dim=-1, norm='ortho')
        y_norm_ego = self.readout_norm(y_time_ego)
        logits_ego = self.head(y_norm_ego)
        
        # 4. MIRROR Step (ALTER Perspective)
        # Simulamos la mente del otro agente (Partner).
        # En Hanabi de 2, el "otro" es siempre el índice 1 si yo soy 0 (fijo abstractamente).
        # Usamos índice 1 para representar "El Otro".
        
        # Rotamos la fase de MI estado actual para ver el holograma desde SU ángulo
        h_freq_shifted = self.mirror.reflect(h_freq_ego, agent_idx=1)
        
        # Pasamos la onda rotada por MI MISMO núcleo (Neurona Espejo)
        # "Si yo estuviera en ese estado mental rotado, ¿qué pensaría?"
        # Nota: Usamos u_freq (el estímulo actual) también.
        h_freq_alter = self.cell(h_freq_shifted, u_freq) 
        
        # Readout ALTER
        y_time_alter = torch.fft.irfft(h_freq_alter, n=self.hyper_dim, dim=-1, norm='ortho')
        y_norm_alter = self.readout_norm(y_time_alter)
        logits_alter = self.head(y_norm_alter)
        
        # 5. CONSENSO (INTERFERENCIA CONSTRUCTIVA)
        # Sumamos logits. Las acciones que tienen sentido para ambos se amplifican.
        logits_consensus = logits_ego + logits_alter
        
        return logits_consensus, h_freq_ego

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
    # Test de Integridad
    model = SkynetV202_Mirror(32, 128, 10, device='cpu')
    x = torch.randn(4, 10, 32)
    y, h = model(x)
    print(f"Output Shape: {y.shape}") # [4, 10, 10]
    print(">> Init successful. The Mirror is reflecting.")
