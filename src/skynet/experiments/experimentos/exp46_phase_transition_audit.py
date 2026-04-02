"""
Exp46: Phase Transition Audit (Mexican Hat Stability)
=====================================================

Visualize the 'Collapse' of the hidden state and check for gradient 
explosions or vanishing during the transition. If stable, this confirms
the Mexican Hat component is ready for Core integration.
"""

import torch
import torch.nn as nn
import json
# import matplotlib.pyplot as plt
from pathlib import Path
from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM

# Re-importing the winning architecture
from exp45_mexican_hat_benchmark import MexicanHatGRU

def audit_phase_transition():
    torch.manual_seed(42)
    model = MexicanHatGRU(INPUT_DIM, HIDDEN_DIM, 3).to(DEVICE)
    
    # We want to see how a neutral state (0.0) moves under the force
    # and if the gradients are healthy.
    h = torch.randn(1, HIDDEN_DIM, device=DEVICE) * 0.1 # Start near zero
    h.requires_grad = True
    
    steps = 50
    trajectories = []
    grad_norms = []
    
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    for i in range(steps):
        # Apply the Mexican Hat force multiple times to see the attractor
        h_core = torch.tanh(h)
        collapse = h_core - torch.pow(h_core, 3)
        h = h + model.force_strength.tanh() * (collapse / (1.0 + collapse.abs())) # SOFT SNAPPING
        
        trajectories.append(h.detach().cpu().numpy().flatten())
        
        # Fake loss to check gradients
        loss = h.pow(2).sum()
        optimizer.zero_grad()
        loss.backward(retain_graph=True)
        
        grad_norm = torch.nn.utils.clip_grad_norm_(model.parameters(), 100.0)
        grad_norms.append(float(grad_norm))
        
    # Analyze trajectories: how many neurons collapsed to +1 or -1?
    final_h = trajectories[-1]
    collapsed_pos = (final_h > 0.8).sum()
    collapsed_neg = (final_h < -0.8).sum()
    undecided = ((final_h >= -0.8) & (final_h <= 0.8)).sum()
    
    report = {
        "experiment": "exp46_phase_transition_audit",
        "neurons_total": HIDDEN_DIM,
        "collapsed_positive": int(collapsed_pos),
        "collapsed_negative": int(collapsed_neg),
        "undecided": int(undecided),
        "max_grad_norm": max(grad_norms),
        "min_grad_norm": min(grad_norms),
        "status": "STABLE" if max(grad_norms) < 10.0 and undecided < (HIDDEN_DIM * 0.2) else "UNSTABLE"
    }
    
    Path("exp46_audit_report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    audit_phase_transition()
