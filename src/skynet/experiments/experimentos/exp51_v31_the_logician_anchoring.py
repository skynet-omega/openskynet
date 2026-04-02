"""
Exp51: V31 THE LOGICIAN - Symbolic Anchoring (DSL Snapping)
=========================================================

Hypothesis from Thesis (Chapter 11):
"La física pura (Pax 98.8%) siempre tendrá un 'error de un píxel' fatal 
para el ARC. La red neuronal (Cuerpo) debe proponer una intuición, y 
un motor simbólico (Cerebro) debe 'encajarla' en la regla discreta 
más cercana (DSL Snapping)."

This experiment simulates the 'Final Pixel Problem':
1. Neural Output: A continuous, slightly fuzzy 3x3 grid (98% correct).
2. DSL Anchoring: A set of discrete transformations (Rotate, Flip, Recolor).
3. The Snap: Comparing the fuzzy intuition against all legal DSL 
   transformations to find the Exact Match.
"""

import torch
import torch.nn.functional as F
import json
from pathlib import Path

def dsl_transform_rotate(grid):
    return torch.rot90(grid, k=1, dims=(-2, -1))

def dsl_transform_flip(grid):
    return torch.flip(grid, dims=[-1])

def dsl_transform_identity(grid):
    return grid

def symbolic_anchoring_audit():
    torch.manual_seed(42)
    
    # 1. The Ground Truth (The perfect ARC solution)
    # A simple 3x3 pattern: a diagonal
    target = torch.tensor([[[[1, 0, 0], [0, 1, 0], [0, 0, 1]]]], dtype=torch.float32)
    
    # 2. The Neural 'Intuition' (V28/V29 output)
    # It's almost perfect, but has 'pixel bleed' or small errors (98% precision)
    # This is what prevents the 100% Exact Match.
    neural_fuzzy = target.clone()
    neural_fuzzy[0, 0, 0, 1] = 0.55  # Large ghost pixel (error, rounding -> 1.0)
    neural_fuzzy[0, 0, 2, 2] = 0.45  # Weak activation (error, rounding -> 0.0)
    
    # 3. The DSL Library (The 'Logician's' tools)
    # In V31, we assume the agent knows a set of discrete symmetry rules.
    input_pattern = torch.tensor([[[[0, 0, 1], [0, 1, 0], [1, 0, 0]]]], dtype=torch.float32) # The input
    
    dsl_candidates = {
        "identity": dsl_transform_identity(input_pattern),
        "rotate_90": dsl_transform_rotate(input_pattern),
        "flip_h": dsl_transform_flip(input_pattern)
    }
    
    # 4. THE SNAP (The V31 Core Mechanism)
    # We compare the fuzzy neural intuition against all discrete DSL outputs.
    # We choose the one with the minimum distance (MSE) to 'snap' the output.
    
    snapped_name = None
    min_dist = float('inf')
    distances = {}
    
    for name, candidate in dsl_candidates.items():
        # Correlation/Distance between fuzzy neural thought and discrete rule
        dist = F.mse_loss(neural_fuzzy, candidate).item()
        distances[name] = dist
        if dist < min_dist:
            min_dist = dist
            snapped_name = name
            
    final_output = dsl_candidates[snapped_name]
    
    # 5. Accuracy Check
    neural_exact_match = torch.allclose(neural_fuzzy.round(), target) # Standard rounding
    snapped_exact_match = torch.allclose(final_output, target)
    
    report = {
        "experiment": "exp51_v31_the_logician_anchoring",
        "neural_intuition_mse": F.mse_loss(neural_fuzzy, target).item(),
        "neural_exact_match": bool(neural_exact_match),
        "dsl_distances": distances,
        "selected_rule": snapped_name,
        "snapped_exact_match": bool(snapped_exact_match),
        "conclusion": "SUCCESS" if snapped_exact_match and not neural_exact_match else "FAILED"
    }
    
    Path("exp51_logician_audit.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    symbolic_anchoring_audit()
