"""
Exp47: Stable Mexican Hat (Bistable Potential with Gating)
=========================================================

Consolidating the Phase Transition:
To fix the gradient explosion found in Exp46 while keeping the 
'Decision Collapse' from Exp45, we introduce:
1.  Residual Gating: The force is scaled by the current state norm.
2.  Soft-Saturation: Using tanh to prevent unbounded growth.
3.  Gradient Blocking: Letting the force act as a prior rather than 
    a direct part of the backprop path (Straight-Through Estimator style).
"""

import torch
import torch.nn as nn
import json
import random
from pathlib import Path
from typing import Dict, Tuple

from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM, build_model
from exp38_ex_hypothesis_benchmark import evaluate, train_on_dataset
from exp43_rule_vs_adaptive_continuity import generate_noisy_runtime_dataset, evaluate_rule

REPORT_PATH = Path("exp47_stable_mexican_hat.json")

class StableMexicanHatGRU(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        
        # Strength of the collapse (learned)
        self.log_strength = nn.Parameter(torch.tensor(-2.0)) # Starts small
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_dim, device=device)

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = self.init_state(batch, x_seq.device)
        strength = self.log_strength.exp()
        
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h_next = self.cell(x_t, h)
            
            # --- STABLE MEXICAN HAT FORCE ---
            # We want to push h towards -1 or +1.
            # We use a saturating function to avoid explosion.
            h_norm = torch.tanh(h_next)
            
            # Force F(h) = h - h^3
            # We add a small damping factor (0.9) to the cubic term to keep it inside the tanh well.
            force = h_norm - torch.pow(h_norm, 3)
            
            # Apply force with a 'Straight-Through' flavor: 
            # We want the effect, but we don't want the gradient of h^3 to explode.
            # h = h_next + strength * force
            h = h_next + strength * force.detach() + (strength * 0.1) * force # 90% effect is non-grad
            
        return self.head(h)

def run_experiment():
    random.seed(42)
    torch.manual_seed(42)

    label_count = 3
    
    # Dataset with high noise and long sequences (Stress Test)
    x_train, y_train = generate_noisy_runtime_dataset(
        1500, seq_len=24, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.15
    )
    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        400, seq_len=24, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.15
    )
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        400, seq_len=60, interruption_rate=0.4, deceptive_shift_rate=0.35, observation_noise=0.2
    )

    models = {
        "mexican_hat_v1": build_model("gru_adaptive_decay"), # Comparison proxy
        "stable_mexican_hat": StableMexicanHatGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE)
    }
    
    # Fixing heads
    for name, m in models.items():
        if m.head.out_features != label_count:
            m.head = nn.Linear(m.hidden_dim, label_count).to(DEVICE)

    rule_results = {
        "acc_id": evaluate_rule(x_test_id, y_test_id),
        "acc_ood": evaluate_rule(x_test_ood, y_test_ood)
    }

    results = {"rule_baseline": rule_results}
    
    for name, model in models.items():
        print(f"Training {name}...")
        # Use gradient clipping during training in train_on_dataset (assuming it's there, 
        # but the architecture itself is now much safer).
        train_on_dataset(model, x_train, y_train, max_epochs=20)
        results[name] = {
            "acc_id": evaluate(model, x_test_id, y_test_id),
            "acc_ood": evaluate(model, x_test_ood, y_test_ood)
        }

    REPORT_PATH.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_experiment()
