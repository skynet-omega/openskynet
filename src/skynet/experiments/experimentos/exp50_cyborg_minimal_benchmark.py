"""
Exp50: Cyborg Minimal Benchmark
===============================

First clean extraction from the V28/V77 line:
- discrete cortex
- continuous organ
- learned bridge

Question:
Can a minimal cyborg beat a plain GRU when the task mixes:
- sparse discrete memory from early cues
- late continuous regime detection under noise and deceptive shifts

This is not "new brain achieved".
It is a falsable probe for whether the cyborg pattern deserves a longer cycle.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from typing import Dict, List, Tuple

import torch
import torch.nn as nn

from ex_hypothesis_protocol import (
    AdaptationMetrics,
    CapabilityMetrics,
    HypothesisRun,
    InternalMetrics,
    save_protocol_report,
)


DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
INPUT_DIM = 12
SEQ_LEN = 24
TRAIN_SAMPLES = 1200
TEST_SAMPLES = 320
BATCH_SIZE = 64
MAX_EPOCHS = 16
LR = 2e-3
WEIGHT_DECAY = 1e-4
REPORT_PATH = Path(__file__).with_name("exp50_cyborg_minimal_benchmark.json")


def seed_all(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


class PlainGRU(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int) -> None:
        super().__init__()
        self.hidden_dim = hidden_dim
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        self.head = nn.Linear(hidden_dim, n_classes)
        self.last_debug: Dict[str, float] = {}

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = torch.zeros(batch, self.hidden_dim, device=x_seq.device)
        step_energy = 0.0
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h = self.cell(x_t, h)
            step_energy += h.abs().mean().item()
        self.last_debug = {"state_energy_mean": step_energy / max(1, steps)}
        return self.head(h)


class ContinuousOrgan(nn.Module):
    """
    Minimal physical organ:
    - fluid drive from input/cortex
    - crystal prior via double-well force
    - local diffusion over a 1D ring
    - learned temperature gate
    """

    def __init__(self, drive_dim: int, organ_dim: int) -> None:
        super().__init__()
        self.organ_dim = organ_dim
        self.drive_proj = nn.Linear(drive_dim, organ_dim)
        self.temp_net = nn.Sequential(
            nn.Linear(drive_dim + organ_dim, organ_dim),
            nn.Tanh(),
            nn.Linear(organ_dim, organ_dim),
        )
        self.dt = 0.12
        self.log_diffusion = nn.Parameter(torch.tensor(-2.4))
        self.log_dissipation = nn.Parameter(torch.tensor(-1.7))
        self.log_crystal = nn.Parameter(torch.tensor(-0.3))
        self.temp_bias = nn.Parameter(torch.tensor(-1.1))

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.organ_dim, device=device)

    def step(
        self,
        drive: torch.Tensor,
        state: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        fluid_drive = torch.tanh(self.drive_proj(drive))
        temp = torch.sigmoid(self.temp_net(torch.cat([drive, state], dim=-1)) + self.temp_bias)

        left = torch.roll(state, 1, dims=-1)
        right = torch.roll(state, -1, dims=-1)
        laplacian = left + right - 2.0 * state

        h_core = torch.tanh(state)
        crystal_force = h_core - torch.pow(h_core, 3)

        diffusion = self.log_diffusion.exp() * laplacian
        dissipation = self.log_dissipation.exp() * state
        crystal = self.log_crystal.exp() * crystal_force

        delta = temp * (fluid_drive + diffusion) + (1.0 - temp) * crystal - dissipation
        next_state = state + self.dt * delta
        return next_state, temp


class OrganOnly(nn.Module):
    def __init__(self, input_dim: int, organ_dim: int, n_classes: int) -> None:
        super().__init__()
        self.organ = ContinuousOrgan(input_dim, organ_dim)
        self.head = nn.Sequential(
            nn.LayerNorm(organ_dim),
            nn.Linear(organ_dim, n_classes),
        )
        self.last_debug: Dict[str, float] = {}

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        state = self.organ.init_state(batch, x_seq.device)
        temp_means: List[float] = []
        for t in range(steps):
            state, temp = self.organ.step(x_seq[:, t], state)
            temp_means.append(temp.mean().item())
        self.last_debug = {
            "temperature_mean": sum(temp_means) / max(1, len(temp_means)),
            "state_energy_mean": state.abs().mean().item(),
        }
        return self.head(state)


class CyborgMinimal(nn.Module):
    def __init__(
        self,
        input_dim: int,
        cortex_dim: int,
        organ_dim: int,
        n_classes: int,
    ) -> None:
        super().__init__()
        self.cortex_dim = cortex_dim
        self.input_proj = nn.Linear(input_dim, cortex_dim)
        self.norm = nn.LayerNorm(cortex_dim)
        self.cortex = nn.GRUCell(cortex_dim, cortex_dim)
        self.organ = ContinuousOrgan(cortex_dim + input_dim, organ_dim)
        self.bridge = nn.Sequential(
            nn.Linear(cortex_dim + organ_dim, cortex_dim),
            nn.Tanh(),
            nn.Linear(cortex_dim, cortex_dim),
            nn.Sigmoid(),
        )
        self.organ_to_cortex = nn.Linear(organ_dim, cortex_dim)
        self.head = nn.Linear(cortex_dim + organ_dim, n_classes)
        self.last_debug: Dict[str, float] = {}
        with torch.no_grad():
            final_linear = self.bridge[2]
            final_linear.bias.fill_(-2.0)
            final_linear.weight.mul_(0.25)
            self.organ_to_cortex.weight.mul_(0.15)
            self.organ_to_cortex.bias.zero_()

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = torch.zeros(batch, self.cortex_dim, device=x_seq.device)
        organ_state = self.organ.init_state(batch, x_seq.device)
        temp_means: List[float] = []
        bridge_means: List[float] = []

        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h = self.cortex(x_t, h)
            organ_state, temp = self.organ.step(torch.cat([x_seq[:, t], h], dim=-1), organ_state)
            bridge = self.bridge(torch.cat([h, organ_state], dim=-1))
            h = h + bridge * torch.tanh(self.organ_to_cortex(organ_state))
            temp_means.append(temp.mean().item())
            bridge_means.append(bridge.mean().item())

        fused = torch.cat([h, organ_state], dim=-1)
        self.last_debug = {
            "temperature_mean": sum(temp_means) / max(1, len(temp_means)),
            "bridge_mean": sum(bridge_means) / max(1, len(bridge_means)),
            "state_energy_mean": organ_state.abs().mean().item(),
        }
        return self.head(fused)


def generate_hybrid_binding_dataset(
    n_samples: int,
    *,
    seq_len: int,
    deceptive_memory_rate: float,
    continuous_noise: float,
    switch_window: Tuple[float, float],
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Label = 2 * late_regime + early_memory_bit.
    The memory cue is early and sparse.
    The regime is defined by the final segment of a continuous process.
    """
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * continuous_noise
    y = torch.zeros(n_samples, dtype=torch.long)

    t_axis = torch.linspace(0.0, 2.0 * math.pi, seq_len)
    for i in range(n_samples):
        memory_bit = random.randrange(2)
        early_regime = random.randrange(2)
        late_regime = random.randrange(2)
        switch_at = int(seq_len * random.uniform(*switch_window))
        cue_step = random.randint(1, 3)

        # Sparse memory cue early.
        x[i, cue_step, 6 + memory_bit] += 2.4
        x[i, cue_step, 8] += 1.0

        # Deceptive later cue with opposite bit.
        if random.random() < deceptive_memory_rate:
            fake_step = random.randint(seq_len // 2, seq_len - 4)
            x[i, fake_step, 6 + (1 - memory_bit)] += 1.9
            x[i, fake_step, 9] += 1.0

        for t in range(seq_len):
            regime = early_regime if t < switch_at else late_regime
            phase = t_axis[t]
            if regime == 0:
                signal = 0.85 * math.sin(phase * 1.3) + random.gauss(0.0, continuous_noise * 0.4)
                x[i, t, 0] += signal
                x[i, t, 1] += 0.65 * math.cos(phase * 0.7)
                x[i, t, 2] += 0.2
            else:
                drift = -0.6 + 1.2 * (t / max(1, seq_len - 1))
                burst = 0.45 if (t % 5 == 0) else -0.1
                x[i, t, 0] += drift + random.gauss(0.0, continuous_noise * 0.5)
                x[i, t, 1] += burst
                x[i, t, 2] += -0.25

            # Shared distractors and change marker.
            x[i, t, 3] += random.gauss(0.0, continuous_noise * 0.9)
            x[i, t, 4] += 1.0 if t == switch_at else 0.0
            x[i, t, 5] += t / max(1, seq_len - 1)
            x[i, t, 10] += max(0.0, (t - switch_at) / max(1, seq_len - switch_at))
            x[i, t, 11] += random.gauss(0.0, continuous_noise * 0.6)

        y[i] = 2 * late_regime + memory_bit

    return x, y


def accuracy_from_logits(logits: torch.Tensor, y: torch.Tensor) -> float:
    return (logits.argmax(dim=-1) == y).float().mean().item()


def train_on_dataset(
    model: nn.Module,
    x_train: torch.Tensor,
    y_train: torch.Tensor,
    *,
    max_epochs: int = MAX_EPOCHS,
) -> Tuple[float, int, List[float], float]:
    opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    criterion = nn.CrossEntropyLoss()
    curve: List[float] = []
    epochs_to_80 = max_epochs
    start = torch.cuda.Event(enable_timing=True) if torch.cuda.is_available() else None
    end = torch.cuda.Event(enable_timing=True) if torch.cuda.is_available() else None
    if start is not None:
        start.record()

    n = x_train.shape[0]
    for epoch in range(max_epochs):
        perm = torch.randperm(n)
        correct = 0
        for i in range(0, n, BATCH_SIZE):
            idx = perm[i : i + BATCH_SIZE]
            xb = x_train[idx].to(DEVICE)
            yb = y_train[idx].to(DEVICE)
            logits = model.forward_sequence(xb)
            loss = criterion(logits, yb)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            correct += (logits.argmax(dim=-1) == yb).sum().item()
        train_acc = correct / n
        curve.append(train_acc)
        if train_acc >= 0.80 and epochs_to_80 == max_epochs:
            epochs_to_80 = epoch + 1

    if end is not None and start is not None:
        end.record()
        torch.cuda.synchronize()
        wall_ms = start.elapsed_time(end)
    else:
        wall_ms = float(max_epochs * (n / BATCH_SIZE))
    return sum(curve) / len(curve), epochs_to_80, curve, wall_ms


@torch.no_grad()
def evaluate(model: nn.Module, x_test: torch.Tensor, y_test: torch.Tensor) -> Tuple[float, Dict[str, float]]:
    logits = model.forward_sequence(x_test.to(DEVICE))
    acc = accuracy_from_logits(logits, y_test.to(DEVICE))
    return acc, getattr(model, "last_debug", {})


def build_model(hypothesis_id: str) -> nn.Module:
    if hypothesis_id == "gru_baseline":
        return PlainGRU(INPUT_DIM, 64, 4).to(DEVICE)
    if hypothesis_id == "organ_only":
        return OrganOnly(INPUT_DIM, 64, 4).to(DEVICE)
    if hypothesis_id == "cyborg_minimal":
        return CyborgMinimal(INPUT_DIM, 40, 32, 4).to(DEVICE)
    raise ValueError(f"unknown hypothesis_id: {hypothesis_id}")


def run_probe(hypothesis_id: str, *, seed: int = 50) -> Tuple[CapabilityMetrics, AdaptationMetrics, InternalMetrics, Dict[str, object]]:
    seed_all(seed)
    x_train, y_train = generate_hybrid_binding_dataset(
        TRAIN_SAMPLES,
        seq_len=SEQ_LEN,
        deceptive_memory_rate=0.30,
        continuous_noise=0.18,
        switch_window=(0.45, 0.72),
    )
    x_test_id, y_test_id = generate_hybrid_binding_dataset(
        TEST_SAMPLES,
        seq_len=SEQ_LEN,
        deceptive_memory_rate=0.30,
        continuous_noise=0.18,
        switch_window=(0.45, 0.72),
    )
    x_test_ood, y_test_ood = generate_hybrid_binding_dataset(
        TEST_SAMPLES,
        seq_len=52,
        deceptive_memory_rate=0.42,
        continuous_noise=0.26,
        switch_window=(0.58, 0.85),
    )

    model = build_model(hypothesis_id)
    params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    auc, ep80, _, wall_ms = train_on_dataset(model, x_train, y_train)
    acc_id, debug_id = evaluate(model, x_test_id, y_test_id)
    acc_ood, debug_ood = evaluate(model, x_test_ood, y_test_ood)

    recovery_curve: List[float] = []
    recovery_steps = 6.0
    for epoch in range(6):
        train_on_dataset(model, x_test_ood, y_test_ood, max_epochs=1)
        acc, _ = evaluate(model, x_test_ood, y_test_ood)
        recovery_curve.append(acc)
        if acc >= 0.80 and recovery_steps == 6.0:
            recovery_steps = float(epoch + 1)

    capability = CapabilityMetrics(
        test_accuracy=acc_ood,
        epochs_to_80=ep80,
        area_under_curve=auc,
        param_count=params,
        wall_time_ms=wall_ms,
    )
    adaptation = AdaptationMetrics(
        shift_recovery_steps=recovery_steps,
        post_shift_accuracy=acc_ood,
        stabilized_accuracy=recovery_curve[-1] if recovery_curve else acc_ood,
    )
    internal = InternalMetrics(
        temperature_delta=(debug_ood.get("temperature_mean", 0.0) - debug_id.get("temperature_mean", 0.0))
        if debug_id or debug_ood
        else None,
        surprise_mean=debug_ood.get("bridge_mean"),
    )
    debug = {
        "acc_id": acc_id,
        "acc_ood": acc_ood,
        "debug_id": debug_id,
        "debug_ood": debug_ood,
        "recovery_curve": recovery_curve,
    }
    return capability, adaptation, internal, debug


def build_run(hypothesis_id: str, family: str, *, seed: int = 50) -> HypothesisRun:
    capability, adaptation, internal, debug = run_probe(hypothesis_id, seed=seed)
    return HypothesisRun(
        hypothesis_id=hypothesis_id,
        family=family,
        task_id="exp50_hybrid_binding_memory_plus_regime",
        capability=capability,
        adaptation=adaptation,
        internal=internal,
        notes=json.dumps(debug),
    )


def main() -> Dict[str, object]:
    baseline = build_run("gru_baseline", "baseline")
    candidates = [
        build_run("organ_only", "continuous_organ"),
        build_run("cyborg_minimal", "v28_cyborg_minimal"),
    ]
    report = save_protocol_report(REPORT_PATH, baseline, candidates)
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
