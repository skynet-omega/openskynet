"""
Exp66: Complex Multimodal Synthesis (V100 - The Cognitive Test)
==============================================================

Goal: Push the V100 Singularity Core to solve a multi-step relational 
problem that requires its persistent brain and mental simulation.

The Task: "Semantic-Visual Gating"
1. Input A (Text): A concept from the distilled knowledge (e.g., 'energy', 'agi').
2. Input B (Vision): A 3x3 ARC-style grid.
3. Logical Rule: 
   - If Text is categorized as 'Physics' (Energy, Atom, etc.) -> Output = Mirror(Vision).
   - If Text is categorized as 'AGI' (Reasoning, Brain, etc.) -> Output = Rotate(Vision).
4. Requirement: The model must use its internal topology to 'categorize' 
   the word first, then apply the geometric rule to the grid.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V100_SINGULARITY import SKYNET_CORE_V100_SINGULARITY

REPORT_PATH = Path("exp66_complex_synthesis_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V100_PERSISTENT_BRAIN.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

# Defining the Ground Truth categories based on Exp65 distillation
PHYSICS_CONCEPTS = ["atom", "nucleus", "energy", "mass", "quantum", "gravity"]
AGI_CONCEPTS = ["agi", "reasoning", "neural_network", "brain", "intelligence"]

def generate_complex_multimodal_data(n_samples=1000):
    x_text = []
    x_vision = torch.zeros(n_samples, 1, 3, 3)
    y_target = torch.zeros(n_samples, 1, 3, 3) # The transformed grid
    
    for i in range(n_samples):
        # 1. Pick a word
        if random.random() > 0.5:
            word = random.choice(PHYSICS_CONCEPTS)
            mode = "mirror"
        else:
            word = random.choice(AGI_CONCEPTS)
            mode = "rotate"
            
        # Use a simple hash mapping compatible with V100 vocab
        x_text.append(hash(word) % 30000)
        
        # 2. Create a random 3x3 pattern
        grid = torch.randint(0, 2, (1, 3, 3)).float()
        x_vision[i] = grid
        
        # 3. Apply the rule
        if mode == "mirror":
            y_target[i] = torch.flip(grid, dims=[-1])
        else:
            y_target[i] = torch.rot90(grid, k=1, dims=[-2, -1])
            
    return torch.tensor(x_text).to(DEVICE), x_vision.to(DEVICE), y_target.to(DEVICE)

def run_complex_audit():
    print("--- RUNNING V100 COMPLEX SYNTHESIS TEST ---")
    
    # 1. Load V100 with persistent brain
    model = SKYNET_CORE_V100_SINGULARITY(vocab_size=30000, n_nodes=512, device=DEVICE).to(DEVICE)
    if CHECKPOINT_PATH.exists():
        model.load_checkpoint(CHECKPOINT_PATH)
    else:
        print("Warning: No persistent brain found. Test will run on untrained topology.")

    # 2. Generate Data
    t_data, v_data, y_data = generate_complex_multimodal_data(500)
    
    # 3. Modify Readout for Grid Prediction (Instead of binary classification)
    # We add a simple adapter for this specific task
    model.readout = nn.Linear(model.d_model + (512 * 32), 3 * 3).to(DEVICE)
    
    # 4. Training (Few-Shot fine-tuning on the rule)
    print("Fine-tuning V100 on Multimodal Logical Rule...")
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.MSELoss()
    
    model.train()
    for epoch in range(15):
        model.reset()
        out = model(x_text=t_data, x_vision=v_data)
        loss = criterion(out['logits'], y_data.view(-1, 9))
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (epoch+1) % 5 == 0:
            print(f"  Epoch {epoch+1}, Loss: {loss.item():.4f}")

    # 5. Evaluation
    model.eval()
    t_test, v_test, y_test = generate_complex_multimodal_data(100)
    model.reset()
    with torch.no_grad():
        out = model(x_text=t_test, x_vision=v_test)
        pred_grids = out['logits'].view(-1, 1, 3, 3).round()
        # Accuracy = exact match of the entire 3x3 grid
        matches = torch.all(pred_grids == y_test, dim=(1, 2, 3)).float().mean().item()
        
    print(f"\nFinal Complex Task Accuracy (Grid Exact Match): {matches:.4f}")
    
    report = {
        "experiment": "exp66_complex_multimodal_synthesis",
        "task": "Semantic Gating of Geometric Transforms",
        "persistent_brain_loaded": CHECKPOINT_PATH.exists(),
        "training_loss_final": loss.item(),
        "exact_match_accuracy": matches,
        "status": "SUCCESS" if matches > 0.8 else "FAILURE"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_complex_audit()
