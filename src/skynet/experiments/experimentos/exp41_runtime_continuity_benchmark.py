"""
Exp41: Runtime Continuity Benchmark
==================================

Domain-shaped probe for OpenSkyNet-like event streams.

Compare:
1. gru_fixed_decay
2. gru_adaptive_decay

Question:
Can adaptive retention help when the system must track focus, mode shifts,
interruptions, and recover enough state to predict the correct commitment kind?

Labels:
- commitment kind: artifact / reframe / stabilize

OOD stress:
- longer sequences
- more interruptions
- more deceptive focus shifts
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Dict, List, Tuple

import torch
import torch.nn.functional as F

from ex_hypothesis_protocol import (
    AdaptationMetrics,
    CapabilityMetrics,
    HypothesisRun,
    save_protocol_report,
)
from ex_hypothesis_components import DEVICE, INPUT_DIM, build_model
from exp38_ex_hypothesis_benchmark import evaluate, train_on_dataset


REPORT_PATH = Path(__file__).with_name("exp41_runtime_continuity_benchmark.json")

FOCUS_COUNT = 3
MODE_COUNT = 3  # explore / reframe / stabilize
LABEL_COUNT = 3  # artifact / reframe / stabilize


def seed_all(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def derive_commitment_label(*, continuity_score: float, mode: int) -> int:
    # Mirrors the high-level logic in skynet commitment/runtime authority.
    if continuity_score < 0.55 or mode == 2:
        return 2  # stabilize
    if mode == 1:
        return 1  # reframe
    return 0  # artifact


def generate_runtime_continuity_dataset(
    n_samples: int,
    *,
    seq_len: int,
    interruption_rate: float,
    deceptive_shift_rate: float,
) -> Tuple[torch.Tensor, torch.Tensor]:
    """
    Event stream features:
    - focus id one-hot
    - mode id one-hot
    - focus change flag
    - retained item ratio proxy
    - interruption intensity
    - deceptive shift intensity
    - cycle progress
    """
    x = torch.zeros(n_samples, seq_len, INPUT_DIM)
    y = torch.zeros(n_samples, dtype=torch.long)

    for i in range(n_samples):
        focus = random.randrange(FOCUS_COUNT)
        mode = 0
        focus_streak = 0
        mode_shift_count = 0
        retained_ratio = 1.0
        current_item_ids = {0, 1, 2}
        prior_focus = focus
        prior_mode = mode

        for t in range(seq_len):
            focus_changed = False
            deceptive = False

            if t > 0 and random.random() < deceptive_shift_rate:
                focus = random.randrange(FOCUS_COUNT)
                focus_changed = focus != prior_focus
                deceptive = True

            if t > 0 and random.random() < 0.18:
                mode = random.randrange(MODE_COUNT)
            else:
                mode = prior_mode

            interruption = 1.0 if random.random() < interruption_rate else 0.0

            if focus == prior_focus:
                focus_streak += 1
            else:
                focus_streak = 1

            if mode != prior_mode:
                mode_shift_count += 1

            if interruption > 0:
                retained_ratio = max(0.25, retained_ratio - random.uniform(0.08, 0.22))
            elif not deceptive:
                retained_ratio = min(1.0, retained_ratio + random.uniform(0.02, 0.08))

            same_mode = mode == prior_mode
            continuity_score = max(
                0.0,
                min(
                    1.0,
                    0.35
                    + min(focus_streak, 4) * 0.12
                    + retained_ratio * 0.22
                    + (0.1 if same_mode else 0.0)
                    - min(mode_shift_count, 4) * 0.04,
                ),
            )

            step = torch.zeros(INPUT_DIM)
            step[focus] = 1.0
            step[3 + mode] = 1.0
            step[6] = 1.0 if focus_changed else 0.0
            step[7] = retained_ratio
            step[8] = interruption
            step[9] = 1.0 if deceptive else 0.0
            step[10] = continuity_score
            step[11] = t / max(1, seq_len - 1)

            x[i, t] = step
            prior_focus = focus
            prior_mode = mode

        y[i] = derive_commitment_label(continuity_score=continuity_score, mode=mode)

    return x, y


def run_probe(
    hypothesis_id: str,
    *,
    seed: int = 909,
) -> Tuple[CapabilityMetrics, AdaptationMetrics, Dict[str, float]]:
    seed_all(seed)
    x_train, y_train = generate_runtime_continuity_dataset(
        768,
        seq_len=18,
        interruption_rate=0.16,
        deceptive_shift_rate=0.10,
    )
    x_test_id, y_test_id = generate_runtime_continuity_dataset(
        256,
        seq_len=18,
        interruption_rate=0.16,
        deceptive_shift_rate=0.10,
    )
    x_test_ood, y_test_ood = generate_runtime_continuity_dataset(
        256,
        seq_len=42,
        interruption_rate=0.26,
        deceptive_shift_rate=0.20,
    )

    # Need 3-class heads, so rebuild with 3 outputs.
    model = build_model(hypothesis_id)
    if hasattr(model, "head") and model.head.out_features != LABEL_COUNT:
        in_features = model.head.in_features
        model.head = torch.nn.Linear(in_features, LABEL_COUNT).to(DEVICE)
    params = sum(p.numel() for p in model.parameters() if p.requires_grad)

    auc, ep80, _, wall_ms = train_on_dataset(model, x_train, y_train, max_epochs=12)
    acc_id = evaluate(model, x_test_id, y_test_id)
    acc_ood = evaluate(model, x_test_ood, y_test_ood)

    # Measure recovery by fine-tuning from ID-trained state on OOD data in 1-epoch increments.
    recovery_curve: List[float] = []
    recovery_steps = 6.0
    for epoch in range(6):
        train_on_dataset(model, x_train=x_test_ood, y_train=y_test_ood, max_epochs=1)
        acc = evaluate(model, x_test_ood, y_test_ood)
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
    return capability, adaptation, {"acc_id": acc_id, "acc_ood": acc_ood, "recovery_curve": recovery_curve}


def build_run(hypothesis_id: str, family: str, *, seed: int = 909) -> HypothesisRun:
    capability, adaptation, debug = run_probe(hypothesis_id, seed=seed)
    return HypothesisRun(
        hypothesis_id=hypothesis_id,
        family=family,
        task_id="exp41_runtime_continuity_commitment_prediction",
        capability=capability,
        adaptation=adaptation,
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
