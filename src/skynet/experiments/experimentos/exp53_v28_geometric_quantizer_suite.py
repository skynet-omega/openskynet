"""
Exp53: V28 Geometric Quantizer Suite
====================================

Reuse the existing `GeometricQuantizer` from V28.
Do not invent a new quantizer.

Goal:
stress-test the quantizer beyond the single-dot toy case from Exp49.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Dict

import torch
import torch.nn.functional as F

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "EX"))

from SKYNET_V28_PHYSICAL_CYBORG import GeometricQuantizer


REPORT_PATH = Path(__file__).with_name("exp53_v28_geometric_quantizer_suite.json")


def _init_ring_kernel(size: int) -> torch.Tensor:
    center = size // 2
    y, x = torch.meshgrid(torch.arange(size), torch.arange(size), indexing="ij")
    dist = torch.sqrt((x - center).float() ** 2 + (y - center).float() ** 2)
    radius = size / 3.0
    sigma = size / 6.0
    kernel = torch.exp(-((dist - radius) ** 2) / (2 * sigma**2))
    return (kernel / kernel.sum()).view(1, 1, size, size)


def count_local_maxima(tensor: torch.Tensor, threshold: float = 0.1) -> int:
    max_pool = F.max_pool2d(tensor, kernel_size=3, stride=1, padding=1)
    return int(((tensor == max_pool) & (tensor > threshold)).sum().item())


def pattern_bank() -> Dict[str, torch.Tensor]:
    bank: Dict[str, torch.Tensor] = {}

    dot = torch.zeros(1, 1, 3, 3)
    dot[0, 0, 1, 1] = 1.0
    bank["center_dot"] = dot

    horiz = torch.zeros(1, 1, 3, 3)
    horiz[0, 0, 1, 0:3] = 1.0
    bank["horizontal_line"] = horiz

    corner_l = torch.zeros(1, 1, 3, 3)
    corner_l[0, 0, 0:3, 0] = 1.0
    corner_l[0, 0, 2, 0:3] = 1.0
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


def analyze_pattern(pattern: torch.Tensor, quantizer: GeometricQuantizer, target_size: int = 30) -> Dict[str, object]:
    kernel = _init_ring_kernel(7)
    pad = 3

    scaled_naive = F.interpolate(pattern, size=(target_size, target_size), mode="nearest")
    resp_naive = F.conv2d(F.pad(scaled_naive, (pad, pad, pad, pad), mode="constant", value=0), kernel)
    naive_peaks = count_local_maxima(resp_naive)

    scaled_bilinear = F.interpolate(pattern, size=(target_size, target_size), mode="bilinear", align_corners=False)
    resp_bilinear = F.conv2d(F.pad(scaled_bilinear, (pad, pad, pad, pad), mode="constant", value=0), kernel)
    bilinear_peaks = count_local_maxima(resp_bilinear)

    scaled_quantized = quantizer(pattern, target_size=(target_size, target_size))
    resp_quantized = F.conv2d(F.pad(scaled_quantized, (pad, pad, pad, pad), mode="constant", value=0), kernel)
    quantized_peaks = count_local_maxima(resp_quantized)

    return {
        "naive_false_detections": naive_peaks,
        "bilinear_false_detections": bilinear_peaks,
        "quantized_false_detections": quantized_peaks,
        "quantizer_beats_naive": quantized_peaks < naive_peaks,
        "quantizer_beats_bilinear": quantized_peaks < bilinear_peaks,
    }


def main() -> Dict[str, object]:
    quantizer = GeometricQuantizer()
    results = {}
    for name, pattern in pattern_bank().items():
        results[name] = analyze_pattern(pattern, quantizer)

    wins_vs_naive = sum(1 for r in results.values() if r["quantizer_beats_naive"])
    wins_vs_bilinear = sum(1 for r in results.values() if r["quantizer_beats_bilinear"])
    report = {
        "experiment": "exp53_v28_geometric_quantizer_suite",
        "patterns": results,
        "summary": {
            "patterns_tested": len(results),
            "wins_vs_naive": wins_vs_naive,
            "wins_vs_bilinear": wins_vs_bilinear,
        },
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    main()
