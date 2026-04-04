"""
Exp73: V200 The Great Jump (Final Validation)
=============================================

Goal: Prove that knowledge in the 'Logic Organ' spontaneously assists 
the 'Geometry Organ' through the Executive Cortex.

The Task: "Counting Symmetry"
- Logic Training: Basic arithmetic (Count dots in text).
- Geometry Training: Mirror/Rotate patterns.
- THE JUMP: Solve a geometric puzzle where the answer depends on 
  the COUNT of objects (Logic) + their POSITION (Geometry).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V200_MULTICELLULAR import SKYNET_CORE_V200_MULTICELLULAR

REPORT_PATH = Path("exp73_v200_great_jump_v3.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def get_data(mode="logic", n=1000):
    x = torch.zeros(n, 10, 658).to(DEVICE)
    y = torch.zeros(n, dtype=torch.long).to(DEVICE)
    for i in range(n):
        if mode == "logic":
            # Arithmetic: Sum two pulses
            a, b = random.randint(1, 4), random.randint(1, 4)
            x[i, 0, 10+a] = 5.0; x[i, 2, 20+b] = 5.0
            y[i] = 1 if (a+b) > 4 else 0
        elif mode == "geometry":
            # Spatial: Mirror a bit
            pos = random.randint(0, 5)
            x[i, 0, 100+pos] = 5.0
            y[i] = 1 if pos > 2 else 0
        elif mode == "jump":
            # SYNERGY: Count objects (Logic) + Check Pos (Geometry)
            count = random.randint(1, 3)
            pos = random.randint(0, 5)
            for c in range(count): x[i, c, 50+c] = 5.0 # Count signal
            x[i, 0, 100+pos] = 5.0 # Position signal
            # Rule: Success only if count is high AND pos is mirrored
            y[i] = 1 if (count >= 2 and pos > 2) else 0
    return x, y

def run_experiment():
    print("--- V200 THE GREAT JUMP V3 (Optimized) ---")
    # 6 Organs with 16 nodes each to save VRAM
    model = SKYNET_CORE_V200_MULTICELLULAR(n_organs=6, n_nodes_per_organ=16, device=DEVICE).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    # Phase 1: Heavy Dual Training
    print("Phase 1: Parallel Training (Logic + Geometry)...")
    for epoch in range(120): # More epochs
        model.train()
        for mode in ["logic", "geometry"]:
            xb, yb = get_data(mode, 16) # Smaller batch
            model.reset()
            for t in range(10): out = model(x_vision=xb[:, t].unsqueeze(1))
            loss = F.cross_entropy(out['logits'], yb)
            # Router Balance
            r = out['audit']['routing']
            ent = -0.3 * np.sum(r * np.log(r + 1e-6))
            (loss + ent).backward()
            optimizer.step()
            optimizer.zero_grad()
        if (epoch+1)%30==0: print(f"  Epoch {epoch+1} Stable.")

    # Phase 2: The Jump Test
    print("Phase 2: Testing Emergent Synergy...")
    xt, yt = get_data("jump", 100)
    model.eval()
    model.reset()
    for t in range(10): out = model(x_vision=xt[:, t].unsqueeze(1))
    acc = (out['logits'].argmax(-1) == yt).float().mean().item()
    
    print(f"Jump Accuracy: {acc:.4f}")
    
    report = {"accuracy": acc, "organs": 6, "status": "SUCCESS" if acc > 0.7 else "FAIL"}
    REPORT_PATH.write_text(json.dumps(report))
    print(json.dumps(report, indent=2))

if __name__ == "__main__":
    run_experiment()
