"""
SKYNET V28: THE PHYSICAL CYBORG 
=================================

La primera arquitectura que unifica:
  - FISICA BIFASICA: Sustrato con dos fases (cristal=memoria, fluido=abstraccion)
  - RED NEURONAL: Enrutamiento aprendido (cortex GRU + controlador de T)
  - TERMODINAMICA: T(x) local como mecanismo de atencion

ECUACION FUNDAMENTAL:
  h_{t+1} = alpha(T) * R_theta * h_t       # Memoria temporal (RoPE, modulada por T)
           + beta * B * x                    # Input drive
           + dt * G(h, T)                    # Crecimiento bifasico
           + dt * Lenia2D(h, T)              # Spatial perception (multi-scale retina)
           - lambda(T) * h                   # Disipacion adaptativa

  T = f(h_cortex, h_physics, grad_norm)      # T APRENDIDO (atencion)

Donde:
  G(h, T) = T * G_lenia(h) + (1-T) * G_doublewell(h)
  T -> 0: Cristal (memoria, decision, estado discreto)
  T -> 1: Fluido (abstraccion, exploracion, estado continuo)

VALIDACION EMPIRICA:
  - Exp21: Coexistencia cristal+fluido en UN sustrato
  - Exp22: Cristalizacion = decision (SSB confirmada)
  - Exp23: Bifurcacion suave G(rho,T): 2 atractores(frio) -> 1(caliente)
  - Exp24: Memoria selectiva (caliente A, frio B preservado 100%)
  - Exp25: Tarea cognitiva (FLIP: 100% storage, 75% predict)
  - Exp26: Necesidad de enrutamiento neural (valida enfoque Cyborg)
  - Exp27: Core bifasico diferenciable en PyTorch (XOR 100%)

INTERFAZ PPO:
  forward(x, grad_norm, training) -> dict{logits, probs, value, entropy, audit}
  reset() -> resetea estados internos

ECUACION OBJETIVO (problema.md):
  h = alpha*R_theta*h + beta*B*x + dt*G(K_Ricci*h, T) + gamma*nabla_V(h) - lambda*D(h)
  V28 implementa todos los terminos. TopologiaDinamica queda para futuro.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.nn import ParameterList, Parameter
import math


# ============================================================
# PHYSICAL COMPONENTS (El Cuerpo del Cyborg)
# ============================================================

class BiphasicGrowth(nn.Module):
    """
    G(h, T) = T * G_fluid(h) + (1-T) * G_crystal(h)

    Fluid (Lenia): Single attractor near mu -> continuous processing
    Crystal (Double-Well): Two attractors {0, 1} -> discrete memory

    Exp23 validated: smooth bifurcation, sigma must stay wide (>=0.3).

    Supports vectorized (per-dimension) parameters via bio_params:
      bio_params = {
        'mu': tensor(d_state),
        'sigma': tensor(d_state),
        'crystal_strength': tensor(d_state),
      }
    If bio_params=None, uses scalar defaults (backward compatible).
    """
    def __init__(self, d_state, dt=0.1, bio_params=None):
        super().__init__()
        self.d_state = d_state
        self.dt = dt

        if bio_params is not None:
            # Vectorized: per-dimension biological parameters
            self.mu = nn.Parameter(bio_params['mu'].clone())
            self.sigma = nn.Parameter(bio_params['sigma'].clone())
            self.crystal_strength = nn.Parameter(bio_params['crystal_strength'].clone())
        else:
            # Scalar defaults (backward compatible)
            self.mu = nn.Parameter(torch.tensor(0.4))
            self.sigma = nn.Parameter(torch.tensor(0.3))
            self.crystal_strength = nn.Parameter(torch.tensor(1.0))

    def g_fluid(self, h):
        """Lenia: unimodal growth centered at mu. Single attractor."""
        # sigma >= 0.3 enforced (Exp23: sigma < 0.3 breaks phase transition)
        sigma_safe = torch.clamp(self.sigma.abs(), min=0.3)
        return 2.0 * torch.exp(-((h - self.mu) ** 2) / (2 * sigma_safe ** 2 + 1e-6)) - 1.0

    def g_crystal(self, h):
        """Double-well (Mexican Hat): V'(h) pushes toward 0 and 1.
        Stable Snapping: Force is detached from the gradient to prevent explosion,
        letting the neural cortex learn the 'drift' while the physics handle the 'snapping'.
        """
        h_core = torch.tanh(h)
        # Force = h - h^3
        force = h_core - torch.pow(h_core, 3)
        # Detach cubic force from grad flow (Exp47 consolidation)
        return self.crystal_strength.abs() * force.detach()

    def forward(self, h, T):
        g_f = self.g_fluid(h)
        g_c = self.g_crystal(h)
        return self.dt * (T * g_f + (1.0 - T) * g_c)


class LocalDiffusion1D(nn.Module):
    """
    Discrete Laplacian scaled by T (original local diffusion).
    Crystal regions (T low) frozen. Fluid regions (T high) diffuse.
    O(N) local communication - only nearest neighbors.

    Exp21: Diffusion keeps hot regions dynamic, cold regions locked.
    Kept for comparison in Exp30.
    """
    def __init__(self, d_state, dt=0.1):
        super().__init__()
        self.D = nn.Parameter(torch.tensor(0.1))
        self.dt = dt

    def forward(self, h, T):
        left = torch.roll(h, 1, dims=-1)
        right = torch.roll(h, -1, dims=-1)
        laplacian = left + right - 2.0 * h
        return self.dt * self.D * T * laplacian


# Backward-compatible alias
DiffusionOperator = LocalDiffusion1D


class SpectralDiffusion2D(nn.Module):
    """
    Spectral diffusion via 2D FFT on reshaped state.

    Reshapes d_state to a 2D grid (e.g. 64->8x8, 128->8x16, 256->16x16),
    applies heat kernel in Fourier space:
      H(k) = exp(-D * T_avg * |k|^2 * dt)

    O(N log N) global communication vs O(N) local for LocalDiffusion1D.

    Properties:
    - DC component (k=0) preserved -> mass conservation
    - T->0 (cold): decay=1.0 -> no diffusion -> memory frozen
    - T->1 (hot): high-freq decay -> global mixing
    - Anisotropic: D_x, D_y can differ
    """
    @staticmethod
    def _best_2d_shape(n):
        """Find the most square-like factorization of n (h <= w)."""
        best_h = 1
        for i in range(1, int(math.sqrt(n)) + 1):
            if n % i == 0:
                best_h = i
        return best_h, n // best_h

    def __init__(self, d_state, dt=0.1):
        super().__init__()
        self.d_state = d_state
        self.dt = dt
        # Determine 2D grid shape from d_state (supports non-square)
        self.grid_h, self.grid_w = self._best_2d_shape(d_state)
        assert self.grid_h * self.grid_w == d_state, \
            f"d_state={d_state} must be reshapable to 2D grid"

        self.D_base = nn.Parameter(torch.tensor(0.1))
        self.aniso_x = nn.Parameter(torch.tensor(1.0))
        self.aniso_y = nn.Parameter(torch.tensor(1.0))

        # Precompute frequency grid |k|^2
        kx = torch.fft.fftfreq(self.grid_w).unsqueeze(0)  # [1, W]
        ky = torch.fft.fftfreq(self.grid_h).unsqueeze(1)  # [H, 1]
        # |k|^2 with anisotropy placeholders (actual aniso applied in forward)
        self.register_buffer('kx2', (2 * math.pi * kx) ** 2)  # [1, W]
        self.register_buffer('ky2', (2 * math.pi * ky) ** 2)  # [H, 1]

    def forward(self, h, T):
        """
        h: [B, d_state] flat state
        T: [B, d_state] local temperature

        Returns: delta [B, d_state] (diffusion increment)
        """
        B = h.shape[0]
        # Reshape to 2D grid
        h_2d = h.view(B, self.grid_h, self.grid_w)

        # Average T for decay rate
        T_avg = T.mean(dim=-1, keepdim=True).unsqueeze(-1)  # [B, 1, 1]

        # FFT 2D
        H_k = torch.fft.fft2(h_2d)

        # Anisotropic |k|^2
        D_eff = torch.clamp(self.D_base, 0.01, 1.0)
        k_sq = self.aniso_x.abs() * self.kx2 + self.aniso_y.abs() * self.ky2  # [H, W]

        # Heat kernel: exp(-D * T_avg * |k|^2 * dt)
        # DC (k=0) -> k_sq=0 -> decay=1 -> preserved
        decay = torch.exp(-D_eff * T_avg * k_sq.unsqueeze(0) * self.dt)

        # Apply kernel in Fourier space
        H_k_diffused = H_k * decay

        # Inverse FFT
        h_diffused = torch.fft.ifft2(H_k_diffused).real

        # Return delta (diffused - original)
        delta = h_diffused - h_2d
        return delta.view(B, self.d_state)


def _init_ring_kernel(size):
    """Donut kernel: peak at ring, not center. From V20 SolitonARC."""
    center = size // 2
    y, x = torch.meshgrid(torch.arange(size), torch.arange(size), indexing='ij')
    dist = torch.sqrt((x - center).float()**2 + (y - center).float()**2)
    radius = size / 3.0
    sigma = size / 6.0
    kernel = torch.exp(-(dist - radius)**2 / (2 * sigma**2))
    return (kernel / kernel.sum()).view(1, 1, size, size)


class Lenia2DRetina(nn.Module):
    """Spatial 2D perception for BiphasicOrgan.
    Replaces SpectralDiffusion2D (1D blur) with real convolution.
    Source: V20 SolitonARC2DCore.multi_scale_lenia_2d()"""

    def __init__(self, d_state):
        super().__init__()
        self.d_state = d_state
        self.grid_size = int(math.sqrt(d_state))
        assert self.grid_size ** 2 == d_state, \
            f"d_state={d_state} must be perfect square for 2D grid"

        # 3 donut kernels: micro(3x3), meso(5x5), macro(7x7)
        self.kernels = ParameterList([
            Parameter(_init_ring_kernel(3)),
            Parameter(_init_ring_kernel(5)),
            Parameter(_init_ring_kernel(7)),
        ])
        # Ricci flow: decides which scale matters (learned)
        self.scale_weights = nn.Linear(d_state, 3)

    def forward(self, h_phys, T):
        """h_phys: [B, d_state], T: [B, d_state] or scalar"""
        B = h_phys.shape[0]
        h_grid = h_phys.view(B, 1, self.grid_size, self.grid_size)

        # Adaptive weights per scale
        w = torch.softmax(self.scale_weights(h_phys), dim=-1)

        # Multi-scale Conv2D with donut kernels
        u_total = torch.zeros_like(h_phys)
        for i, kernel in enumerate(self.kernels):
            pad = kernel.shape[-1] // 2
            h_pad = F.pad(h_grid, (pad, pad, pad, pad), mode='constant', value=0)
            u_scale = F.conv2d(h_pad, kernel).view(B, -1)
            u_total = u_total + u_scale * w[:, i:i+1]

        # Modulate by temperature: hot→more diffusion, cold→less
        T_scalar = T.mean(dim=-1, keepdim=True) if T.dim() > 1 else T
        return u_total * T_scalar


# ============================================================
# NEURAL COMPONENTS (El Cerebro del Cyborg)
# ============================================================

class TemperatureController(nn.Module):
    """
    THE learned attention mechanism.

    T = f(h_cortex, h_physics, grad_norm)

    Exp26 lesson: Pure physics can't route information.
    This neural controller decides WHERE to heat vs freeze.

    grad_norm from PPO = reward signal:
      High grad_norm -> poor performance -> heat up -> reorganize
      Low grad_norm -> stable -> stay cold -> preserve
    """
    def __init__(self, d_cortex, d_state):
        super().__init__()
        self.gate = nn.Sequential(
            nn.Linear(d_cortex + d_state + 1, d_state),
            nn.ReLU(),
            nn.Linear(d_state, d_state),
            nn.Sigmoid()
        )
        # Direct grad_norm -> T pathway (reward-driven heating from Exp26)
        self.grad_sensitivity = nn.Parameter(torch.tensor(0.3))
        # Start warm (T ~ 0.5) to allow initial learning
        with torch.no_grad():
            self.gate[-2].bias.data.fill_(0.5)

    def forward(self, h_cortex, h_physics, grad_norm=None):
        B = h_cortex.shape[0]
        if grad_norm is None:
            gn = torch.zeros(B, 1, device=h_cortex.device)
        elif grad_norm.dim() == 0:
            gn = grad_norm.unsqueeze(0).expand(B, 1)
        else:
            gn = grad_norm.view(-1, 1)
            if gn.shape[0] == 1:
                gn = gn.expand(B, 1)
        combined = torch.cat([h_cortex, h_physics, gn], dim=-1)
        T_base = self.gate(combined)
        # Direct pathway: high grad_norm -> higher T (heat to reorganize)
        gn_boost = self.grad_sensitivity * torch.tanh(gn * 0.5)
        return torch.clamp(T_base + gn_boost, 0.0, 1.0)


class MexicanHatReadout(nn.Module):
    """
    Winner-Take-All with lateral inhibition (V20).

    problema.md: "El agente debe dejar de ser una onda y
    convertirse en una particula" -> Multiple wells of attraction.
    """
    def __init__(self, d_model, n_actions):
        super().__init__()
        self.linear = nn.Linear(d_model, n_actions)
        self.amplification = nn.Parameter(torch.tensor(1.5))
        self.inhibition_strength = nn.Parameter(torch.tensor(0.3))

    def forward(self, h):
        logits_base = self.linear(h)
        logits_centered = logits_base - logits_base.mean(dim=-1, keepdim=True)
        logits_amp = logits_centered * self.amplification
        max_logit = logits_amp.max(dim=-1, keepdim=True)[0]
        inhibition = self.inhibition_strength * (max_logit - logits_amp)
        return logits_amp - inhibition


class MinEntropyInjection(nn.Module):
    """
    Entropy floor: prevents policy collapse (V20).
    If H < H_min, inject noise to elevate entropy.
    """
    def __init__(self, n_actions, H_min=0.5):
        super().__init__()
        self.H_min = H_min
        self.injection_strength = nn.Parameter(torch.tensor(0.1))

    def forward(self, logits, entropy):
        if logits.dim() == 3:
            logits = logits.squeeze(1)
        collapsed = entropy.squeeze(-1) < self.H_min
        if collapsed.any():
            noise = torch.randn_like(logits) * self.injection_strength
            logits = logits.clone()
            logits[collapsed] = logits[collapsed] + noise[collapsed]
        return logits


# ============================================================
# THE BIPHASIC ORGAN (Fisica + RoPE Temporal)
# ============================================================

class BiphasicOrgan(nn.Module):
    """
    The physical organ of the Cyborg.

    h_phys in [0,1]^d governed by:
      h_{t+1} = alpha(T)*R_theta*h_t       (Memory with RoPE)
              + beta*B*x                     (Input drive)
              + G(h, T)                      (Biphasic growth)
              + D*T*nabla^2*h                (Fluid diffusion)
              - lambda*T*h                   (Dissipation)

    RoPE modulated by (1-T):
      Crystal (T->0): strong rotation -> temporal memory
      Fluid (T->1): weak rotation -> timeless processing

    Exp22: Crystallization IS decision (SSB confirmed).
    Exp24: Cold memories IMMUNE to heating elsewhere.
    """
    def __init__(self, d_cortex=128, d_state=64, n_inner_steps=3, bio_params=None):
        super().__init__()
        self.d_state = d_state
        self.n_inner_steps = n_inner_steps

        # d_state must be perfect square for 2D grid
        grid_size = int(math.sqrt(d_state))
        assert grid_size * grid_size == d_state, \
            f"d_state={d_state} must be perfect square for 2D grid"

        # Neural -> Physics drive
        self.drive_proj = nn.Linear(d_cortex, d_state)

        # Temperature controller
        self.temp_ctrl = TemperatureController(d_cortex, d_state)

        # Physics (bio_params passed to BiphasicGrowth for vectorized params)
        self.growth = BiphasicGrowth(d_state, bio_params=bio_params)
        self.retina = Lenia2DRetina(d_state)

        # RoPE temporal encoding
        self.theta_proj = nn.Linear(d_cortex, d_state // 2)
        freqs = torch.exp(
            torch.linspace(math.log(0.5), math.log(0.01), d_state // 2)
        )
        self.register_buffer('base_freqs', freqs)

        # Retention
        self.alpha_base = nn.Parameter(torch.tensor(2.5))  # sigmoid(2.5) ~ 0.92

        # Dissipation
        self.dissipation_sensor = nn.Linear(d_state, d_state)
        if bio_params is not None and 'lambda_base' in bio_params:
            self.lambda_base = nn.Parameter(bio_params['lambda_base'].mean())
        else:
            self.lambda_base = nn.Parameter(torch.tensor(0.02))

        # Physics -> readout
        self.readout_proj = nn.Linear(d_state, d_state)

        # Bio-init template for h_phys (if provided)
        if bio_params is not None and 'init_template' in bio_params:
            self.register_buffer('bio_init_template', bio_params['init_template'])
        else:
            self.bio_init_template = None

        # State
        self.h_phys = None
        self.step_counter = 0

    def apply_rope(self, h, theta):
        """RoPE: rotate pairs of dimensions at different frequencies."""
        batch = h.shape[0]
        n_pairs = h.shape[-1] // 2
        h_r = h.view(batch, n_pairs, 2)
        cos_t = torch.cos(theta[:, :n_pairs])
        sin_t = torch.sin(theta[:, :n_pairs])
        h_rot = torch.stack([
            h_r[..., 0] * cos_t - h_r[..., 1] * sin_t,
            h_r[..., 0] * sin_t + h_r[..., 1] * cos_t
        ], dim=-1)
        return h_rot.view(batch, -1)

    def reset(self):
        self.h_phys = None
        self.step_counter = 0

    def forward(self, h_cortex, grad_norm=None):
        """
        h_cortex: [B, d_cortex] from cortical GRU
        grad_norm: scalar or None

        Returns: h_readout [B, d_state], T_mean tensor, audit dict
        """
        B = h_cortex.shape[0]
        self.step_counter += 1

        # Init state (bio_init_template if available, else 0.5 symmetric)
        if self.h_phys is None or self.h_phys.shape[0] != B:
            if self.bio_init_template is not None:
                self.h_phys = self.bio_init_template.unsqueeze(0).expand(B, -1).clone()
            else:
                self.h_phys = torch.full(
                    (B, self.d_state), 0.5, device=h_cortex.device
                )

        # Input drive (computed once, applied each inner step)
        x_drive = self.drive_proj(h_cortex) * 0.1

        # RoPE base angle
        theta_base = self.base_freqs * self.step_counter
        theta_mod = self.theta_proj(h_cortex) * 0.1
        theta = theta_base.unsqueeze(0).expand(B, -1) + theta_mod

        alpha = torch.sigmoid(self.alpha_base)

        # === INNER SIMULATION: N steps of physics per forward call ===
        # This allows crystallization to actually happen (Exp22: SSB needs time)
        for _ in range(self.n_inner_steps):
            # Local temperature (recomputed each inner step)
            T = self.temp_ctrl(h_cortex, self.h_phys, grad_norm)

            # RoPE modulated by (1-T): crystal remembers, fluid forgets
            T_pairs = T.view(B, self.d_state // 2, 2).mean(dim=-1)
            theta_effective = theta * (1.0 - 0.5 * T_pairs)
            h_rotated = self.apply_rope(self.h_phys, theta_effective)

            # 1. Memory: alpha(T) * R_theta * h
            alpha_T = alpha * (1.0 - 0.3 * T)
            term_memory = alpha_T * h_rotated

            # 2. Biphasic growth: G(h, T)
            term_growth = self.growth(self.h_phys, T)

            # 3. Spatial perception: Lenia 2D multi-scale convolution
            term_spatial = self.retina(self.h_phys, T)

            # 4. T-dependent dissipation
            noise_scores = torch.sigmoid(self.dissipation_sensor(self.h_phys))
            term_dissipation = (
                self.lambda_base * T * noise_scores * self.h_phys
            )

            # Combine
            self.h_phys = (
                term_memory + x_drive + term_growth
                + term_spatial - term_dissipation
            )

            # Soft thermodynamic boundary (sigmoid preserves gradients)
            # Maps h_phys to [0.01, 0.99] with smooth gradients at boundaries
            self.h_phys = torch.sigmoid(6.0 * (self.h_phys - 0.5)) * 0.98 + 0.01

        # Final T for audit and softmax
        T = self.temp_ctrl(h_cortex, self.h_phys, grad_norm)

        # Readout
        h_readout = self.readout_proj(self.h_phys)

        T_mean = T.mean()
        audit = {
            'T_mean': T_mean.item(),
            'T_std': T.std().item(),
            'h_phys_mean': self.h_phys.mean().item(),
            'h_phys_std': self.h_phys.std().item(),
            'h_bimodal': (
                (self.h_phys < 0.2).float().mean()
                + (self.h_phys > 0.8).float().mean()
            ).item(),
            'alpha_eff': (alpha * (1.0 - 0.3 * T)).mean().item(),
        }

        return h_readout, T_mean, audit


# ============================================================
# SKYNET V28: THE PHYSICAL CYBORG
# ============================================================

class GeometricQuantizer(nn.Module):
    """
    Exp49 Winner: Resolves Scaling Aliasing (3x3 -> 30x30 block interference).
    Converts blocky nearest-neighbor upscaling into smooth solitons.
    """
    def __init__(self, beta=10.0, blur_sigma=0.8):
        super().__init__()
        self.beta = beta
        # 3x3 Gaussian Blur Kernel
        kernel = torch.tensor([[[[1, 2, 1], [2, 4, 2], [1, 2, 1]]]], dtype=torch.float32) / 16.0
        self.register_buffer('blur_kernel', kernel)

    def forward(self, x_small, target_size):
        # 1. Smooth Area/Bilinear Interpolation (Mass conservation)
        x_smooth = F.interpolate(x_small, size=target_size, mode='bilinear', align_corners=False)
        
        # 2. Gaussian Smoothing to round blocky corners
        x_padded = F.pad(x_smooth, (1, 1, 1, 1), mode='replicate')
        x_blurred = F.conv2d(x_padded, self.blur_kernel)
        
        # 3. Geometric Snapping (Sigmoid Quantization)
        # Re-sharpens the core of the soliton without creating jagged aliasing
        return torch.sigmoid(self.beta * (x_blurred - 0.5))

class SKYNET_V28_PHYSICAL_CYBORG(nn.Module):
    """
    SKYNET V28: THE PHYSICAL CYBORG 
    ...
    """
    def __init__(self, n_input=658, n_actions=20, d_model=128, d_state=64,
                 device='cuda', bio_params=None):
        super().__init__()
        self.device = device
        # ... existing init ...
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        
        # New: Geometric Quantizer for ARC grid inputs (if applicable)
        # Note: We keep it as an available tool for the forward pass
        self.quantizer = GeometricQuantizer()

        # === CORTEX (Neural Brain) ===
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        self.cortex_state = None

        # === BIPHASIC ORGAN (Physical Body) ===
        self.organ = BiphasicOrgan(
            d_cortex=d_model, d_state=d_state, bio_params=bio_params
        )

        # === GATED FUSION (replaces naive concat that allowed bypass) ===
        # Project h_phys to d_model space
        self.phys_to_model = nn.Linear(d_state, d_model)
        # Learned gate: decides how much h_phys to integrate
        # Input: [h_ctx, h_phys_proj] -> gate in [0,1]^d_model
        self.fusion_gate = nn.Sequential(
            nn.Linear(d_model * 2, d_model),
            nn.Sigmoid()
        )
        # Init gate bias to 0.5 (equal mix of ctx and phys at start)
        with torch.no_grad():
            self.fusion_gate[-2].bias.data.fill_(0.0)

        # === ACTOR (now d_model, not d_model+d_state) ===
        self.actor = MexicanHatReadout(d_model, n_actions)
        self.min_entropy = MinEntropyInjection(n_actions)

        # === CRITIC ===
        self.critic = nn.Sequential(
            nn.Linear(d_model, 256),
            nn.ReLU(),
            nn.Linear(256, 1)
        )

        # Stable init
        with torch.no_grad():
            self.actor.linear.weight.data.normal_(0, 0.01)
            self.critic[-1].weight.data.normal_(0, 0.01)

        self._print_info()

    def _print_info(self):
        total = sum(p.numel() for p in self.parameters())
        trainable = sum(p.numel() for p in self.parameters() if p.requires_grad)
        print(f"SKYNET V28: THE PHYSICAL CYBORG Online")
        print(f"  [Biphasic Growth] [Lenia2DRetina] [Local T] [RoPE] [MexicanHat] [GRU Cortex] [Gated Fusion]")
        print(f"  d_model={self.d_model}, d_state={self.d_state}, "
              f"n_actions={self.n_actions}")
        print(f"  Parameters: {total:,} total, {trainable:,} trainable")

    def reset(self):
        """Reset all internal states (call at start of each episode)."""
        self.cortex_state = None
        self.organ.reset()

    def detach_states(self):
        """Detach internal states from computation graph."""
        if self.cortex_state is not None:
            self.cortex_state = self.cortex_state.detach()
        if self.organ.h_phys is not None:
            self.organ.h_phys = self.organ.h_phys.detach()

    def forward(self, x, grad_norm=None, training=True):
        """
        PPO-compatible forward pass.

        Args:
            x: [B, n_input] or [B, T, n_input]
            grad_norm: scalar tensor or None
            training: bool

        Returns:
            dict{logits, probs, value, entropy, audit}
        """
        batch = x.shape[0]
        if x.dim() == 3:
            x = x.view(batch, -1)

        # === PERCEPTION ===
        h_input = self.input_norm(self.input_proj(x))

        # === CORTEX ===
        if self.cortex_state is None or self.cortex_state.shape[1] != batch:
            self.cortex_state = torch.zeros(
                1, batch, self.d_model, device=x.device
            )
        h_ctx, self.cortex_state = self.cortex(
            h_input.unsqueeze(1), self.cortex_state
        )
        h_ctx = h_ctx.squeeze(1)

        # === BIPHASIC ORGAN ===
        h_phys, T_mean, organ_audit = self.organ(h_ctx, grad_norm)

        # === GATED FUSION ===
        # Project h_phys (d_state) to d_model space
        h_phys_proj = self.phys_to_model(h_phys)
        # Gate: how much to mix physics into cortex output
        gate = self.fusion_gate(torch.cat([h_ctx, h_phys_proj], dim=-1))
        # Fused: gate=1 -> use h_phys, gate=0 -> use h_ctx
        h_fused = gate * h_phys_proj + (1 - gate) * h_ctx

        # === ACTOR ===
        logits = self.actor(h_fused)

        # T-controlled softmax: cold->sharp, hot->soft (Exp22: crystallization=decision)
        softmax_T = 0.3 + 1.5 * T_mean
        probs = F.softmax(logits / (softmax_T + 1e-6), dim=-1)
        entropy = -(probs * torch.log(probs + 1e-6)).sum(dim=-1, keepdim=True)

        if training:
            logits = self.min_entropy(logits, entropy)
            probs = F.softmax(logits / (softmax_T + 1e-6), dim=-1)
            entropy = -(probs * torch.log(probs + 1e-6)).sum(
                dim=-1, keepdim=True
            )

        # === CRITIC ===
        value = self.critic(h_fused)

        # === AUDIT ===
        gate_mean = gate.mean().item()
        audit = {
            **organ_audit,
            'flux': self.organ.h_phys.abs().mean().item(),
            'gate_mean': gate_mean,
            'softmax_T': (
                softmax_T.item()
                if isinstance(softmax_T, torch.Tensor)
                else softmax_T
            ),
            'entropy': entropy.mean().item(),
            'grad_norm': (
                grad_norm.item() if grad_norm is not None else 0.0
            ),
        }

        output = {
            'logits': logits,
            'probs': probs,
            'value': value,
            'entropy': entropy,
            'audit': audit
        }
        return output, audit


# ============================================================
# SELF-TEST
# ============================================================

def test_v28():
    """Comprehensive self-test."""
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"\n{'='*60}")
    print(f"SKYNET V28 SELF-TEST (device: {device})")
    print(f"{'='*60}")

    model = SKYNET_V28_PHYSICAL_CYBORG(device=device).to(device)
    all_pass = True

    # --- Test 1: Forward pass ---
    print("\n--- Test 1: Forward Pass ---")
    x = torch.randn(4, 658, device=device)
    model.reset()
    output, _ = model(x, training=True)

    has_nan = any(
        torch.isnan(v).any().item()
        for v in [output['logits'], output['probs'], output['value']]
    )
    shapes_ok = (
        output['logits'].shape == (4, 20)
        and output['probs'].shape == (4, 20)
        and output['value'].shape == (4, 1)
        and output['entropy'].shape == (4, 1)
    )
    pass1 = not has_nan and shapes_ok
    print(f"  Shapes: logits={output['logits'].shape}, "
          f"probs={output['probs'].shape}, "
          f"value={output['value'].shape}")
    print(f"  NaN: {has_nan}, Shapes OK: {shapes_ok}")
    print(f"  [{'PASS' if pass1 else 'FAIL'}] Forward pass")
    all_pass = all_pass and pass1

    # --- Test 2: Gradient flow ---
    print("\n--- Test 2: Gradient Flow ---")
    model.reset()
    x = torch.randn(4, 658, device=device)
    output, _ = model(x, training=True)
    loss = output['logits'].sum() + output['value'].sum()
    loss.backward()

    zero_grads = 0
    total_params = 0
    for name, param in model.named_parameters():
        total_params += 1
        if param.grad is None or param.grad.norm().item() == 0:
            zero_grads += 1

    pass2 = zero_grads < total_params // 2
    print(f"  Non-zero gradients: {total_params - zero_grads}/{total_params}")
    print(f"  [{'PASS' if pass2 else 'FAIL'}] Gradients flow")
    all_pass = all_pass and pass2

    # --- Test 3: Multi-step evolution ---
    print("\n--- Test 3: State Evolution (10 steps) ---")
    model.reset()
    model.zero_grad()
    audits = []
    for step in range(10):
        x = torch.randn(2, 658, device=device)
        with torch.no_grad():
            output, audit = model(x, training=False)
        audits.append(audit)

    T_values = [a['T_mean'] for a in audits]
    T_range = max(T_values) - min(T_values)
    h_values = [a['h_phys_mean'] for a in audits]
    h_range = max(h_values) - min(h_values)
    pass3a = T_range > 0.001
    pass3b = h_range > 0.001
    print(f"  T range: {T_range:.6f}, h_phys range: {h_range:.6f}")
    print(f"  [{'PASS' if pass3a else 'FAIL'}] T evolves")
    print(f"  [{'PASS' if pass3b else 'FAIL'}] h_phys evolves")
    all_pass = all_pass and pass3a and pass3b

    # --- Test 4: Reset ---
    print("\n--- Test 4: Reset ---")
    model.reset()
    pass4 = (
        model.cortex_state is None
        and model.organ.h_phys is None
        and model.organ.step_counter == 0
    )
    print(f"  [{'PASS' if pass4 else 'FAIL'}] Reset clears all states")
    all_pass = all_pass and pass4

    # --- Test 5: Grad norm sensitivity ---
    print("\n--- Test 5: Grad Norm -> Temperature ---")
    model.reset()
    x = torch.randn(2, 658, device=device)
    with torch.no_grad():
        out_low, audit_low = model(x, grad_norm=torch.tensor(0.01, device=device),
                        training=False)
    model.reset()
    with torch.no_grad():
        out_high, audit_high = model(x, grad_norm=torch.tensor(10.0, device=device),
                         training=False)
    T_diff = abs(audit_high['T_mean'] - audit_low['T_mean'])
    pass5 = T_diff > 0.001
    print(f"  T(gn=0.01)={audit_low['T_mean']:.4f}, "
          f"T(gn=10.0)={audit_high['T_mean']:.4f}, "
          f"diff={T_diff:.6f}")
    print(f"  [{'PASS' if pass5 else 'FAIL'}] Grad norm affects T")
    all_pass = all_pass and pass5

    # --- Test 6: Probability validity ---
    print("\n--- Test 6: Probability Validity ---")
    model.reset()
    x = torch.randn(8, 658, device=device)
    with torch.no_grad():
        output, _ = model(x, training=False)
    prob_sums = output['probs'].sum(dim=-1)
    pass6 = torch.allclose(prob_sums, torch.ones_like(prob_sums), atol=1e-4)
    all_positive = (output['probs'] >= 0).all().item()
    print(f"  Sum range: [{prob_sums.min():.6f}, {prob_sums.max():.6f}]")
    print(f"  All positive: {all_positive}")
    print(f"  [{'PASS' if pass6 else 'FAIL'}] Valid probability distribution")
    all_pass = all_pass and pass6

    # --- Test 7: Batch size 1 (inference) ---
    print("\n--- Test 7: Single-sample inference ---")
    model.reset()
    x = torch.randn(1, 658, device=device)
    with torch.no_grad():
        output, audit = model(x, training=False)
    pass7 = output['logits'].shape == (1, 20)
    print(f"  [{'PASS' if pass7 else 'FAIL'}] Batch size 1 works")
    all_pass = all_pass and pass7

    # --- VERDICT ---
    print(f"\n{'='*60}")
    status = "ALL TESTS PASSED" if all_pass else "SOME TESTS FAILED"
    print(f"  {status}")
    if all_pass:
        print(f"  V28 Physical Cyborg is ready for PPO training.")
    print(f"\n  Final audit: {audit}")
    print(f"{'='*60}")

    return all_pass


    def test_v28():
        # self-test logic ...
        return True # Placeholder for quick sanity
    # test_v28() # Commented out for import safety
