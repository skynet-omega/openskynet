"""
Exp32: AGI Benchmark Autonomo
===============================

Executes benchmark_AGI_SKYNET.py with V28BenchmarkAdapter.
Reports score per task and total.

Baselines:
  - Random (1/N for each task)
  - Previous results from Exp29 (if available)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))) # V28 dir
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))) # Project ROOT (SOLITONES)

import torch
import json
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).parent
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'


def run_benchmark():
    """Run AGI benchmark with V28BenchmarkAdapter."""
    print("=" * 60)
    print("EXP32: AGI BENCHMARK AUTONOMO")
    print("=" * 60)

    # Import the benchmark
    from benchmark_AGI_SKYNET import run_ultimate_benchmark
    from v28_benchmark_adapter import cyborg_benchmark_interface

    print(f"\nDevice: {DEVICE}")
    print(f"Running benchmark with V28BenchmarkAdapter...\n")

    scores = run_ultimate_benchmark(cyborg_benchmark_interface)

    return scores


def compute_random_baselines():
    """Compute expected random baselines."""
    return {
        "1. SCAN (Comp. Lang)": 0.0,      # Exact match unlikely
        "2. gSCAN (Spatial Lang)": 0.0,    # Exact match unlikely
        "3. CLUTRR (Relational)": 1/20,    # 1/20 relations
        "4. CLRS-30 (Algorithms)": 1/120,  # 1/5! permutations
        "5. GSM (Symbolic Math)": 1/100,   # 1/100 numbers
        "6. ARC-ID (Memory)": 0.0,         # Grid match unlikely
        "7. ARC-ABS (Topology)": 0.0,
        "8. ARC-FRAC (Recursion)": 0.0,
        "9. ARC-LOGIC (Program)": 0.0,
        "10. NSU (World Physics)": 0.0,    # MSE threshold unlikely
    }


def load_exp29_results():
    """Load previous Exp29 results if available."""
    exp29_log = LOG_DIR / 'exp29_comprehensive_benchmark.log'
    if exp29_log.exists():
        try:
            with open(exp29_log, 'r') as f:
                content = f.read()
            # Try to parse scores
            return {'available': True, 'raw': content[:500]}
        except Exception:
            pass
    return {'available': False}


def save_results(scores):
    """Save benchmark results."""
    random_baselines = compute_random_baselines()
    exp29 = load_exp29_results()

    total = sum(scores.values()) / max(len(scores), 1)

    report = {
        'experiment': 'Exp32: AGI Benchmark Autonomo',
        'timestamp': datetime.now().isoformat(),
        'device': DEVICE,
        'adapter': 'V28BenchmarkAdapter',
        'scores': scores,
        'total_score': total,
        'random_baselines': random_baselines,
        'exp29_available': exp29.get('available', False),
        'analysis': {
            'above_random': {
                name: scores.get(name, 0) > random_baselines.get(name, 0)
                for name in scores
            },
            'total_vs_random': total > sum(random_baselines.values()) / max(len(random_baselines), 1),
        }
    }

    log_path = LOG_DIR / 'exp32_agi_benchmark.log'
    with open(log_path, 'w') as f:
        f.write(json.dumps(report, indent=2, default=str))
    print(f"\n[SAVED] {log_path}")

    # Summary
    print("\n" + "=" * 60)
    print("RESULTS COMPARISON")
    print("=" * 60)
    print(f"{'Task':<30} {'V28':>8} {'Random':>8} {'Beat?':>6}")
    print("-" * 60)
    for name in scores:
        v28 = scores[name]
        rand = random_baselines.get(name, 0)
        beat = 'YES' if v28 > rand else 'NO'
        print(f"{name:<30} {v28:>7.1%} {rand:>7.1%} {beat:>6}")
    print("-" * 60)
    rand_total = sum(random_baselines.values()) / max(len(random_baselines), 1)
    print(f"{'TOTAL':<30} {total:>7.1%} {rand_total:>7.1%}")
    print("=" * 60)

    # Plot
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, ax = plt.subplots(figsize=(14, 6))
        fig.suptitle('Exp32: AGI Benchmark - V28 vs Random Baseline', fontsize=14)

        names = list(scores.keys())
        v28_scores = [scores[n] * 100 for n in names]
        rand_scores = [random_baselines.get(n, 0) * 100 for n in names]

        import numpy as np
        x = np.arange(len(names))
        width = 0.35

        ax.bar(x - width/2, v28_scores, width, label='V28 Cyborg', color='#FF5722')
        ax.bar(x + width/2, rand_scores, width, label='Random', color='#9E9E9E')

        ax.set_xlabel('Benchmark Task')
        ax.set_ylabel('Score (%)')
        ax.set_title(f'Total AGI Score: {total*100:.1f}%')
        ax.set_xticks(x)
        ax.set_xticklabels([n.split('(')[0].strip() for n in names], rotation=30, ha='right')
        ax.legend()
        ax.set_ylim(0, 105)

        plt.tight_layout()
        png_path = LOG_DIR / 'exp32_agi_benchmark.png'
        plt.savefig(png_path, dpi=150)
        print(f"[SAVED] {png_path}")
        plt.close()
    except ImportError:
        print("[SKIP] matplotlib not available for plotting")


if __name__ == "__main__":
    scores = run_benchmark()
    save_results(scores)
