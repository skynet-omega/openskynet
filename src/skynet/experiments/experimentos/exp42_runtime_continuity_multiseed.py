"""
Exp42: Runtime Continuity Multi-Seed Validation
===============================================

Repeat Exp41 across multiple seeds to test whether the adaptive-decay win is
stable or just a lucky run.
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path
from typing import Dict, List

from exp41_runtime_continuity_benchmark import run_probe


REPORT_PATH = Path(__file__).with_name("exp42_runtime_continuity_multiseed.json")
SEEDS = [101, 202, 303, 404, 505]


def summarize(values: List[float]) -> Dict[str, float]:
    return {
        "mean": float(statistics.mean(values)),
        "min": float(min(values)),
        "max": float(max(values)),
    }


def main() -> Dict[str, object]:
    baseline_runs = []
    candidate_runs = []

    for seed in SEEDS:
        baseline_capability, baseline_adaptation, _ = run_probe("gru_fixed_decay", seed=seed)
        candidate_capability, candidate_adaptation, _ = run_probe("gru_adaptive_decay", seed=seed)
        baseline_runs.append(
            {
                "seed": seed,
                "acc_ood": baseline_capability.test_accuracy,
                "epochs_to_80": baseline_capability.epochs_to_80,
                "stabilized_accuracy": baseline_adaptation.stabilized_accuracy,
            }
        )
        candidate_runs.append(
            {
                "seed": seed,
                "acc_ood": candidate_capability.test_accuracy,
                "epochs_to_80": candidate_capability.epochs_to_80,
                "stabilized_accuracy": candidate_adaptation.stabilized_accuracy,
            }
        )

    baseline_acc = [run["acc_ood"] for run in baseline_runs]
    candidate_acc = [run["acc_ood"] for run in candidate_runs]
    baseline_stable = [run["stabilized_accuracy"] for run in baseline_runs]
    candidate_stable = [run["stabilized_accuracy"] for run in candidate_runs]

    report = {
        "experiment": "exp42_runtime_continuity_multiseed",
        "seeds": SEEDS,
        "baseline": {
            "runs": baseline_runs,
            "acc_ood": summarize(baseline_acc),
            "stabilized_accuracy": summarize(baseline_stable),
        },
        "candidate": {
            "runs": candidate_runs,
            "acc_ood": summarize(candidate_acc),
            "stabilized_accuracy": summarize(candidate_stable),
        },
        "delta": {
            "mean_acc_ood": float(statistics.mean(candidate_acc) - statistics.mean(baseline_acc)),
            "mean_stabilized_accuracy": float(
                statistics.mean(candidate_stable) - statistics.mean(baseline_stable)
            ),
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
