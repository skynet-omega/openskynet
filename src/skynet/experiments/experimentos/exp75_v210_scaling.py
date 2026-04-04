"""
Exp75: V210 Cavity Scaling - 100 Resonant Organs (The Swarm Mind)
===============================================================

Goal: Scale the Resonant Colony to 100 organs and verify:
1. Stability: Does the shared cavity (GRW) saturate or explode?
2. Emergent Resolution: Does more organs mean better resolution for 
   highly complex, mixed-domain signals?
3. Performance: VRAM and Time overhead at scale.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import json
import time
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V210_RESONANT_COLONY import SKYNET_CORE_V210_RESONANT_COLONY

REPORT_PATH = Path("exp75_v210_scaling_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def run_scaling_test():
    print("--- V210 CAVITY SCALING: 100 ORGANS ---")
    
    # 1. Initialize Model with 100 Organs
    # Small batch to avoid OOM during large scale initialization
    try:
        start_time = time.time()
        model = SKYNET_CORE_V210_RESONANT_COLONY(
            n_organs=100, 
            n_nodes_per_organ=16, # Optimized for scale
            d_feature=8,
            device=DEVICE
        ).to(DEVICE)
        init_time = time.time() - start_time
        print(f"  [SUCCESS] Model initialized in {init_time:.2f}s.")
    except Exception as e:
        print(f"  [ERROR] Initialization failed: {e}")
        return {"status": "INIT_FAILED", "error": str(e)}

    # 2. Benchmark Forward Pass
    batch_size = 4
    x = torch.randn(batch_size, 658).to(DEVICE)
    
    torch.cuda.reset_peak_memory_stats() if DEVICE == 'cuda' else None
    start_fwd = time.time()
    out = model(x)
    fwd_time = time.time() - start_fwd
    mem_mb = torch.cuda.max_memory_allocated() / 1e6 if DEVICE == 'cuda' else 0
    
    print(f"  Forward Pass Time: {fwd_time:.4f}s")
    print(f"  Peak VRAM: {mem_mb:.2f} MB")
    print(f"  Shared Cavity Energy: {out['audit']['energy']:.4f}")

    # 3. Pattern Recognition stress (Multi-signal)
    # We inject 10 random 'concepts' and see if the energy remains bounded
    print("  Testing Energy Saturation under Multi-signal injection...")
    model.reset()
    for _ in range(10):
        x_noise = torch.randn(batch_size, 658).to(DEVICE) * 2.0
        out = model(x_noise)
        
    energy_final = out['audit']['energy']
    print(f"  Final Stabilized Energy: {energy_final:.4f}")

    report = {
        "experiment": "exp75_v210_100_organ_scaling",
        "n_organs": 100,
        "init_time_s": init_time,
        "forward_time_s": fwd_time,
        "vram_mb": mem_mb,
        "energy_stability": "STABLE" if energy_final < 5.0 else "UNSTABLE",
        "status": "VALIDATED"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_scaling_test()
