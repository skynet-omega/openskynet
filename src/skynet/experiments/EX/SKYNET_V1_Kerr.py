import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

COMPLEX_DTYPE = torch.complex64 

class ComplexModReLU(nn.Module):
    def __init__(self, features, device='cuda', max_scale=2.0):
        super().__init__()
        self.bias = nn.Parameter(torch.zeros(features, device=device))
        self.max_scale = max_scale
        
    def forward(self, z):
        norm = torch.abs(z)
        scale = F.relu(norm + self.bias) / (norm + 1e-6)
        scale = torch.clamp(scale, max=self.max_scale)
        return z * scale

class KerrUnitaryCell(nn.Module):
    def __init__(self, n_freq_bins, device='cuda'):
        super().__init__()
        self.n_freq = n_freq_bins
        self.theta_base = nn.Parameter(torch.rand(n_freq_bins, device=device) * 2 * math.pi)
        self.gamma_raw = nn.Parameter(torch.randn(n_freq_bins, device=device) * 0.1)
        self.gate_gen = nn.Sequential(
            nn.Linear(n_freq_bins * 2, n_freq_bins, device=device), 
            nn.Sigmoid()
        )
        self.act = ComplexModReLU(n_freq_bins, device=device, max_scale=2.0)
        self.max_intensity = 10.0

    def forward(self, h_freq, u_freq):
        # [FIX] Sanitizar entrada
        if torch.isnan(h_freq).any():
            h_freq = torch.zeros_like(h_freq)
            
        u_cat = torch.cat([u_freq.real, u_freq.imag], dim=-1)
        beta = self.gate_gen(u_cat)
        
        intensity = h_freq.real.pow(2) + h_freq.imag.pow(2)
        # [FIX] Acotar intensidad
        intensity = torch.clamp(intensity, max=self.max_intensity)
        
        # [FIX] Gamma acotada con tanh
        gamma = torch.tanh(self.gamma_raw) * 0.05
        
        theta_dynamic = self.theta_base + (gamma * intensity)
        rotor = torch.complex(torch.cos(theta_dynamic), torch.sin(theta_dynamic))

        h_rotated = h_freq * rotor
        beta_complex = torch.complex(beta, torch.zeros_like(beta))
        u_gated = u_freq * beta_complex
        
        h_next = self.act(h_rotated + u_gated)
        
        # [FIX] Clamp valores extremos ANTES de normalizar (Estabilidad)
        h_next_real = torch.clamp(h_next.real, -20, 20)
        h_next_imag = torch.clamp(h_next.imag, -20, 20)
        h_next = torch.complex(h_next_real, h_next_imag)

        # [FIX] Complex RMS Norm (Manual)
        mag = torch.abs(h_next)
        scale = torch.clamp(mag.mean(dim=1, keepdim=True), min=1e-6, max=100.0)
        h_next = h_next / scale
        
        # [FIX] Doble chequeo
        if torch.isnan(h_next).any():
            h_next = torch.zeros_like(h_next)
            
        return h_next

class SkynetV1_Kerr(nn.Module):
    """
    SKYNET V1 KERR (SIMPLE UNITARY BASELINE)
    Minimal implementation of the KerrUnitaryCell RNN.
    """
    def __init__(self, input_dim, hyper_dim, output_dim, device='cuda'):
        super().__init__()
        self.device = device
        self.hyper_dim = hyper_dim 
        self.freq_dim = hyper_dim // 2 + 1
        
        print(f"📡 SKYNET V1 'KERR' (UNITARY BASELINE) ONLINE")
        
        self.retina = nn.Sequential(
            nn.Linear(input_dim, hyper_dim, device=device),
            nn.LayerNorm(hyper_dim, device=device),
            nn.GELU()
        )
        self.adapt_layers = nn.ModuleDict()
        self.cell = KerrUnitaryCell(self.freq_dim, device)
        self.proj_out = nn.Linear(hyper_dim, output_dim, device=device)
        self.to(device)

    def init_state(self, batch_size):
        return torch.zeros(batch_size, self.freq_dim, dtype=torch.complex64, device=self.device)

    def forward_step(self, x_t, h_freq_prev):
        u_time = self.retina(x_t)
        u_freq = torch.fft.rfft(u_time, dim=-1, norm='ortho')
        
        # [FIX] Sanitizar estado previo
        if torch.isnan(h_freq_prev).any() or torch.isinf(h_freq_prev).any():
            h_freq_prev = torch.zeros_like(h_freq_prev)
            
        h_freq_next = self.cell(h_freq_prev, u_freq)
        y_time = torch.fft.irfft(h_freq_next, n=self.hyper_dim, dim=-1, norm='ortho')
        
        # [FIX] Sanitizar salida
        y_time = torch.clamp(y_time, min=-50, max=50)
        logits = self.proj_out(y_time)
        return logits, h_freq_next

    def forward(self, x_seq, h_init=None):
        if x_seq.dim() == 4: x_seq = x_seq.view(x_seq.size(0), 1, -1)
        elif x_seq.dim() == 2: x_seq = x_seq.unsqueeze(1)
        
        B, T, D = x_seq.shape
        if h_init is None: 
            h_freq = self.init_state(B)
        else: 
            h_freq = h_init
            if torch.isnan(h_freq).any(): h_freq = torch.zeros_like(h_freq)
        
        logits_list = []
        for t in range(T):
            x_t = x_seq[:, t, :]
            # forward_step ya aplica self.retina(x_t) internamente
            logits, h_freq = self.forward_step(x_t, h_freq)
            logits_list.append(logits)
        return torch.stack(logits_list, dim=1), h_freq

    def self_dim_check(self, D):
        return self.retina[0].in_features
    
    def retina_adapt(self, x):
        D = x.shape[-1]
        D_str = str(D)
        if D_str not in self.adapt_layers:
            self.adapt_layers[D_str] = nn.Linear(D, self.hyper_dim, device=self.device).to(self.device)
        return self.adapt_layers[D_str](x)
