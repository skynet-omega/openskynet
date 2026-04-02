import torch
import torch.nn as nn
import torch.nn.functional as F

class RicciKernel(nn.Module):
    """V27 Multi-scale kernels: 3x3, 5x5, 7x7 (Full Rank)."""
    def __init__(self, channels):
        super().__init__()
        self.micro = nn.Conv2d(channels, channels, 3, padding=1)
        self.meso = nn.Conv2d(channels, channels, 5, padding=2)
        self.macro = nn.Conv2d(channels, channels, 7, padding=3)
        self.gate = nn.Conv2d(channels, 3, 1)
        
        with torch.no_grad():
            self.gate.bias.data[:] = torch.tensor([2.0, -1.0, -1.0])
        
    def forward(self, x):
        w = torch.softmax(self.gate(x), dim=1)
        return (self.micro(x) * w[:, 0:1]) + \
               (self.meso(x) * w[:, 1:2]) + \
               (self.macro(x) * w[:, 2:3])

class TrapezoidalResonance(nn.Module):
    """Resonant loop with Ricci kernels and Trapezoidal stability.
    Normalization and Gating are applied to the update, matching V27 success.
    """
    def __init__(self, channels, iterations=4):
        super().__init__()
        self.iterations = iterations
        self.ricci = RicciKernel(channels)
        self.diffusion = nn.Conv2d(channels, channels, 3, padding=1, groups=channels, bias=False)
        with torch.no_grad():
            laplace = torch.tensor([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=torch.float32)
            self.diffusion.weight.data[:] = laplace.view(1, 1, 3, 3).repeat(channels, 1, 1, 1)
            
        self.dt = nn.Parameter(torch.tensor(0.5)) # Higher dt for faster growth
        self.norm = nn.GroupNorm(8, channels)
        self.gate_net = nn.Conv2d(channels, 1, 1)
        
    def forward(self, h):
        for _ in range(self.iterations):
            # Calculate Derivative at current state
            # f(h) = Ricci(h) + Diffusion(h)
            f_prev = self.ricci(h) + 0.1 * self.diffusion(h)
            
            # Predict state at h + dt
            h_half = h + self.dt * f_prev
            
            # Calculate Derivative at predicted state
            f_next = self.ricci(h_half) + 0.1 * self.diffusion(h_half)
            
            # Trapezoidal Average Update
            delta = (f_prev + f_next) / 2.0
            
            # Apply V27-style gating and normalization to the delta
            gate = torch.sigmoid(self.gate_net(h))
            h = h + gate * F.relu(self.norm(delta))
            
        return h
