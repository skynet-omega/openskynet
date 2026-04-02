"""
Exp43: Rule vs Adaptive Continuity
==================================

Compare a rigid threshold rule against sequence models on a continuity-style
task with noisy observations. The label is derived from hidden state, while the
baseline rule only sees the final observed continuity proxy.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Dict, List, Tuple

import torch

from ex_hypothesis_components import DEVICE, INPUT_DIM, build_model
from exp38_ex_hypothesis_benchmark import evaluate, train_on_dataset
from exp41_runtime_continuity_benchmark import MODE_COUNT


REPORT_PATH = Path(__file__).with_name("exp43_rule_vs_adaptive_continuity.json")
LABEL_COUNT = 3


def seed_all(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def hidden_commitment_label(hidden_continuity: float, hidden_mode: int) -> int:
    if hidden_continuity < 0.55 or hidden_mode == 2:
        return 2
    if hidden_mode == 1:
        return 1
    return 0


def observed_rule_label(observed_continuity: float, observed_mode: int) -> int:
    if observed_continuity < 0.55 or observed_mode == 2:
        return 2
    if observed_mode == 1:
        return 1
    return 0


def generate_noisy_runtime_dataset(
    n_samples: int,
    *,
    seq_len: int,
    interruption_rate: float,
    deceptive_shift_rate: float,
    observation_noise: float,
) -> Tuple[torch.Tensor, torch.Tensor]:
    x = torch.zeros(n_samples, seq_len, INPUT_DIM)
    y = torch.zeros(n_samples, dtype=torch.long)

    for i in range(n_samples):
        hidden_focus = random.randrange(3)
        hidden_mode = 0
        hidden_focus_streak = 1
        hidden_mode_shift_count = 0
        hidden_retained_ratio = 1.0
        prior_hidden_focus = hidden_focus
        prior_hidden_mode = hidden_mode
        observed_continuity = 1.0

        for t in range(seq_len):
            focus_changed = False
            deceptive = False

            if t > 0 and random.random() < deceptive_shift_rate:
                hidden_focus = random.randrange(3)
                focus_changed = hidden_focus != prior_hidden_focus
                deceptive = True

            if t > 0 and random.random() < 0.18:
                hidden_mode = random.randrange(MODE_COUNT)

            interruption = 1.0 if random.random() < interruption_rate else 0.0

            if hidden_focus == prior_hidden_focus:
                hidden_focus_streak += 1
            else:
                hidden_focus_streak = 1

            if hidden_mode != prior_hidden_mode:
                hidden_mode_shift_count += 1

            if interruption > 0:
                hidden_retained_ratio = max(
                    0.2,
                    hidden_retained_ratio - random.uniform(0.10, 0.25),
                )
            elif not deceptive:
                hidden_retained_ratio = min(
                    1.0,
                    hidden_retained_ratio + random.uniform(0.02, 0.07),
                )

            same_mode = hidden_mode == prior_hidden_mode
            hidden_continuity = max(
                0.0,
                min(
                    1.0,
                    0.34
                    + min(hidden_focus_streak, 4) * 0.13
                    + hidden_retained_ratio * 0.24
                    + (0.08 if same_mode else 0.0)
                    - min(hidden_mode_shift_count, 4) * 0.05,
                ),
            )

            # Observed proxy is noisy and sometimes adversarially biased near the end.
            noisy_continuity = hidden_continuity + random.gauss(0.0, observation_noise)
            if deceptive and t >= seq_len - 3:
                noisy_continuity -= random.uniform(0.12, 0.25)
            observed_continuity = max(0.0, min(1.0, noisy_continuity))

            step = torch.zeros(INPUT_DIM)
            step[hidden_focus] = 1.0
            step[3 + hidden_mode] = 1.0
            step[6] = 1.0 if focus_changed else 0.0
            step[7] = observed_continuity
            step[8] = interruption
            step[9] = 1.0 if deceptive else 0.0
            step[10] = observed_continuity
            step[11] = t / max(1, seq_len - 1)
            x[i, t] = step

            prior_hidden_focus = hidden_focus
            prior_hidden_mode = hidden_mode

        y[i] = hidden_commitment_label(hidden_continuity, hidden_mode)

    return x, y


def evaluate_rule(x: torch.Tensor, y: torch.Tensor) -> float:
    correct = 0
    for i in range(x.shape[0]):
        last = x[i, -1]
        observed_mode = int(torch.argmax(last[3:6]).item())
        observed_continuity = float(last[10].item())
        pred = observed_rule_label(observed_continuity, observed_mode)
        correct += int(pred == int(y[i].item()))
    return correct / max(1, y.shape[0])


def run_model_probe(hypothesis_id: str) -> Dict[str, float]:
    model = build_model(hypothesis_id)
    if hasattr(model, "head") and model.head.out_features != LABEL_COUNT:
        in_features = model.head.in_features
        model.head = torch.nn.Linear(in_features, LABEL_COUNT).to(DEVICE)

    x_train, y_train = generate_noisy_runtime_dataset(
        960,
        seq_len=18,
        interruption_rate=0.16,
        deceptive_shift_rate=0.10,
        observation_noise=0.07,
    )
    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        256,
        seq_len=18,
        interruption_rate=0.16,
        deceptive_shift_rate=0.10,
        observation_noise=0.07,
    )
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        256,
        seq_len=42,
        interruption_rate=0.26,
        deceptive_shift_rate=0.22,
        observation_noise=0.10,
    )

    train_on_dataset(model, x_train, y_train, max_epochs=12)
    return {
        "acc_id": evaluate(model, x_test_id, y_test_id),
        "acc_ood": evaluate(model, x_test_ood, y_test_ood),
    }


def main() -> Dict[str, object]:
    seed_all(4242)

    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        256,
        seq_len=18,
        interruption_rate=0.16,
        deceptive_shift_rate=0.10,
        observation_noise=0.07,
    )
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        256,
        seq_len=42,
        interruption_rate=0.26,
        deceptive_shift_rate=0.22,
        observation_noise=0.10,
    )

    rule = {
        "acc_id": evaluate_rule(x_test_id, y_test_id),
        "acc_ood": evaluate_rule(x_test_ood, y_test_ood),
    }
    fixed = run_model_probe("gru_fixed_decay")
    adaptive = run_model_probe("gru_adaptive_decay")

    report = {
        "experiment": "exp43_rule_vs_adaptive_continuity",
        "rule_baseline": rule,
        "gru_fixed_decay": fixed,
        "gru_adaptive_decay": adaptive,
        "delta_vs_rule": {
            "fixed_acc_ood": fixed["acc_ood"] - rule["acc_ood"],
            "adaptive_acc_ood": adaptive["acc_ood"] - rule["acc_ood"],
            "adaptive_vs_fixed_acc_ood": adaptive["acc_ood"] - fixed["acc_ood"],
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
