"""
Exp54: Liquid Brain Core (Biphasic Diffusion + Dynamic Topology)
================================================================

The "Merge": Integrating Dynamic Topology (Exp53) with Biphasic 
Diffusion (V28). This creates a 'Liquid Brain' where:
1. Signal flows through a physical field (Diffusion).
2. The field's conductivity (Adjacency) evolves based on the signal (Plasticity).
3. The signal's growth is governed by phase transitions (Biphasic).

Equation:
h_{t+1} = G(h, T) + Diffusion(A_dynamic, h)
A_{t+1} = Plasticity(A_t, h)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
from ex_hypothesis_components import DEVICE, INPUT_DIM, HIDDEN_DIM
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp54_liquid_brain_results.json")

class LiquidBrainOrgan(nn.Module):
    def __init__(self, n_nodes=32, d_feature=8, n_classes=2):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        self.hidden_dim = n_nodes * d_feature
        
        self.input_proj = nn.Linear(INPUT_DIM, self.hidden_dim)
        
        # Biphasic Growth parameters (Standard Biphasic)
        self.mu = nn.Parameter(torch.tensor(0.45))
        self.sigma = nn.Parameter(torch.tensor(0.35))
        
        # Dynamic Topology (Plasticity)
        self.plasticity_rate = nn.Parameter(torch.tensor(0.05))
        self.decay_rate = nn.Parameter(torch.tensor(0.005))
        
        self.head = nn.Linear(self.hidden_dim, n_classes)

    def g_fluid(self, h):
        """Standard Lenia-style growth."""
        return 2.0 * torch.exp(-((h - self.mu)**2) / (2 * self.sigma**2 + 1e-6)) - 1.0

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        h = torch.zeros(batch, self.n_nodes, self.d_feature, device=x_seq.device)
        
        # Adjacency starts as sparse Identity
        A = torch.eye(self.n_nodes, device=x_seq.device).unsqueeze(0).repeat(batch, 1, 1)
        
        for t in range(steps):
            # 1. Drive - stronger injection
            x_in = self.input_proj(x_seq[:, t]).view(batch, self.n_nodes, self.d_feature)
            
            # 2. Biphasic Growth (Interaction)
            # Use tanh to keep growth bounded and non-linear
            h = torch.tanh(h + 0.5 * x_in)
            growth = self.g_fluid(h)
            h = h + 0.2 * growth
            
            # 3. Liquid Diffusion (Communication over Dynamic Topology)
            # Normalize A to prevent explosion (Row-normalization)
            A_norm = A / (A.sum(dim=-1, keepdim=True) + 1e-6)
            h_diffused = torch.bmm(A_norm, h)
            
            # Diffusion update: move towards neighbors
            h = h + 0.3 * (h_diffused - h)
            
            # 4. Topology Update (Fire together, wire together)
            # Enhanced Hebbian: use cosine similarity for topology growth
            h_normed = F.normalize(h, dim=-1)
            corr = torch.bmm(h_normed, h_normed.transpose(1, 2)) # [B, N, N]
            
            eta = torch.sigmoid(self.plasticity_rate) * 0.1 # Slower, more stable plasticity
            lam = torch.sigmoid(self.decay_rate) * 0.05
            
            # Update Adjacency
            A = torch.clamp(A + eta * corr - lam * A, 0.0, 1.0)
            
            # Maintain identity for self-loop stability
            idx = torch.arange(self.n_nodes, device=x_seq.device)
            A[:, idx, idx] = 1.0
            
            h = torch.tanh(h)
            
        h_flat = h.view(batch, -1)
        return self.head(h_flat)

def generate_logic_over_time_data(n_samples=1500, seq_len=30):
    """
    Complex task: X at T=0, Y at T=15. 
    Label is XOR(X, Y).
    Requires the organ to hold X in a specific 'node' and then 
    connect it to Y's node when Y arrives.
    """
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.1
    y = torch.zeros(n_samples, dtype=torch.long)
    
    for i in range(n_samples):
        val_x = random.randint(0, 1)
        val_y = random.randint(0, 1)
        
        x[i, 0, 0] = 3.0 if val_x == 1 else -3.0
        x[i, 15, 1] = 3.0 if val_y == 1 else -3.0
        
        y[i] = 1 if (val_x != val_y) else 0 # XOR
        
    return x, y

def run_liquid_brain_benchmark():
    random.seed(123)
    torch.manual_seed(123)
    
    print("Generating Temporal XOR (Logic-over-time) data...")
    x_train, y_train = generate_logic_over_time_data(1500, 30)
    x_test, y_test = generate_logic_over_time_data(400, 60) # Extended sequence
    
    model = LiquidBrainOrgan(n_nodes=16, d_feature=8).to(DEVICE)
    
    print("Training Liquid Brain...")
    train_on_dataset(model, x_train, y_train, max_epochs=25)
    
    acc = evaluate(model, x_test, y_test)
    print(f"Final Accuracy: {acc:.4f}")
    
    report = {
        "experiment": "exp54_liquid_brain_core",
        "test_acc": acc,
        "n_nodes": 16,
        "d_feature": 8,
        "status": "CONSOLIDATED"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_liquid_brain_benchmark()
