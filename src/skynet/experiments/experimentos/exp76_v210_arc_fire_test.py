"""
Exp76: ARC Fire Test - Counting & Movement (V210 Resonant)
==========================================================

Goal: Test if the V210 Resonant Colony can solve a composite ARC puzzle.
Task: "Count and Shift"
1. Input: A sequence of N 'trigger' pulses (Counting).
2. Input: A spatial 'object' (Geometric position).
3. Target: Move the object right by exactly N steps.

Requires synergy between Logic (Count) and Geometry (Translation).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V210_RESONANT_COLONY import SKYNET_CORE_V210_RESONANT_COLONY

REPORT_PATH = Path("exp76_v210_arc_fire_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def generate_count_and_shift_data(n_samples=1000):
    seq_len = 10
    grid_size = 10
    x = torch.zeros(n_samples, seq_len, 658).to(DEVICE)
    y = torch.zeros(n_samples, dtype=torch.long).to(DEVICE) # Target Position
    
    for i in range(n_samples):
        # 1. Count (1 to 4)
        count = random.randint(1, 4)
        for c in range(count):
            x[i, c, 10+c] = 5.0 # Pulse signal
            
        # 2. Initial Position (0 to 5)
        start_pos = random.randint(0, 5)
        x[i, 0, 100+start_pos] = 5.0 # Spatial signal
        
        # 3. Target: Shifted Position
        target_pos = start_pos + count
        y[i] = target_pos # We want to predict the final slot
        
    return x, y

def run_arc_fire_test():
    print("--- V210 ARC FIRE TEST: COUNT & SHIFT ---")
    
    # 12 Organs for specialized reasoning
    model = SKYNET_CORE_V210_RESONANT_COLONY(
        n_organs=12,
        n_nodes_per_organ=32,
        d_feature=16,
        n_actions=11, # 0 to 10 positions
        device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    # Training
    print("Training on Composite Rules...")
    x_train, y_train = generate_count_and_shift_data(2000)
    x_test, y_test = generate_count_and_shift_data(500)
    
    for epoch in range(100):
        model.train()
        model.reset()
        for t in range(10): out = model(x_train[:, t])
        
        loss = F.cross_entropy(out['logits'], y_train)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (epoch+1) % 25 == 0:
            print(f"  Epoch {epoch+1}, Loss: {loss.item():.4f}")
            
    # Evaluation
    model.eval()
    model.reset()
    for t in range(10): out = model(x_test[:, t])
    pred = out['logits'].argmax(-1)
    acc = (pred == y_test).float().mean().item()
    
    print(f"Final ARC Fire Accuracy: {acc:.4f}")
    
    report = {
        "experiment": "exp76_v210_arc_fire_test",
        "task": "Counting + Spatial Shift",
        "accuracy": acc,
        "status": "SUCCESS" if acc > 0.9 else "FAILURE"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_arc_fire_test()
