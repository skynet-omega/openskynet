"""
SKYNET V11 PURE + ADAPTIVE DECAY
================================

Integración del Experimento C (Decay Adaptativo) en el baseline V11_PURE.
Mantiene toda la estructura de V11_PURE que logró 96% win rate,
añadiendo únicamente la modulación del decay por flux.

Cambio aplicado:
    α = exp(-δ) → α = exp(-δ * (1 - λ·sigmoid(flux - μ)))
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math


class AdaptivePureCyborgCore(nn.Module):
    """
    PureCyborgCore + Adaptive Decay (del EXP_C exitoso)
    
    Única diferencia: alpha se modula por flux local del estado.
    """
    def __init__(self, d_model=128, d_state=32, kernel_radius=8, lenia_dt=0.1):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state
        self.d_inner = d_model * 2
        
        # === MAMBA-3 SSM COMPONENTS (IDÉNTICO A V11_PURE) ===
        self.in_proj = nn.Linear(d_model, self.d_inner * 2)
        self.delta_proj = nn.Linear(self.d_inner, d_state)
        self.B_proj = nn.Linear(self.d_inner, d_state)
        self.C_proj = nn.Linear(self.d_inner, d_state)
        self.theta_proj = nn.Linear(self.d_inner, d_state // 2)
        self.out_proj = nn.Linear(self.d_inner, d_model)
        
        # === NUEVO: Parámetros de Adaptive Decay (del EXP_C) ===
        self.flux_target = nn.Parameter(torch.tensor(0.5))
        self.modulation_strength = nn.Parameter(torch.tensor(0.3))
        
        # === LENIA COMPONENTS (IDÉNTICO A V11_PURE) ===
        self.kernel_radius = kernel_radius
        self.lenia_dt = lenia_dt
        self.ring_kernel = nn.Parameter(self._init_ring_kernel())
        self.growth_center = nn.Parameter(torch.tensor(0.20))
        self.growth_width = nn.Parameter(torch.tensor(0.08))
        self.lenia_scale = nn.Parameter(torch.tensor(0.5))
        
        self.h_state = None
        
    def _init_ring_kernel(self):
        r = torch.arange(self.kernel_radius, dtype=torch.float32)
        peak = self.kernel_radius // 2
        kernel = torch.exp(-((r - peak) ** 2) / (2 * (self.kernel_radius / 4) ** 2))
        kernel = kernel / kernel.sum()
        return kernel.view(1, 1, -1)
    
    def apply_rope(self, h, theta):
        batch = h.shape[0]
        d = h.shape[-1]
        n_pairs = d // 2
        theta = theta[:, :n_pairs]
        h_reshape = h.view(batch, n_pairs, 2)
        cos_t = torch.cos(theta).unsqueeze(-1)
        sin_t = torch.sin(theta).unsqueeze(-1)
        h_rot = torch.stack([
            h_reshape[..., 0] * cos_t.squeeze(-1) - h_reshape[..., 1] * sin_t.squeeze(-1),
            h_reshape[..., 0] * sin_t.squeeze(-1) + h_reshape[..., 1] * cos_t.squeeze(-1)
        ], dim=-1)
        return h_rot.view(batch, d)
    
    def compute_adaptive_alpha(self, delta):
        """
        NUEVO: Adaptive Decay del EXP_C
        
        δ_mod = δ * (1 - λ * sigmoid(flux - μ))
        
        - Si flux > μ: reduce decay (retener más)
        - Si flux < μ: aumenta decay (renovar más)
        """
        if self.h_state is None:
            return torch.exp(-delta)
        
        flux_per_dim = self.h_state.abs()
        modulation = torch.sigmoid(flux_per_dim - self.flux_target)
        delta_modulated = delta * (1 - self.modulation_strength * modulation)
        delta_modulated = delta_modulated.clamp(min=0.001, max=5.0)
        
        return torch.exp(-delta_modulated)
    
    def lenia_growth(self, u):
        diff_sq = (u - self.growth_center) ** 2
        var = 2 * (self.growth_width ** 2 + 1e-6)
        return 2 * torch.exp(-diff_sq / var) - 1
    
    def lenia_kernel(self, h):
        h_in = h.unsqueeze(1)
        pad_l = self.kernel_radius // 2
        pad_r = self.kernel_radius - pad_l - 1
        h_padded = F.pad(h_in, (pad_l, pad_r), mode='circular')
        u = F.conv1d(h_padded, self.ring_kernel).squeeze(1)
        u_norm = torch.sigmoid(u)
        growth = self.lenia_growth(u_norm)
        return self.lenia_dt * growth
    
    def reset(self):
        self.h_state = None
    
    def forward(self, x):
        batch = x.shape[0]
        
        # === Input projection (IDÉNTICO) ===
        xz = self.in_proj(x)
        x_signal, z_gate = xz.chunk(2, dim=-1)
        
        # === SSM parameters (IDÉNTICO) ===
        delta = F.softplus(self.delta_proj(x_signal)) + 0.001
        B = self.B_proj(x_signal)
        C = self.C_proj(x_signal)
        theta = self.theta_proj(x_signal) * 0.1
        
        # CAMBIO: alpha es ahora adaptativo
        alpha = self.compute_adaptive_alpha(delta)
        beta = delta
        
        # === Initialize state (IDÉNTICO) ===
        if self.h_state is None or self.h_state.shape[0] != batch:
            self.h_state = torch.zeros(batch, self.d_state, device=x.device)
        
        # === THE PURE EQUATION (IDÉNTICO) ===
        h_rotated = self.apply_rope(self.h_state, theta)
        term_ssm_decay = alpha * h_rotated
        
        x_scalar = x_signal.mean(dim=-1, keepdim=True)
        term_ssm_input = beta * B * x_scalar
        
        term_lenia = self.lenia_scale * self.lenia_kernel(self.h_state)
        
        self.h_state = term_ssm_decay + term_ssm_input + term_lenia
        
        # === Output (IDÉNTICO) ===
        y_state = (self.h_state * C).sum(dim=-1, keepdim=True)
        y = x_signal * y_state
        y = y * F.silu(z_gate)
        
        return self.out_proj(y)


class SKYNET_V11_PURE_ADAPTIVE(nn.Module):
    """
    V11 PURE + Adaptive Decay
    
    Baseline de 96% win rate + modulación de decay por flux.
    """
    def __init__(self, n_input=658, n_actions=20, d_model=128, d_state=32, device='cuda'):
        super().__init__()
        self.device = device
        self.d_model = d_model
        
        self.input_proj = nn.Linear(n_input, d_model).to(device)
        self.input_norm = nn.LayerNorm(d_model).to(device)
        
        self.core = AdaptivePureCyborgCore(
            d_model=d_model,
            d_state=d_state,
            kernel_radius=8,
            lenia_dt=0.1
        ).to(device)
        
        self.actor = nn.Linear(d_model, n_actions).to(device)
        self.critic = nn.Linear(d_model, 1).to(device)
        
        with torch.no_grad():
            self.actor.weight.data.normal_(0, 0.01)
            self.actor.bias.data.zero_()
            self.critic.weight.data.normal_(0, 0.01)
            self.critic.bias.data.zero_()
        
        print(f"🧬 SKYNET V11 PURE + ADAPTIVE DECAY (d_state={d_state})")
        print(f"   Base: V11_PURE (96% win rate)")
        print(f"   + Adaptive α = exp(-δ·(1-λ·sigmoid(flux-μ)))")
    
    def reset(self):
        self.core.reset()
    
    def forward(self, x, state=None):
        batch = x.shape[0]
        if x.dim() == 3:
            x = x.view(batch, -1)
        
        h = self.input_norm(self.input_proj(x))
        h = self.core(h)
        
        logits = self.actor(h).unsqueeze(1)
        value = self.critic(h).unsqueeze(1)
        
        audit = {
            'flux': h.abs().mean().item(),
            'h_norm': h.norm(dim=-1).mean().item(),
            'lenia_scale': self.core.lenia_scale.item(),
            'flux_target': self.core.flux_target.item(),
            'modulation_strength': self.core.modulation_strength.item()
        }
        
        return logits, audit


if __name__ == "__main__":
    print("=" * 60)
    print("🧪 SKYNET V11 PURE + ADAPTIVE: Test")
    print("=" * 60)
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = SKYNET_V11_PURE_ADAPTIVE(d_state=32, device=device)
    
    x = torch.randn(4, 658).to(device)
    model.reset()
    
    logits, audit = model(x)
    
    print(f"Input: {x.shape}")
    print(f"Output: {logits.shape}")
    print(f"Audit: {audit}")
    
    loss = logits.sum()
    loss.backward()
    print("✅ Gradient flow OK")
    
    model.reset()
    for i in range(10):
        logits, audit = model(x)
    print(f"After 10 steps: flux={audit['flux']:.4f}")
    print("=" * 60)
