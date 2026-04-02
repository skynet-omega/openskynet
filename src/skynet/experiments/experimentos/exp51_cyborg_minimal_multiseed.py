"""
Exp51: Cyborg Minimal Multiseed
===============================

Sanity check for Exp50.
We do not promote or discard a whole family from a single lucky seed.
"""

from __future__ import annotations

import json
from pathlib import Path

from exp50_cyborg_minimal_benchmark import run_probe


REPORT_PATH = Path(__file__).with_name("exp51_cyborg_minimal_multiseed.json")
SEEDS = [11, 23, 37]
HYPOTHESES = [
    ("gru_baseline", "baseline"),
    ("organ_only", "continuous_organ"),
    ("cyborg_minimal", "v28_cyborg_minimal"),
]


def main() -> dict:
    per_seed = []
    summary: dict[str, dict[str, float]] = {}

    for hypothesis_id, family in HYPOTHESES:
        acc_ood = []
        epochs_to_80 = []
        params = None
        for seed in SEEDS:
            capability, adaptation, internal, debug = run_probe(hypothesis_id, seed=seed)
            acc_ood.append(capability.test_accuracy)
            epochs_to_80.append(capability.epochs_to_80 or 0)
            params = capability.param_count
            per_seed.append(
                {
                    "hypothesis_id": hypothesis_id,
                    "family": family,
                    "seed": seed,
                    "acc_ood": capability.test_accuracy,
                    "epochs_to_80": capability.epochs_to_80,
                    "param_count": capability.param_count,
                    "temperature_delta": internal.temperature_delta,
                    "surprise_mean": internal.surprise_mean,
                    "notes": debug,
                }
            )
        summary[hypothesis_id] = {
            "mean_acc_ood": sum(acc_ood) / len(acc_ood),
            "mean_epochs_to_80": sum(epochs_to_80) / len(epochs_to_80),
            "param_count": params,
        }

    report = {
        "experiment": "exp51_cyborg_minimal_multiseed",
        "seeds": SEEDS,
        "summary": summary,
        "runs": per_seed,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
