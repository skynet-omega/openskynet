"""
Reusable hypothesis components distilled from EX.

Small and intentionally boring:
- no grand theory
- just mechanisms that can be benchmarked fairly
"""

from __future__ import annotations

import math
from typing import Tuple

import torch
import torch.nn as nn


DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
INPUT_DIM = 12
HIDDEN_DIM = 48


class GRUBaseline(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int) -> None:
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_dim, device=device)

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h = self.cell(x_t, h)
        return self.head(h)


class FixedDecayGRU(nn.Module):
    """
    Explicit fixed-memory logic.
    This is a good stand-in for mediocre "one alpha for everything" recurrence.
    """

    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int, alpha: float = 0.82) -> None:
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim
        self.alpha = alpha

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_dim, device=device)

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            proposal = self.cell(x_t, h)
            h = self.alpha * h + (1.0 - self.alpha) * proposal
        return self.head(h)


class AdaptiveDecayGRU(nn.Module):
    """
    Distilled idea from V11_PURE_ADAPTIVE:
    retention depends on local hidden-state flux.
    """

    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int) -> None:
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        self.head = nn.Linear(hidden_dim, n_classes)
        self.flux_target = nn.Parameter(torch.tensor(0.45))
        self.modulation_strength = nn.Parameter(torch.tensor(0.35))
        self.hidden_dim = hidden_dim

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_dim, device=device)

    def adaptive_alpha(self, h_prev: torch.Tensor) -> torch.Tensor:
        flux = h_prev.abs()
        modulation = torch.sigmoid(flux - self.flux_target)
        delta = 1.0 - self.modulation_strength * modulation
        delta = delta.clamp(min=0.05, max=1.0)
        return delta

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            proposal = self.cell(x_t, h)
            alpha = self.adaptive_alpha(h)
            h = alpha * h + (1.0 - alpha) * proposal
        return self.head(h)


class SpectralMemoryGRU(nn.Module):
    """
    Distilled idea from V27/V55:
    keep a small oscillator bank as persistent state and expose it via a memory token.
    """

    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int, n_freqs: int = 24) -> None:
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        self.to_complex = nn.Linear(hidden_dim, n_freqs * 2)
        self.mem_proj = nn.Linear(n_freqs * 2, hidden_dim)
        self.mem_norm = nn.LayerNorm(hidden_dim)
        self.mix = nn.Linear(hidden_dim * 2, hidden_dim)
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim
        self.n_freqs = n_freqs

        periods = torch.pow(2.0, torch.linspace(0, 5, n_freqs))
        self.omegas = nn.Parameter(2 * math.pi / periods)
        self.damping = nn.Parameter(torch.ones(n_freqs) * 0.02)

    def init_state(self, batch_size: int, device: str) -> Tuple[torch.Tensor, torch.Tensor]:
        h = torch.zeros(batch_size, self.hidden_dim, device=device)
        z = torch.zeros(batch_size, self.n_freqs, dtype=torch.complex64, device=device)
        return h, z

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h, z = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h = self.cell(x_t, h)

            u = self.to_complex(h)
            u_real, u_imag = u[:, : self.n_freqs], u[:, self.n_freqs :]
            u_complex = torch.complex(u_real, u_imag)
            rot = torch.exp(torch.complex(-self.damping.abs(), self.omegas))
            z = z * rot + u_complex

            mem_flat = torch.cat([z.real, z.imag], dim=-1)
            mem_token = self.mem_norm(self.mem_proj(mem_flat))
            h = torch.tanh(self.mix(torch.cat([h, mem_token], dim=-1)))

        return self.head(h)


def build_model(hypothesis_id: str) -> nn.Module:
    if hypothesis_id == "gru_baseline":
        return GRUBaseline(INPUT_DIM, HIDDEN_DIM, 2).to(DEVICE)
    if hypothesis_id == "gru_fixed_decay":
        return FixedDecayGRU(INPUT_DIM, HIDDEN_DIM, 2).to(DEVICE)
    if hypothesis_id == "gru_adaptive_decay":
        return AdaptiveDecayGRU(INPUT_DIM, HIDDEN_DIM, 2).to(DEVICE)
    if hypothesis_id == "gru_spectral_memory":
        return SpectralMemoryGRU(INPUT_DIM, HIDDEN_DIM, 2).to(DEVICE)
    raise ValueError(f"unknown hypothesis_id: {hypothesis_id}")
