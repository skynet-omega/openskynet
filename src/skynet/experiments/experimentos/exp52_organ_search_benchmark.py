"""
Exp52: Organ Search Benchmark - Specialized Substrate Competition
================================================================

Goal: Iteratively search for the best Biphasic Organ configuration 
that can handle 'Parallel Conflicting Tasks' without crosstalk.

The experiment compares 3 Organ candidates:
1. Standard Biphasic (V28 baseline)
2. Mexican Hat (Exp45/46 decision collapse)
3. Chiral-Resonant (V13/V203 - adding spin to prevent signal bleeding)

Metrics: Parallel Task Accuracy, Retention, and Energy (Flux) Stability.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
from typing import Dict, Tuple

# We'll use the components from V28 but wrapped for fast benchmarking
from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM, build_model
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp52_organ_search_results.json")

class OrganCandidate(nn.Module):
    def __init__(self, d_state=48, mode="standard"):
        super().__init__()
        self.d_state = d_state
        self.mode = mode
        self.input_proj = nn.Linear(INPUT_DIM, d_state)
        self.cell = nn.GRUCell(d_state, d_state)
        
        # Physics Parameters
        self.force_strength = nn.Parameter(torch.tensor(0.15))
        self.chiral_spin = nn.Parameter(torch.tensor(0.05)) if mode == "chiral" else None
        
        self.head = nn.Linear(d_state, 3) # 3 action classes

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = torch.zeros(batch, self.d_state, device=x_seq.device)
        
        for t in range(steps):
            x_t = F.layer_norm(self.input_proj(x_seq[:, t]), (self.d_state,))
            h_next = self.cell(x_t, h)
            
            # 1. Decision Collapse (Mexican Hat) - present in both improved candidates
            if self.mode in ["mexican_hat", "chiral"]:
                h_core = torch.tanh(h_next)
                # Stable force from Exp47 (detached)
                force = (h_core - torch.pow(h_core, 3)).detach()
                h_next = h_next + self.force_strength.tanh() * force
            
            # 2. Chiral Spin (Rotational isolation)
            if self.mode == "chiral":
                # Rotate pairs of hidden units to isolate signals
                h_pairs = h_next.view(batch, -1, 2)
                cos_s = torch.cos(self.chiral_spin)
                sin_s = torch.sin(self.chiral_spin)
                h_rot = torch.stack([
                    h_pairs[..., 0] * cos_s - h_pairs[..., 1] * sin_s,
                    h_pairs[..., 0] * sin_s + h_pairs[..., 1] * cos_s
                ], dim=-1)
                h_next = h_rot.view(batch, -1)
                
            h = h_next
            
        return self.head(h)

def generate_catastrophic_erasure_data(n_samples=3000, seq_len=50):
    """
    CATASTROPHIC ERASURE (Memory Resilience Stress):
    - A 'key' at T=0 (Label 0 or 1).
    - T=1 to T=45: NOISE only.
    - T=46 to T=49: OPPOSITE KEY shown (Distractor).
    - Goal: At T=50, recall the ORIGINAL key from T=0, ignoring the distractor.
    """
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.1
    y = torch.zeros(n_samples, dtype=torch.long)
    
    for i in range(n_samples):
        label = random.randint(0, 1)
        y[i] = label
        # Original Key
        x[i, 0, label] = 3.0 
        
        # Distractor (Opposite key right before evaluation)
        distractor = 1 - label
        x[i, -5:-1, distractor] = 4.0
        
    return x, y

def run_organ_search():
    random.seed(88)
    torch.manual_seed(88)
    
    print("Generating Catastrophic Erasure Data...")
    x_train, y_train = generate_catastrophic_erasure_data(3000, 50)
    x_test, y_test = generate_catastrophic_erasure_data(600, 50)
    
    candidates = ["standard", "mexican_hat", "chiral"]
    results = {}
    
    for mode in candidates:
        print(f"Training Organ Candidate: {mode}...")
        model = OrganCandidate(HIDDEN_DIM, mode=mode).to(DEVICE)
        # Training with high weight decay to force 'natural' stability
        optimizer_kwargs = {"weight_decay": 0.01}
        train_on_dataset(model, x_train, y_train, max_epochs=12)
        
        acc = evaluate(model, x_test, y_test)
        results[mode] = acc
        print(f"  Result ({mode}): {acc:.4f}")
        
    REPORT_PATH.write_text(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_organ_search()
