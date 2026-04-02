"""
Exp44: Differentiable Flux Gating (Evolution of Adaptive Decay)
==============================================================

Goal: Improve upon AdaptiveDecayGRU by using a learned gate that 
specifically looks for "surprise" (flux divergence) to modulate 
memory retention, mimicking the 'Friction' and 'Symmetry Breaking' 
concepts from the Tesis.
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

REPORT_PATH = Path("exp44_flux_gating_benchmark.json")

class FluxGatedGRU(nn.Module):
    """
    Candidate: FluxGatedGRU
    Mechanism: Uses the difference between current input and previous hidden state
    to generate a 'friction' gate that controls how much the state is updated.
    """
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        
        # Surprise / Flux detector
        self.gate_net = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )
        
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.hidden_dim, device=device)

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            proposal = self.cell(x_t, h)
            
            # Compute 'Friction' based on Surprise (diff between h and proposal)
            # If they are very different, flux is high.
            diff = torch.cat([h, proposal], dim=-1)
            gate = self.gate_net(diff) # 0 to 1
            
            # h = gate * h_prev + (1-gate) * proposal
            # High gate = hold memory (High friction/rigidity)
            # Low gate = update state (Fluidity)
            h = gate * h + (1.0 - gate) * proposal
            
        return self.head(h)

def run_experiment():
    random.seed(42)
    torch.manual_seed(42)

    # 1. Setup Task (Same as Exp43 to compare fairly)
    # 3 classes: Focus 0, Focus 1, Reset/Noise 2
    label_count = 3
    
    x_train, y_train = generate_noisy_runtime_dataset(
        1200, seq_len=20, interruption_rate=0.2, deceptive_shift_rate=0.15, observation_noise=0.1
    )
    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        300, seq_len=20, interruption_rate=0.2, deceptive_shift_rate=0.15, observation_noise=0.1
    )
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        300, seq_len=45, interruption_rate=0.3, deceptive_shift_rate=0.25, observation_noise=0.15
    )

    # 2. Build Models
    models = {
        "adaptive_decay": build_model("gru_adaptive_decay"),
        "flux_gated": FluxGatedGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE)
    }
    
    # Fix output heads for 3 classes
    for name, m in models.items():
        if m.head.out_features != label_count:
            m.head = nn.Linear(m.hidden_dim, label_count).to(DEVICE)

    # 3. Baseline Rule
    rule_results = {
        "acc_id": evaluate_rule(x_test_id, y_test_id),
        "acc_ood": evaluate_rule(x_test_ood, y_test_ood)
    }

    # 4. Train and Eval
    results = {"rule_baseline": rule_results}
    
    for name, model in models.items():
        print(f"Training {name}...")
        train_on_dataset(model, x_train, y_train, max_epochs=15)
        results[name] = {
            "acc_id": evaluate(model, x_test_id, y_test_id),
            "acc_ood": evaluate(model, x_test_ood, y_test_ood)
        }

    # 5. Save Report
    REPORT_PATH.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_experiment()
