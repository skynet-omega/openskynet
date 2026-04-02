"""
Exp45: Mexican Hat Collapse (Bistable Potential)
===============================================

Hypothesis: Neural models struggle to beat the "Hard Rule" because they are
too smooth. Introducing a double-well potential (Higgs/Mexican Hat) forces
the hidden state to 'collapse' into discrete commitments (0 or 1), 
imitating the rule's sharp transition while remaining trainable.
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

REPORT_PATH = Path("exp45_mexican_hat_benchmark.json")

class MexicanHatGRU(nn.Module):
    """
    Candidate: MexicanHatGRU
    Mechanism: Applies a bistable potential force to the hidden state at each step.
    V(h) = -0.5 * h^2 + 0.25 * h^4 (Double well)
    Force F = -dV/dh = h - h^3
    """
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        
        # Strength of the 'collapse' force
        self.force_strength = nn.Parameter(torch.tensor(0.15))
        
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_dim, device=device)

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h = self.cell(x_t, h)
            
            # Mexican Hat Force: push away from 0.0, pull towards -1.0 and 1.0
            # h_new = h + dt * (h - h^3)
            # We use a tanh to keep it in [-1, 1] range first
            h_core = torch.tanh(h)
            collapse = h_core - torch.pow(h_core, 3)
            h = h + self.force_strength.tanh() * (collapse / (1.0 + collapse.abs())) # SOFT SNAPPING
            
        return self.head(h)

def run_experiment():
    random.seed(7)
    torch.manual_seed(7)

    label_count = 3
    
    # Tougher dataset to emphasize OOD robustness
    x_train, y_train = generate_noisy_runtime_dataset(
        1500, seq_len=20, interruption_rate=0.2, deceptive_shift_rate=0.15, observation_noise=0.12
    )
    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        400, seq_len=20, interruption_rate=0.2, deceptive_shift_rate=0.15, observation_noise=0.12
    )
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        400, seq_len=50, interruption_rate=0.35, deceptive_shift_rate=0.3, observation_noise=0.18
    )

    models = {
        "adaptive_decay": build_model("gru_adaptive_decay"),
        "mexican_hat": MexicanHatGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE)
    }
    
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
        # A bit more training to allow the potential to stabilize
        train_on_dataset(model, x_train, y_train, max_epochs=18)
        results[name] = {
            "acc_id": evaluate(model, x_test_id, y_test_id),
            "acc_ood": evaluate(model, x_test_ood, y_test_ood)
        }

    REPORT_PATH.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_experiment()
