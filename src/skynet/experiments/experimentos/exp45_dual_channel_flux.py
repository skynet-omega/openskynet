"""
Exp45: Dual-Channel Flux Gating (Symmetry Breaking)
===================================================

Hypothesis: FluxGatedGRU failed OOD because it coupled friction to 
a single update path. A dual-channel approach (Stable vs. Fluid) 
modulated by a cross-entropy of flux should better separate 
signal from drift.
"""

import torch
import torch.nn as nn
import json
import random
from pathlib import Path
from typing import Dict, Tuple

# Re-use setup from Exp44
try:
    from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM, build_model
    from exp38_ex_hypothesis_benchmark import evaluate, train_on_dataset
    from exp43_rule_vs_adaptive_continuity import generate_noisy_runtime_dataset, evaluate_rule
except ImportError:
    import sys
    sys.path.append("src/skynet/experiments/experimentos")
    from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM, build_model
    from exp38_ex_hypothesis_benchmark import evaluate, train_on_dataset
    from exp43_rule_vs_adaptive_continuity import generate_noisy_runtime_dataset, evaluate_rule

REPORT_PATH = Path("exp45_dual_channel_flux.json")

class DualChannelFluxGRU(nn.Module):
    """
    Candidate: DualChannelFluxGRU
    Mechanism: Parallel 'Stability' and 'Fluidity' hidden states.
    Flux (surprise) acts as a switch (Symmetry Breaking) between them.
    """
    def __init__(self, input_dim: int, hidden_dim: int, n_classes: int):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        self.norm = nn.LayerNorm(hidden_dim)
        
        # Dual cells
        self.cell_stable = nn.GRUCell(hidden_dim, hidden_dim)
        self.cell_fluid = nn.GRUCell(hidden_dim, hidden_dim)
        
        # Flux Detector (Symmetry Breaker)
        self.breaker = nn.Sequential(
            nn.Linear(hidden_dim * 2, hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(hidden_dim // 2, 1),
            nn.Sigmoid()
        )
        
        self.head = nn.Linear(hidden_dim, n_classes)

    def init_state(self, batch_size: int, device: str) -> Tuple[torch.Tensor, torch.Tensor]:
        return (torch.zeros(batch_size, self.hidden_dim, device=device),
                torch.zeros(batch_size, self.hidden_dim, device=device))

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h_s, h_f = self.init_state(batch, x_seq.device)
        
        for t in range(steps):
            x_t = self.norm(self.input_proj(x_seq[:, t]))
            
            # Predict next state in both channels
            p_s = self.cell_stable(x_t, h_s)
            p_f = self.cell_fluid(x_t, h_f)
            
            # Measure Flux: How much does the fluid channel want to deviate from the stable one?
            flux_input = torch.cat([h_s, p_f], dim=-1)
            gate = self.breaker(flux_input) # 0 (Fluid) to 1 (Stable)
            
            # Symmetry Breaking: Update states
            # High gate (Low Flux) -> Stability dominates
            # Low gate (High Flux) -> Fluidity resets stability
            h_s = gate * p_s + (1.0 - gate) * p_f
            h_f = p_f # Fluid channel always updates
            
        return self.head(h_s)

def run_experiment():
    random.seed(42)
    torch.manual_seed(42)

    label_count = 3
    
    # Dataset (Harder than Exp44 to find the limit)
    x_train, y_train = generate_noisy_runtime_dataset(
        1500, seq_len=20, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.1
    )
    x_test_id, y_test_id = generate_noisy_runtime_dataset(
        300, seq_len=20, interruption_rate=0.25, deceptive_shift_rate=0.2, observation_noise=0.1
    )
    # Severe OOD
    x_test_ood, y_test_ood = generate_noisy_runtime_dataset(
        300, seq_len=60, interruption_rate=0.4, deceptive_shift_rate=0.35, observation_noise=0.2
    )

    models = {
        "adaptive_decay": build_model("gru_adaptive_decay"),
        "dual_channel": DualChannelFluxGRU(INPUT_DIM, HIDDEN_DIM, label_count).to(DEVICE)
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
            "acc_ood": evaluate(model, x_test_ood, y_test_ood)
        }

    REPORT_PATH.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results

if __name__ == "__main__":
    run_experiment()
