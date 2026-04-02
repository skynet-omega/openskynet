"""
Exp47: Bifurcation Gating (Solitonic Commitment)
==============================================

Hypothesis: The Mexican Hat (Exp 45) provided +4% OOD boost by forcing 
commitment, but it was a fixed global potential. 
A "Bifurcation Gate" where the input itself modulates the 'temperature' 
of the double-well potential (making the state more 'fluid' when input 
entropy is high, and more 'crystalline' when it matches expected trajectory) 
should further improve adaptability without sacrificing the sharp 
decision boundary that beat the Rule Baseline.

Mechanism:
h_next = GRU(x, h)
temp = Sigmoid(Entropy_Modulator(x, h))
V(h) = temp * (-0.5 * h^2 + 0.25 * h^4)
h_final = h_next - grad(V)
"""

import torch
import torch.nn as nn
import json
import random
from pathlib import Path
from typing import Dict, Tuple

# Reusing infrastructure from previous experiments
from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM
from exp38_ex_hypothesis_benchmark import evaluate, train_on_dataset
from exp43_rule_vs_adaptive_continuity import generate_noisy_runtime_dataset, evaluate_rule

REPORT_PATH = Path("src/skynet/experiments/experimentos/exp47_bifurcation_gating.json")

class BifurcationGRU(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        
        # Modulator for the potential's 'temperature' or 'stiffness'
        # High value = strong double-well (crystalline/committed)
        # Low value = weak potential (fluid/adaptive)
        self.modulator = nn.Sequential(
            nn.Linear(input_dim + hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )
        
        # Base force strength
        self.base_strength = nn.Parameter(torch.tensor(0.2))
        
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_dim, device=device)

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, dim = x_seq.shape
        h = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_raw = x_seq[:, t]
            x_t = self.norm(self.input_proj(x_raw))
            h_next = self.cell(x_t, h)
            
            # Context-aware potential stiffness
            stiffness = self.modulator(torch.cat([x_raw, h], dim=-1))
            
            # Double-well potential force: F = h - h^3 (pulls to -1 or 1)
            h_core = torch.tanh(h_next)
            collapse = h_core - torch.pow(h_core, 3)
            
            # Apply modulated force
            force = stiffness * self.base_strength * (collapse / (1.0 + collapse.abs()))
            h = h_next + force
            
        return self.head(h)

def run_experiment():
    random.seed(42)
    torch.manual_seed(42)

    label_count = 3
    
    # Dataset mirroring the tough OOD conditions from Exp 45
    x_train, y_train = generate_noisy_runtime_dataset(
        1500, seq_len=20, interruption_rate=0.2, deceptive_shift_rate=0.15, observation_noise=0.12
    )
    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        400, seq_len=20, interruption_rate=0.2, deceptive_shift_rate=0.15, observation_noise=0.12
    )
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        400, seq_len=55, interruption_rate=0.4, deceptive_shift_rate=0.35, observation_noise=0.20
    )

    # Competitors
    # We include MexicanHat from Exp 45 as the new state-of-the-art to beat.
    # Re-implementing simplified MexicanHat here for direct comparison.
    class MexicanHatGRU_V2(nn.Module):
        def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
            super().__init__()
            self.input_proj = nn.Linear(input_dim, hidden_dim)
            self.norm = nn.LayerNorm(hidden_dim)
            self.cell = nn.GRUCell(hidden_dim, hidden_dim)
            self.force_strength = nn.Parameter(torch.tensor(0.15))
            self.head = nn.Linear(hidden_dim, n_classes)
            self.hidden_dim = hidden_dim
        def forward_sequence(self, x_seq):
            batch, steps, _ = x_seq.shape
            h = torch.zeros(batch, self.hidden_dim, device=x_seq.device)
            for t in range(steps):
                x_t = self.norm(self.input_proj(x_seq[:, t]))
                h = self.cell(x_t, h)
                h_core = torch.tanh(h)
                collapse = h_core - torch.pow(h_core, 3)
                h = h + self.force_strength.tanh() * (collapse / (1.0 + collapse.abs()))
            return self.head(h)

    models = {
        "mexican_hat_v2": MexicanHatGRU_V2(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE),
        "bifurcation_gating": BifurcationGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE)
    }

    results = {
        "rule_baseline": {
            "acc_id": evaluate_rule(x_test_id, y_test_id),
            "acc_ood": evaluate_rule(x_test_ood, y_test_ood)
        }
    }
    
    for name, model in models.items():
        print(f"Training {name}...")
        train_on_dataset(model, x_train, y_train, max_epochs=20)
        results[name] = {
            "acc_id": evaluate(model, x_test_id, y_test_id),
            "acc_ood": evaluate(model, x_test_ood, y_test_ood)
        }

    REPORT_PATH.write_text(json.dumps(results, indent=2))
    print(f"Results saved to {REPORT_PATH}")
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_experiment()
