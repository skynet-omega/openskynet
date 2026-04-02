"""
Exp55: Liquid Brain Stress Battery - The GAUNTLET
=================================================

Final stress test for the V80 Hypergraph candidate (Liquid Brain).
Three extreme scenarios:
1. LONG SILENCE (T=1 to T=100): Key at T=0, XOR with T=101.
2. SIGNAL NOISE: Heavy Gaussian noise + distractors in all nodes during the gap.
3. ADVERSARIAL RESET: At T=50, a 'Flash' of 1.0 in all nodes tries to erase memory.

Success means the Dynamic Topology can 'lock' the key in a topological 
well that resists both time and external interference.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

# Using the winning architecture from Exp54
from exp54_liquid_brain_core import LiquidBrainOrgan

REPORT_PATH = Path("exp55_stress_results.json")

def generate_gauntlet_data(n_samples=2000, mode="long_silence"):
    """
    Scenario 1: Long Silence (100 steps)
    Scenario 2: Signal Noise (High variance distractors)
    Scenario 3: Adversarial Reset (Flash)
    """
    seq_len = 120
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.1
    y = torch.zeros(n_samples, dtype=torch.long)
    
    for i in range(n_samples):
        val_x = random.randint(0, 1)
        val_y = random.randint(0, 1)
        
        # Initial Key at T=0
        x[i, 0, 0] = 5.0 if val_x == 1 else -5.0
        
        if mode == "long_silence":
            # Just silence/low noise
            pass
        elif mode == "signal_noise":
            # Inject heavy distractors during the wait
            x[i, 1:100, 2:8] += torch.randn(99, 6) * 1.5
        elif mode == "adversarial_reset":
            # The 'Flash' at T=50: saturates the substrate
            x[i, 50:55, :] = 10.0 
            
        # Target interaction at T=110
        x[i, 110, 1] = 5.0 if val_y == 1 else -5.0
        
        y[i] = 1 if (val_x != val_y) else 0 # XOR
        
    return x, y

def run_stress_battery():
    random.seed(444)
    torch.manual_seed(444)
    
    scenarios = ["long_silence", "signal_noise", "adversarial_reset"]
    results = {}
    
    # 1. Train on a 'standard' difficult mix
    print("Training on mixed stress conditions...")
    x_train, y_train = generate_gauntlet_data(2500, mode="long_silence") # Base training
    
    model = LiquidBrainOrgan(n_nodes=16, d_feature=8).to(DEVICE)
    train_on_dataset(model, x_train, y_train, max_epochs=30)
    
    # 2. Evaluate each scenario
    for mode in scenarios:
        print(f"Testing Scenario: {mode}...")
        x_test, y_test = generate_gauntlet_data(500, mode=mode)
        acc = evaluate(model, x_test, y_test)
        results[mode] = acc
        print(f"  Result ({mode}): {acc:.4f}")
        
    # 3. Overall Verdict
    min_acc = min(results.values())
    verdict = "STABLE" if min_acc > 0.85 else "UNSTABLE"
    
    report = {
        "experiment": "exp55_liquid_brain_stress_battery",
        "results": results,
        "verdict": verdict,
        "status": "COMPLETED"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_stress_battery()
