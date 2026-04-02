"""
Exp38: EX Hypothesis Benchmark
==============================

A small shared protocol for three distilled hypotheses from EX:

1. GRU baseline
2. GRU + adaptive local decay
3. GRU + spectral memory

This benchmark does not try to prove "new brain achieved".
It asks a narrower question:

Do any of these mechanisms show empirical value on:
- delayed dependency
- catastrophic forgetting

Output:
- JSON report compatible with ex_hypothesis_protocol.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Dict, List, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

from ex_hypothesis_protocol import (
    CapabilityMetrics,
    HypothesisRun,
    RetentionMetrics,
    save_protocol_report,
)
from ex_hypothesis_components import (
    DEVICE,
    HIDDEN_DIM,
    INPUT_DIM,
    build_model,
)


LOG_DIR = Path(__file__).parent
REPORT_PATH = LOG_DIR / "exp38_ex_hypothesis_benchmark.json"
SEQ_LEN = 18
BATCH_SIZE = 64
TRAIN_SAMPLES = 768
TEST_SAMPLES = 256
MAX_EPOCHS = 16
LR = 2e-3
WEIGHT_DECAY = 1e-4


def seed_all(seed: int) -> None:
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def generate_delayed_dependency_dataset(n_samples: int, seq_len: int = SEQ_LEN) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Step 0 contains the relevant bit.
    Final label depends on whether the last query matches that early cue.
    Distractors occupy the middle of the sequence.
    """
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.06
    cue = torch.randint(0, 2, (n_samples,))

    x[:, 0, 0] = cue.float() * 2.0 - 1.0
    x[:, 0, 1] = 1.0

    for t in range(1, seq_len - 1):
        x[:, t, 2:6] += torch.randn(n_samples, 4) * 0.45

    x[:, -1, 6] = 1.0
    x[:, -1, 7] = cue.float() * 1.5 - 0.75
    y = cue.long()
    return x, y


def generate_forgetting_task(task_id: int, n_samples: int) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Two linearly separable but different tasks.
    The point is not difficulty, but retention under sequential training.
    """
    x = torch.randn(n_samples, 1, INPUT_DIM) * 0.08
    if task_id == 0:
        x[:, 0, 0] += torch.randn(n_samples) * 0.2
        x[:, 0, 1] += torch.randn(n_samples) * 0.2
        y = ((x[:, 0, 0] + x[:, 0, 1]) > 0).long()
    else:
        x[:, 0, 4] += torch.randn(n_samples) * 0.2
        x[:, 0, 5] += torch.randn(n_samples) * 0.2
        y = ((x[:, 0, 4] - x[:, 0, 5]) > 0).long()
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
    n = x_train.shape[0]
    curve: List[float] = []
    epochs_to_80 = max_epochs
    start = time.perf_counter()

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

    elapsed_ms = (time.perf_counter() - start) * 1000.0
    auc = sum(curve) / len(curve)
    return auc, epochs_to_80, curve, elapsed_ms


@torch.no_grad()
def evaluate(model: nn.Module, x_test: torch.Tensor, y_test: torch.Tensor) -> float:
    logits = model.forward_sequence(x_test.to(DEVICE))
    return accuracy_from_logits(logits, y_test.to(DEVICE))


def run_delayed_dependency(hypothesis_id: str) -> Tuple[CapabilityMetrics, Dict[str, float]]:
    seed_all(42)
    model = build_model(hypothesis_id)
    x_train, y_train = generate_delayed_dependency_dataset(TRAIN_SAMPLES)
    x_test, y_test = generate_delayed_dependency_dataset(TEST_SAMPLES)
    auc, ep80, _, wall_ms = train_on_dataset(model, x_train, y_train)
    test_acc = evaluate(model, x_test, y_test)
    params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    capability = CapabilityMetrics(
        test_accuracy=test_acc,
        epochs_to_80=ep80,
        area_under_curve=auc,
        param_count=params,
        wall_time_ms=wall_ms,
    )
    return capability, {"delayed_accuracy": test_acc}


def run_forgetting(hypothesis_id: str) -> RetentionMetrics:
    seed_all(123)
    model = build_model(hypothesis_id)
    x_a_train, y_a_train = generate_forgetting_task(0, 512)
    x_a_test, y_a_test = generate_forgetting_task(0, 256)
    x_b_train, y_b_train = generate_forgetting_task(1, 512)
    x_b_test, y_b_test = generate_forgetting_task(1, 256)

    train_on_dataset(model, x_a_train, y_a_train, max_epochs=10)
    acc_a_after_a = evaluate(model, x_a_test, y_a_test)

    train_on_dataset(model, x_b_train, y_b_train, max_epochs=10)
    acc_b = evaluate(model, x_b_test, y_b_test)
    acc_a_after_b = evaluate(model, x_a_test, y_a_test)
    forgetting = max(0.0, acc_a_after_a - acc_a_after_b)
    return RetentionMetrics(
        task_a_after_a=acc_a_after_a,
        task_a_after_b=acc_a_after_b,
        forgetting=forgetting,
    )


def build_run(hypothesis_id: str, family: str) -> HypothesisRun:
    capability, delayed_debug = run_delayed_dependency(hypothesis_id)
    retention = run_forgetting(hypothesis_id)
    return HypothesisRun(
        hypothesis_id=hypothesis_id,
        family=family,
        task_id="exp38_delayed_dependency_plus_forgetting",
        capability=capability,
        retention=retention,
        notes=(
            "Combined probe: delayed dependency drives capability; forgetting probe drives retention. "
            f"debug={delayed_debug}"
        ),
    )


def main() -> Dict[str, object]:
    baseline = build_run("gru_baseline", "baseline")
    candidates = [
        build_run("gru_adaptive_decay", "adaptive_decay"),
        build_run("gru_spectral_memory", "spectral_memory"),
    ]
    report = save_protocol_report(REPORT_PATH, baseline, candidates)
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
