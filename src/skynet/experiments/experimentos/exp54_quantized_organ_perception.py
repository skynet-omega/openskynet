"""
Exp54: Quantized Organ Perception
=================================

Test whether the existing V28 `GeometricQuantizer` helps
an organ-like spatial processor downstream.

We reuse:
- `GeometricQuantizer` from V28
- `TrapezoidalResonance` from `V28_PHYSICAL_CORE`
"""

from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path
from typing import Callable, Dict, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "EX"))

from SKYNET_V28_PHYSICAL_CYBORG import GeometricQuantizer
from V28_PHYSICAL_CORE import TrapezoidalResonance


DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
REPORT_PATH = Path(__file__).with_name("exp54_quantized_organ_perception.json")
BATCH_SIZE = 64
MAX_EPOCHS = 10
LR = 2e-3
WEIGHT_DECAY = 1e-4
TARGET_SIZE = 30


def seed_all(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def pattern_bank() -> Dict[str, torch.Tensor]:
    bank: Dict[str, torch.Tensor] = {}

    dot = torch.zeros(1, 1, 3, 3)
    dot[0, 0, 1, 1] = 1.0
    bank["center_dot"] = dot

    horiz = torch.zeros(1, 1, 3, 3)
    horiz[0, 0, 1, :] = 1.0
    bank["horizontal_line"] = horiz

    corner_l = torch.zeros(1, 1, 3, 3)
    corner_l[0, 0, :, 0] = 1.0
    corner_l[0, 0, 2, :] = 1.0
    bank["corner_L"] = corner_l

    diag = torch.zeros(1, 1, 3, 3)
    diag[0, 0, 0, 0] = 1.0
    diag[0, 0, 1, 1] = 1.0
    diag[0, 0, 2, 2] = 1.0
    bank["diagonal"] = diag

    pair = torch.zeros(1, 1, 3, 3)
    pair[0, 0, 0, 1] = 1.0
    pair[0, 0, 2, 1] = 1.0
    bank["double_dot"] = pair
    return bank


def nearest_scale(x_small: torch.Tensor) -> torch.Tensor:
    return F.interpolate(x_small, size=(TARGET_SIZE, TARGET_SIZE), mode="nearest")


def bilinear_scale(x_small: torch.Tensor) -> torch.Tensor:
    return F.interpolate(x_small, size=(TARGET_SIZE, TARGET_SIZE), mode="bilinear", align_corners=False)


def quantized_scale(x_small: torch.Tensor, quantizer: GeometricQuantizer) -> torch.Tensor:
    return quantizer(x_small, target_size=(TARGET_SIZE, TARGET_SIZE))


class OrganPerceptionNet(nn.Module):
    def __init__(self, n_classes: int) -> None:
        super().__init__()
        self.in_proj = nn.Conv2d(1, 8, kernel_size=3, padding=1)
        self.organ = TrapezoidalResonance(8, iterations=3)
        self.pool = nn.AdaptiveAvgPool2d((4, 4))
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Linear(8 * 4 * 4, 64),
            nn.GELU(),
            nn.Linear(64, n_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = torch.tanh(self.in_proj(x))
        h = self.organ(h)
        h = self.pool(h)
        return self.head(h)


def augment(field: torch.Tensor, *, noise: float, blur_mix: float, max_shift: int, erase_prob: float) -> torch.Tensor:
    x = field.clone()
    if max_shift > 0:
        dy = random.randint(-max_shift, max_shift)
        dx = random.randint(-max_shift, max_shift)
        x = torch.roll(x, shifts=(dy, dx), dims=(-2, -1))
    if blur_mix > 0.0:
        base = x
        kernel = torch.tensor([[[[1, 2, 1], [2, 4, 2], [1, 2, 1]]]], dtype=x.dtype, device=x.device) / 16.0
        x = F.conv2d(F.pad(x, (1, 1, 1, 1), mode="replicate"), kernel)
        x = (1.0 - blur_mix) * base + blur_mix * x
    if random.random() < erase_prob:
        top = random.randint(0, TARGET_SIZE - 6)
        left = random.randint(0, TARGET_SIZE - 6)
        x[:, :, top : top + 6, left : left + 6] *= 0.0
    if noise > 0.0:
        x = x + torch.randn_like(x) * noise
    return x.clamp(0.0, 1.0)


def build_dataset(
    scaler_name: str,
    *,
    n_samples: int,
    noise: float,
    blur_mix: float,
    max_shift: int,
    erase_prob: float,
) -> Tuple[torch.Tensor, torch.Tensor]:
    quantizer = GeometricQuantizer()
    bank = list(pattern_bank().items())
    x = torch.zeros(n_samples, 1, TARGET_SIZE, TARGET_SIZE)
    y = torch.zeros(n_samples, dtype=torch.long)

    scaler_map = {
        "nearest": nearest_scale,
        "bilinear": bilinear_scale,
        "quantized": lambda z: quantized_scale(z, quantizer),
    }
    scaler = scaler_map[scaler_name]

    for i in range(n_samples):
        label = i % len(bank)
        _, pattern = bank[label]
        field = scaler(pattern)
        x[i] = augment(field, noise=noise, blur_mix=blur_mix, max_shift=max_shift, erase_prob=erase_prob)
        y[i] = label
    perm = torch.randperm(n_samples)
    return x[perm], y[perm]


def train_and_eval(scaler_name: str, *, seed: int = 54) -> Dict[str, float]:
    seed_all(seed)
    model = OrganPerceptionNet(n_classes=len(pattern_bank())).to(DEVICE)
    x_train, y_train = build_dataset(
        scaler_name,
        n_samples=240,
        noise=0.08,
        blur_mix=0.18,
        max_shift=2,
        erase_prob=0.10,
    )
    x_test, y_test = build_dataset(
        scaler_name,
        n_samples=320,
        noise=0.22,
        blur_mix=0.35,
        max_shift=4,
        erase_prob=0.25,
    )

    opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    criterion = nn.CrossEntropyLoss()

    for _ in range(MAX_EPOCHS):
        perm = torch.randperm(x_train.shape[0])
        for i in range(0, x_train.shape[0], BATCH_SIZE):
            idx = perm[i : i + BATCH_SIZE]
            xb = x_train[idx].to(DEVICE)
            yb = y_train[idx].to(DEVICE)
            logits = model(xb)
            loss = criterion(logits, yb)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()

    with torch.no_grad():
        logits = model(x_test.to(DEVICE))
        acc = (logits.argmax(dim=-1) == y_test.to(DEVICE)).float().mean().item()
    return {"acc_ood": acc}


def main() -> Dict[str, object]:
    results = {name: train_and_eval(name) for name in ("nearest", "bilinear", "quantized")}
    best = max(results.items(), key=lambda kv: kv[1]["acc_ood"])[0]
    report = {
        "experiment": "exp54_quantized_organ_perception",
        "results": results,
        "best": best,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
