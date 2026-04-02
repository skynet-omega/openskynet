"""
Exp39: EX Hypothesis OOD Benchmark
==================================

Second-pass benchmark for EX-derived hypotheses.

Goal:
- give spectral-style memory a legitimate chance
- test mechanisms under out-of-distribution sequence length
- keep the experiment small and falsable

Hypotheses:
1. gru_baseline
2. gru_adaptive_decay
3. gru_spectral_memory

Tasks:
1. Long-context recall with decoy cues
2. Periodic regime classification (ID train, OOD long test)
3. Catastrophic forgetting probe (reused from Exp38)
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Dict, List, Tuple

import torch

from ex_hypothesis_protocol import (
    CapabilityMetrics,
    HypothesisRun,
    RetentionMetrics,
    save_protocol_report,
)
from exp38_ex_hypothesis_benchmark import (
    evaluate,
    generate_forgetting_task,
    seed_all,
    train_on_dataset,
)
from ex_hypothesis_components import INPUT_DIM, build_model


DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
LOG_DIR = Path(__file__).parent
REPORT_PATH = LOG_DIR / "exp39_ex_hypothesis_ood_benchmark.json"


def generate_long_context_decoy_dataset(
    n_samples: int,
    *,
    seq_len: int,
    decoy_rate: float = 0.15,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    A single early cue determines the label.
    Many middle decoys try to overwrite the memory.
    Final query asks for the original cue.
    """
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.05
    cue = torch.randint(0, 2, (n_samples,))

    # Real cue at the beginning.
    x[:, 0, 0] = cue.float() * 2.0 - 1.0
    x[:, 0, 1] = 1.0

    # Distractors in the middle.
    for t in range(1, seq_len - 1):
        x[:, t, 2:6] += torch.randn(n_samples, 4) * 0.45
        decoy_mask = torch.rand(n_samples) < decoy_rate
        false_cue = torch.randint(0, 2, (n_samples,))
        x[decoy_mask, t, 0] = false_cue[decoy_mask].float() * 2.0 - 1.0
        x[decoy_mask, t, 6] = 1.0
        x[:, t, 7] += torch.sin(torch.full((n_samples,), t / 3.0))

    # Final query token.
    x[:, -1, 10] = 1.0
    x[:, -1, 11] = cue.float() * 1.2 - 0.6
    y = cue.long()
    return x, y


def generate_periodic_regime_dataset(
    n_samples: int,
    *,
    seq_len: int,
    periods: Tuple[int, int] = (4, 9),
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Two regimes with different latent periodicity.
    Train on shorter sequences, test on much longer ones.
    """
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.04
    y = torch.randint(0, 2, (n_samples,))

    for i in range(n_samples):
        period = periods[y[i].item()]
        phase = torch.rand(1).item() * 2 * math.pi
        amplitude = 0.7 + torch.rand(1).item() * 0.3
        for t in range(seq_len):
            signal = amplitude * math.sin((2 * math.pi * t / period) + phase)
            harmonic = 0.5 * amplitude * math.cos((2 * math.pi * t / (period * 2)) + phase)
            x[i, t, 0] += signal
            x[i, t, 1] += harmonic
            x[i, t, 2] += signal * harmonic

            # Decoy bursts unrelated to the true regime.
            if t % 11 == 0:
                x[i, t, 4:8] += torch.randn(4) * 0.6

            # Small drift to punish naive memorization of short windows.
            x[i, t, 8] += (t / seq_len) * 0.2
            x[i, t, 9] += ((seq_len - t) / seq_len) * 0.1

    return x, y.long()


def run_long_context_probe(hypothesis_id: str) -> Dict[str, float]:
    seed_all(202)
    model = build_model(hypothesis_id)

    x_train, y_train = generate_long_context_decoy_dataset(768, seq_len=24)
    x_test_id, y_test_id = generate_long_context_decoy_dataset(256, seq_len=24)
    x_test_ood, y_test_ood = generate_long_context_decoy_dataset(256, seq_len=96)

    auc, ep80, _, wall_ms = train_on_dataset(model, x_train, y_train, max_epochs=14)
    acc_id = evaluate(model, x_test_id, y_test_id)
    acc_ood = evaluate(model, x_test_ood, y_test_ood)
    return {
        "acc_id": acc_id,
        "acc_ood": acc_ood,
        "epochs_to_80": ep80,
        "auc": auc,
        "wall_time_ms": wall_ms,
    }


def run_periodic_probe(hypothesis_id: str) -> Dict[str, float]:
    seed_all(303)
    model = build_model(hypothesis_id)

    x_train, y_train = generate_periodic_regime_dataset(768, seq_len=32)
    x_test_id, y_test_id = generate_periodic_regime_dataset(256, seq_len=32)
    x_test_ood, y_test_ood = generate_periodic_regime_dataset(256, seq_len=96)

    auc, ep80, _, wall_ms = train_on_dataset(model, x_train, y_train, max_epochs=14)
    acc_id = evaluate(model, x_test_id, y_test_id)
    acc_ood = evaluate(model, x_test_ood, y_test_ood)
    return {
        "acc_id": acc_id,
        "acc_ood": acc_ood,
        "epochs_to_80": ep80,
        "auc": auc,
        "wall_time_ms": wall_ms,
    }


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


def build_run(hypothesis_id: str, family: str) -> HypothesisRun:
    long_probe = run_long_context_probe(hypothesis_id)
    periodic_probe = run_periodic_probe(hypothesis_id)
    retention = run_forgetting_probe(hypothesis_id)

    capability = CapabilityMetrics(
        test_accuracy=(long_probe["acc_ood"] + periodic_probe["acc_ood"]) / 2.0,
        epochs_to_80=(long_probe["epochs_to_80"] + periodic_probe["epochs_to_80"]) / 2.0,
        area_under_curve=(long_probe["auc"] + periodic_probe["auc"]) / 2.0,
        param_count=sum(p.numel() for p in build_model(hypothesis_id).parameters() if p.requires_grad),
        wall_time_ms=long_probe["wall_time_ms"] + periodic_probe["wall_time_ms"],
    )

    notes = {
        "long_context": long_probe,
        "periodic_regime": periodic_probe,
    }

    return HypothesisRun(
        hypothesis_id=hypothesis_id,
        family=family,
        task_id="exp39_ood_long_context_plus_periodic_regime",
        capability=capability,
        retention=retention,
        notes=json.dumps(notes),
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
