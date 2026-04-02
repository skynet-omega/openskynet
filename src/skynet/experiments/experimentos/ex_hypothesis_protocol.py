"""
EX hypothesis protocol helper.

Small and explicit by design:
- compare hypotheses, not version names
- score exotic architectures on multiple falsable axes
- avoid using internal diagnostics as "free points"
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Dict, List, Optional
import json
from pathlib import Path


@dataclass
class CapabilityMetrics:
    test_accuracy: float
    epochs_to_80: Optional[float] = None
    area_under_curve: Optional[float] = None
    param_count: Optional[int] = None
    wall_time_ms: Optional[float] = None


@dataclass
class AdaptationMetrics:
    shift_recovery_steps: Optional[float] = None
    post_shift_accuracy: Optional[float] = None
    stabilized_accuracy: Optional[float] = None


@dataclass
class RetentionMetrics:
    task_a_after_a: Optional[float] = None
    task_a_after_b: Optional[float] = None
    forgetting: Optional[float] = None


@dataclass
class ElasticityMetrics:
    deep_path_activation_rate: Optional[float] = None
    quality_with_deep_path: Optional[float] = None
    quality_without_deep_path: Optional[float] = None
    useful_gain_per_extra_cost: Optional[float] = None


@dataclass
class InternalMetrics:
    temperature_delta: Optional[float] = None
    participation_ratio_initial: Optional[float] = None
    participation_ratio_final: Optional[float] = None
    surprise_mean: Optional[float] = None


@dataclass
class HypothesisRun:
    hypothesis_id: str
    family: str
    task_id: str
    capability: CapabilityMetrics
    adaptation: Optional[AdaptationMetrics] = None
    retention: Optional[RetentionMetrics] = None
    elasticity: Optional[ElasticityMetrics] = None
    internal: Optional[InternalMetrics] = None
    notes: Optional[str] = None


def _higher_is_better_delta(candidate: Optional[float], baseline: Optional[float]) -> Optional[float]:
    if candidate is None or baseline is None:
        return None
    return candidate - baseline


def _lower_is_better_delta(candidate: Optional[float], baseline: Optional[float]) -> Optional[float]:
    if candidate is None or baseline is None:
        return None
    return baseline - candidate


def compare_to_baseline(candidate: HypothesisRun, baseline: HypothesisRun) -> Dict[str, Optional[float]]:
    return {
        "accuracy_delta": _higher_is_better_delta(
            candidate.capability.test_accuracy,
            baseline.capability.test_accuracy,
        ),
        "sample_efficiency_delta": _lower_is_better_delta(
            candidate.capability.epochs_to_80,
            baseline.capability.epochs_to_80,
        ),
        "forgetting_delta": _lower_is_better_delta(
            candidate.retention.forgetting if candidate.retention else None,
            baseline.retention.forgetting if baseline.retention else None,
        ),
        "recovery_delta": _lower_is_better_delta(
            candidate.adaptation.shift_recovery_steps if candidate.adaptation else None,
            baseline.adaptation.shift_recovery_steps if baseline.adaptation else None,
        ),
        "elasticity_gain_delta": _higher_is_better_delta(
            candidate.elasticity.useful_gain_per_extra_cost if candidate.elasticity else None,
            baseline.elasticity.useful_gain_per_extra_cost if baseline.elasticity else None,
        ),
    }


def promotion_reasons(candidate: HypothesisRun, baseline: HypothesisRun) -> List[str]:
    deltas = compare_to_baseline(candidate, baseline)
    reasons: List[str] = []

    if deltas["accuracy_delta"] is not None and deltas["accuracy_delta"] > 0.02:
        reasons.append("wins_final_accuracy")
    if deltas["forgetting_delta"] is not None and deltas["forgetting_delta"] > 0.05:
        reasons.append("wins_retention")
    if deltas["recovery_delta"] is not None and deltas["recovery_delta"] > 1.0:
        reasons.append("wins_adaptation_latency")
    if deltas["elasticity_gain_delta"] is not None and deltas["elasticity_gain_delta"] > 0.01:
        reasons.append("wins_compute_elasticity")

    return reasons


def save_protocol_report(
    path: str | Path,
    baseline: HypothesisRun,
    candidates: List[HypothesisRun],
) -> Dict[str, object]:
    baseline_dict = asdict(baseline)
    candidate_reports = []
    for candidate in candidates:
        candidate_reports.append(
            {
                "run": asdict(candidate),
                "vs_baseline": compare_to_baseline(candidate, baseline),
                "promotion_reasons": promotion_reasons(candidate, baseline),
            }
        )

    report = {
        "protocol": "ex_hypothesis_protocol_v1",
        "baseline": baseline_dict,
        "candidates": candidate_reports,
    }
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    baseline = HypothesisRun(
        hypothesis_id="gru_baseline",
        family="baseline",
        task_id="example",
        capability=CapabilityMetrics(test_accuracy=0.81, epochs_to_80=12, param_count=100_000),
        retention=RetentionMetrics(forgetting=0.18),
    )

    candidate = HypothesisRun(
        hypothesis_id="gru_adaptive_decay",
        family="adaptive_decay",
        task_id="example",
        capability=CapabilityMetrics(test_accuracy=0.83, epochs_to_80=9, param_count=102_000),
        retention=RetentionMetrics(forgetting=0.09),
        internal=InternalMetrics(temperature_delta=-0.07, participation_ratio_initial=1.2, participation_ratio_final=2.8),
        notes="Example only. Replace with real experiment output.",
    )

    report = save_protocol_report(
        Path(__file__).with_name("ex_hypothesis_protocol.example.json"),
        baseline,
        [candidate],
    )
    print(json.dumps(report, indent=2))
