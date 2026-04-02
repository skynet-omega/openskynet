"""
Exp56: Continuous Life-Long Learning (V80 Stability Audit)
==========================================================

Goal: Verify if the V80 Hypergraph can learn Task A, then learn Task B, 
and still remember Task A without catastrophic forgetting, mimicking 
a 'Life-Long' scaling intelligence.

Mechanism:
1. Sequential Training: Task A -> Task B -> Task C.
2. Topological Memory: We check if the Adjacency Matrix A_t 'partitions' 
   itself to store Task A while using new nodes for Task B.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate
from SKYNET_CORE_V80_HYPERGRAPH import SKYNET_CORE_V80_HYPERGRAPH

REPORT_PATH = Path("exp56_lifelong_learning_results.json")

def generate_task_data(task_id, n_samples=1000):
    """
    Task 0: Identify pattern in first 3 dims.
    Task 1: Identify pattern in next 3 dims.
    """
    seq_len = 20
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.1
    y = torch.zeros(n_samples, dtype=torch.long)
    
    start_dim = task_id * 3
    for i in range(n_samples):
        label = random.randint(0, 1)
        y[i] = label
        # Pattern: high activation in the assigned task dimensions
        x[i, :, start_dim : start_dim + 3] += (2.0 if label == 1 else -2.0)
        
    return x, y

def run_lifelong_audit():
    random.seed(777)
    torch.manual_seed(777)
    
    # We use a larger V80 to allow for 'partitioning'
    model = SKYNET_CORE_V80_HYPERGRAPH(n_input=INPUT_DIM, n_nodes=64, d_feature=8, n_actions=2).to(DEVICE)
    
    print("--- Phase 1: Learning Task A ---")
    x_a, y_a = generate_task_data(0, 1500)
    train_on_dataset(model, x_a, y_a, max_epochs=15)
    acc_a_after_a = evaluate(model, x_a, y_a)
    print(f"  Acc A after A: {acc_a_after_a:.4f}")
    
    # Capture topology state after Task A
    topo_a = model.topology_state.clone() if model.topology_state is not None else None
    
    print("\n--- Phase 2: Learning Task B (Potential Forgetting) ---")
    x_b, y_b = generate_task_data(1, 1500)
    # Train ONLY on Task B
    train_on_dataset(model, x_b, y_b, max_epochs=15)
    acc_b_after_b = evaluate(model, x_b, y_b)
    print(f"  Acc B after B: {acc_b_after_b:.4f}")
    
    print("\n--- Phase 3: Final Recall ---")
    acc_a_after_b = evaluate(model, x_a, y_a)
    print(f"  Acc A after B: {acc_a_after_b:.4f}")
    
    # Analysis: Topological Drift
    topo_b = model.topology_state.clone()
    # Check how much the connections changed
    if topo_a is not None:
        drift = torch.abs(topo_b - topo_a).mean().item()
    else:
        drift = 0.0
        
    forgetting = acc_a_after_a - acc_a_after_b
    
    report = {
        "experiment": "exp56_lifelong_learning_v80",
        "task_a_initial": acc_a_after_a,
        "task_b_initial": acc_b_after_b,
        "task_a_final_recall": acc_a_after_b,
        "forgetting_magnitude": forgetting,
        "topological_drift": drift,
        "status": "SUCCESS" if forgetting < 0.1 else "FORGETTING_DETECTED"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_lifelong_audit()
