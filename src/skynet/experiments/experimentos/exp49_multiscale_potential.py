"""
Exp49: Multiscale Potential Resonance
=====================================

Hypothesis: A single potential (Exp 45) or a single gate (Exp 47) captures 
one level of commitment. However, cognition operates at multiple timescales. 
A hierarchy of potentials (Slow/Deep vs. Fast/Shallow) allows the system to 
maintain high-level goal commitment (slow) while remaining reactive to 
immediate sensory noise (fast), using 'potential resonance' to bridge them.
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

REPORT_PATH = Path("exp49_multiscale_potential.json")

class MexicanHatGRU(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        self.force_strength = nn.Parameter(torch.tensor(0.15))
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim
    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = torch.zeros(batch, self.hidden_dim, device=x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h = self.cell(x_t, h)
            h_core = torch.tanh(h)
            collapse = h_core - torch.pow(h_core, 3)
            h = h + self.force_strength.tanh() * (collapse / (1.0 + collapse.abs()))
        return self.head(h)

class MultiscalePotentialGRU(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.d_scale = hidden_dim // 2
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell_fast = nn.GRUCell(hidden_dim, self.d_scale)
        self.cell_slow = nn.GRUCell(hidden_dim, self.d_scale)
        self.fast_force = nn.Parameter(torch.tensor(0.05))
        self.slow_force = nn.Parameter(torch.tensor(0.25))
        self.coupling = nn.Parameter(torch.tensor(0.10))
        self.head = nn.Linear(hidden_dim, n_classes)

    def init_state(self, batch_size: int, device: str) -> Tuple[torch.Tensor, torch.Tensor]:
        return (torch.zeros(batch_size, self.d_scale, device=device),
                torch.zeros(batch_size, self.d_scale, device=device))

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h_f, h_s = self.init_state(batch, x_seq.device)
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            h_f_new = self.cell_fast(x_t, h_f)
            h_s_new = self.cell_slow(x_t, h_s)
            h_s_core = torch.tanh(h_s_new)
            s_collapse = h_s_core - torch.pow(h_s_core, 3)
            h_s = h_s_new + self.slow_force.tanh() * s_collapse
            h_f_core = torch.tanh(h_f_new)
            f_collapse = h_f_core - torch.pow(h_f_core, 3)
            resonance = h_s - h_f
            h_f = h_f_new + self.fast_force.tanh() * f_collapse + self.coupling.tanh() * resonance
        h_combined = torch.cat([h_f, h_s], dim=-1)
        return self.head(h_combined)

def run_experiment():
    random.seed(42)
    torch.manual_seed(42)
    label_count = 3
    x_train, y_train = generate_noisy_runtime_dataset(1500, seq_len=25, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.15)
    x_test_id, y_test_id = generate_noisy_runtime_dataset(400, seq_len=25, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.15)
    
    ood_data = []
    for length in [50, 80]:
        xt, yt = generate_noisy_runtime_dataset(200, seq_len=length, interruption_rate=0.4, deceptive_shift_rate=0.35, observation_noise=0.2)
        ood_data.append((xt, yt))

    def evaluate_multi_ood(model, ood_data_list):
        total_acc = 0.0
        for xt, yt in ood_data_list:
            total_acc += evaluate(model, xt, yt)
        return total_acc / len(ood_data_list)

    models = {
        "adaptive_decay": build_model("gru_adaptive_decay"),
        "mexican_hat_ref": MexicanHatGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE),
        "multiscale_potential": MultiscalePotentialGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE)
    }
    
    for name, m in models.items():
        if m.head.out_features != label_count:
            m.head = nn.Linear(m.hidden_dim, label_count).to(DEVICE)

    results = {}
    for name, model in models.items():
        print(f"Training {name}...")
        train_on_dataset(model, x_train, y_train, max_epochs=20)
        results[name] = {
            "acc_id": evaluate(model, x_test_id, y_test_id),
            "acc_ood": evaluate_multi_ood(model, ood_data)
        }

    REPORT_PATH.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_experiment()