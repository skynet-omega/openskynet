"""
Exp40: Adaptive Decay Component vs Fixed Memory
==============================================

This is the first serious check for replacing mediocre memory logic.

Compare:
1. gru_fixed_decay       -> one alpha for every state and context
2. gru_adaptive_decay    -> retention modulated by local flux

Tasks:
1. Catastrophic forgetting
2. Regime-switch adaptation

If adaptive decay wins on at least one axis with similar cost,
it deserves to stay alive as a reusable component.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Tuple

import torch

from ex_hypothesis_protocol import (
    AdaptationMetrics,
    CapabilityMetrics,
    HypothesisRun,
    RetentionMetrics,
    save_protocol_report,
)
from ex_hypothesis_components import DEVICE, INPUT_DIM, build_model
from exp38_ex_hypothesis_benchmark import evaluate, generate_forgetting_task, seed_all, train_on_dataset


REPORT_PATH = Path(__file__).with_name("exp40_adaptive_decay_component.json")


def generate_stable_regime_dataset(n_samples: int, *, seq_len: int = 20) -> Tuple[torch.Tensor, torch.Tensor]:
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.04
    y = torch.randint(0, 2, (n_samples,))
    for i in range(n_samples):
        if y[i].item() == 0:
            x[i, :, 0] += torch.sin(torch.linspace(0, 3.14, seq_len)) * 0.45
            x[i, :, 1] += 0.18
        else:
            x[i, :, 0] += torch.cos(torch.linspace(0, 6.28, seq_len)) * 0.35
            x[i, :, 1] -= 0.18
        x[i, :, 2:4] += torch.randn(seq_len, 2) * 0.22
    return x, y.long()


def generate_switch_regime_dataset(n_samples: int, *, seq_len: int = 20, switch_at: int = 10) -> Tuple[torch.Tensor, torch.Tensor]:
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.05
    y = torch.randint(0, 2, (n_samples,))
    old = 1 - y
    for i in range(n_samples):
        for t in range(seq_len):
            regime = old[i].item() if t < switch_at else y[i].item()
            if regime == 0:
                x[i, t, 0] += 0.65 if t < switch_at else 0.18
                x[i, t, 1] += 0.18 * torch.sin(torch.tensor(t / 2))
            else:
                x[i, t, 0] -= 0.65 if t < switch_at else 0.18
                x[i, t, 1] += 0.18 * torch.cos(torch.tensor(t / 2))

            if t < switch_at:
                x[i, t, 4] += 0.55
            else:
                x[i, t, 5] += 0.12

            x[i, t, 6:8] += torch.randn(2) * 0.24
            # Decoy memory tag: strong old-regime reminder close to the end.
            if t == seq_len - 3:
                x[i, t, 9] += 0.7 if old[i].item() == 0 else -0.7
            # Weak truth token only at the very end.
            if t == seq_len - 1:
                x[i, t, 10] += 0.25 if y[i].item() == 0 else -0.25
    return x, y.long()


def run_forgetting_probe(hypothesis_id: str) -> RetentionMetrics:
    seed_all(404)
    model = build_model(hypothesis_id)
    x_a_train, y_a_train = generate_forgetting_task(0, 512)
    x_a_test, y_a_test = generate_forgetting_task(0, 256)
    x_b_train, y_b_train = generate_forgetting_task(1, 512)
    x_b_test, y_b_test = generate_forgetting_task(1, 256)

    train_on_dataset(model, x_a_train, y_a_train, max_epochs=10)
    acc_a_after_a = evaluate(model, x_a_test, y_a_test)

    train_on_dataset(model, x_b_train, y_b_train, max_epochs=10)
    _ = evaluate(model, x_b_test, y_b_test)
    acc_a_after_b = evaluate(model, x_a_test, y_a_test)
    forgetting = max(0.0, acc_a_after_a - acc_a_after_b)
    return RetentionMetrics(
        task_a_after_a=acc_a_after_a,
        task_a_after_b=acc_a_after_b,
        forgetting=forgetting,
    )


def run_regime_shift_probe(hypothesis_id: str) -> Tuple[CapabilityMetrics, AdaptationMetrics, Dict[str, List[float]]]:
    seed_all(505)
    model = build_model(hypothesis_id)
    params = sum(p.numel() for p in model.parameters() if p.requires_grad)

    x_stable_train, y_stable_train = generate_stable_regime_dataset(768, seq_len=24)
    x_stable_test, y_stable_test = generate_stable_regime_dataset(256, seq_len=24)
    auc, ep80, stable_curve, wall_ms = train_on_dataset(model, x_stable_train, y_stable_train, max_epochs=10)
    stable_acc = evaluate(model, x_stable_test, y_stable_test)

    x_shift_train, y_shift_train = generate_switch_regime_dataset(768, seq_len=24, switch_at=16)
    x_shift_test, y_shift_test = generate_switch_regime_dataset(256, seq_len=24, switch_at=16)

    optimizer_epochs: List[float] = []
    shift_recovery_steps = 10.0
    for epoch in range(10):
        train_on_dataset(model, x_shift_train, y_shift_train, max_epochs=1)
        acc = evaluate(model, x_shift_test, y_shift_test)
        optimizer_epochs.append(acc)
        if acc >= 0.80 and shift_recovery_steps == 10.0:
            shift_recovery_steps = float(epoch + 1)

    post_shift_accuracy = optimizer_epochs[0]
    stabilized_accuracy = optimizer_epochs[-1]

    capability = CapabilityMetrics(
        test_accuracy=stable_acc,
        epochs_to_80=ep80,
        area_under_curve=auc,
        param_count=params,
        wall_time_ms=wall_ms,
    )
    adaptation = AdaptationMetrics(
        shift_recovery_steps=shift_recovery_steps,
        post_shift_accuracy=post_shift_accuracy,
        stabilized_accuracy=stabilized_accuracy,
    )
    return capability, adaptation, {"shift_curve": optimizer_epochs}


def build_run(hypothesis_id: str, family: str) -> HypothesisRun:
    capability, adaptation, debug = run_regime_shift_probe(hypothesis_id)
    retention = run_forgetting_probe(hypothesis_id)
    return HypothesisRun(
        hypothesis_id=hypothesis_id,
        family=family,
        task_id="exp40_fixed_decay_vs_adaptive_decay",
        capability=capability,
        adaptation=adaptation,
        retention=retention,
        notes=json.dumps(debug),
    )


def main() -> Dict[str, object]:
    baseline = build_run("gru_fixed_decay", "fixed_decay")
    candidates = [build_run("gru_adaptive_decay", "adaptive_decay")]
    report = save_protocol_report(REPORT_PATH, baseline, candidates)
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
