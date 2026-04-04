"""
Exp73: V200 Great Jump - Multi-Organ Synergy & Specialization
============================================================

Goal: Train V200 on 3 distinct domains simultaneously and measure:
1. Emergent Specialization: Do organs lock onto specific domains?
2. The Great Jump: Does 'Math' training improve 'ARC' performance?
3. Stability: How does the Colony handle domain-switching stress?

Domains:
- Math: Logical sequences (MetaMathQA style).
- Language: Semantic context (Wikipedia style).
- Vision/ARC: Topological puzzles.
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
from SKYNET_CORE_V200_MULTICELLULAR import SKYNET_CORE_V200_MULTICELLULAR

REPORT_PATH = Path("exp73_v200_great_jump_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

# --- DATA GENERATORS (Scaling simulated from real cache knowledge) ---

def generate_math_data(n=1000):
    # Logic: [A, Op, B] -> Result
    # Requires Logic/Executive organs
    x = torch.zeros(n, 5, 658).to(DEVICE)
    y = torch.zeros(n, dtype=torch.long).to(DEVICE)
    for i in range(n):
        a, b = random.randint(0, 10), random.randint(0, 10)
        x[i, 0, 100+a] = 5.0
        x[i, 1, 200] = 5.0 # '+'
        x[i, 2, 100+b] = 5.0
        y[i] = 1 if (a + b) > 10 else 0 # Threshold logic
    return x, y

def generate_lang_data(n=1000):
    # Semantic: [Subject, Verb, Object] -> Category
    # Requires Semantic/Executive organs
    x = torch.zeros(n, 5, 658).to(DEVICE)
    y = torch.zeros(n, dtype=torch.long).to(DEVICE)
    for i in range(n):
        subj = random.randint(0, 1) # 0: Animal, 1: Tool
        x[i, 0, 300+subj] = 5.0
        y[i] = subj
    return x, y

def generate_arc_data(n=1000):
    # Geometry: [Pattern] -> [Transformation]
    # Requires Geometry/Executive organs
    x = torch.zeros(n, 5, 658).to(DEVICE)
    y = torch.zeros(n, dtype=torch.long).to(DEVICE)
    for i in range(n):
        pattern = random.randint(0, 1) # 0: Dot, 1: Line
        x[i, 0, 400+pattern] = 5.0
        y[i] = pattern
    return x, y

def run_great_jump():
    print("--- INITIATING V200 GREAT JUMP EXPERIMENT ---")
    
    # 8 Specialized Organs
    model = SKYNET_CORE_V200_MULTICELLULAR(n_organs=8, device=DEVICE).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print("Step 1: Multi-Domain Parallel Training (Math, Lang, ARC)...")
    
    history = {"math": [], "lang": [], "arc": [], "routing": []}
    
    for epoch in range(60): # Double epochs
        model.train()
        datasets = [
            ("math", generate_math_data(32)),
            ("lang", generate_lang_data(32)),
            ("arc", generate_arc_data(32))
        ]
        
        for name, (x, y) in datasets:
            model.reset()
            for t in range(x.shape[1]):
                out = model(x_vision=x[:, t].unsqueeze(1))
            
            loss = F.cross_entropy(out['logits'], y)
            
            # --- ADDING LOAD BALANCING LOSS (Diversity) ---
            # Penalize the router if it only uses one organ (Entropy of weights)
            routing = out['audit']['routing']
            routing_t = torch.tensor(routing).to(DEVICE)
            entropy_loss = -0.1 * torch.sum(routing_t * torch.log(routing_t + 1e-6))
            
            total_loss = loss + entropy_loss
            
            optimizer.zero_grad()
            total_loss.backward()
            optimizer.step()
            
            history[name].append(loss.item())
        
        if (epoch+1) % 10 == 0:
            print(f"  Epoch {epoch+1} | Math Loss: {history['math'][-1]:.4f} | ARC Loss: {history['arc'][-1]:.4f}")

    print("\nStep 3: Measuring Emergent Synergy (The Great Jump)...")
    # Test: Does training on Math help solve a 'New' ARC-Logic puzzle?
    # We provide an ARC puzzle that uses Math logic (counting objects)
    x_synergy = torch.zeros(100, 5, 658).to(DEVICE)
    y_synergy = torch.zeros(100, dtype=torch.long).to(DEVICE)
    for i in range(100):
        count = random.randint(1, 5)
        for c in range(count):
            x_synergy[i, 0, 500+c] = 5.0 # Visual objects
        y_synergy[i] = 1 if count > 3 else 0 # Logic rule based on count
        
    model.eval()
    model.reset()
    correct = 0
    for t in range(5):
        out_syn = model(x_vision=x_synergy[:, t].unsqueeze(1))
    
    pred = out_syn['logits'].argmax(-1)
    acc_synergy = (pred == y_synergy).float().mean().item()
    
    print(f"Emergent Synergy Accuracy (Math + ARC): {acc_synergy:.4f}")
    
    # Analyze Final Routing
    final_routing = history['routing'][-1]
    
    report = {
        "experiment": "exp73_v200_great_jump",
        "n_organs": 8,
        "math_final_loss": history['math'][-1],
        "arc_final_loss": history['arc'][-1],
        "synergy_accuracy": acc_synergy,
        "organ_specialization": final_routing.tolist(),
        "status": "SUCCESS" if acc_synergy > 0.8 else "IMPROVING"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

import numpy as np
if __name__ == "__main__":
    run_great_jump()
