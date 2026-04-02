"""
Exp48: Phase-Transition Gating (Stochastic Resilience)
======================================================

Hypothesis: Exp 47 (Bifurcation Gating) improved OOD by modulating stiffness,
but the transition was deterministic. Real biological systems and 
solitonic waves in noise benefit from 'Stochastic Resonance'.
Adding a small, temperature-scaled noise component during the 
high-entropy (fluid) phase should allow the system to 'tunnel' out 
of local minima caused by deceptive shifts more effectively than 
purely deterministic relaxation.

Mechanism:
h_next = GRU(x, h)
fluidity = Sigmoid(Entropy_Modulator(x, h)) # High when uncertain
stiffness = 1.0 - fluidity
V_force = stiffness * (h_core - h_core^3)
noise = fluidity * Normal(0, sigma)
h_final = h_next + V_force + noise
"""

import torch
import torch.nn as nn
import json
import random
from pathlib import Path
from typing import Dict, Tuple

# Reusing infrastructure from previous experiments
# Note: In a real environment we'd ensure these paths are in PYTHONPATH
import sys
sys.path.append('src/skynet/experiments/experimentos')

from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM
from exp38_ex_hypothesis_benchmark import evaluate, train_on_dataset
from exp43_rule_vs_adaptive_continuity import generate_noisy_runtime_dataset, evaluate_rule

REPORT_PATH = Path("src/skynet/experiments/experimentos/exp48_phase_transition.json")

class PhaseTransitionGRU(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int, noise_sigma: float = 0.05):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        
        # Modulator for fluidity (T in the V28 sense)
        self.fluidity_modulator = nn.Sequential(
            nn.Linear(input_dim + hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )
        
        self.base_stiffness = nn.Parameter(torch.tensor(0.25))
        self.noise_sigma = noise_sigma
        
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
            
            # Fluidity modulates both stiffness and noise
            fluidity = self.fluidity_modulator(torch.cat([x_raw, h], dim=-1))
            stiffness = 1.0 - fluidity
            
            # Bifurcation force (Crystalline phase)
            h_core = torch.tanh(h_next)
            collapse = h_core - torch.pow(h_core, 3)
            force = stiffness * self.base_stiffness * (collapse / (1.0 + collapse.abs()))
            
            # Stochastic Resonance (Fluid phase)
            # Only apply noise during training or for specific resilience tests
            noise = 0
            if self.training:
                noise = fluidity * torch.randn_like(h_next) * self.noise_sigma
            
            h = h_next + force + noise
            
        return self.head(h)

class BifurcationGRU_Ref(nn.Module):
    """Reference from Exp 47"""
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        self.cell = nn.GRUCell(hidden_dim, hidden_dim)
        self.modulator = nn.Sequential(
            nn.Linear(input_dim + hidden_dim, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )
        self.base_strength = nn.Parameter(torch.tensor(0.2))
        self.head = nn.Linear(hidden_dim, n_classes)
        self.hidden_dim = hidden_dim

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = torch.zeros(batch, self.hidden_dim, device=x_seq.device)
        for t in range(steps):
            x_raw = x_seq[:, t]
            x_t = self.norm(self.input_proj(x_raw))
            h_next = self.cell(x_t, h)
            stiffness = self.modulator(torch.cat([x_raw, h], dim=-1))
            h_core = torch.tanh(h_next)
            collapse = h_core - torch.pow(h_core, 3)
            force = stiffness * self.base_strength * (collapse / (1.0 + collapse.abs()))
            h = h_next + force
        return self.head(h)

def run_experiment():
    random.seed(42)
    torch.manual_seed(42)

    label_count = 3
    
    # Stress test dataset (Deceptive shifts + High Noise)
    x_train, y_train = generate_noisy_runtime_dataset(
        2000, seq_len=20, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.15
    )
    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        500, seq_len=20, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.15
    )
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        500, seq_len=60, interruption_rate=0.45, deceptive_shift_rate=0.4, observation_noise=0.25
    )

    models = {
        "bifurcation_ref": BifurcationGRU_Ref(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE),
        "phase_transition": PhaseTransitionGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE)
    }

    results = {
        "metadata": {
            "hypothesis": "Stochastic resonance in fluid phase improves OOD resilience",
            "date": "2026-04-02"
        }
    }
    
    for name, model in models.items():
        print(f"Training {name}...")
        train_on_dataset(model, x_train, y_train, max_epochs=25)
        model.eval() # Ensure noise is off for evaluation unless testing stochastic inference
        results[name] = {
            "acc_id": float(evaluate(model, x_test_id, y_test_id)),
            "acc_ood": float(evaluate(model, x_test_ood, y_test_ood))
        }

    REPORT_PATH.write_text(json.dumps(results, indent=2))
    print(f"Results saved to {REPORT_PATH}")
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_experiment()
