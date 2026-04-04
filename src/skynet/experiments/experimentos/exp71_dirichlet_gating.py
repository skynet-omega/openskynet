"""
Exp71: Dirichlet Energy Gating (Foundational Noise Resilience)
==============================================================

Goal: Solve the 'Noise Saturation' failure of V120 using 
Graph Spectral Theory (Dirichlet Energy).

Mathematical Foundation:
Signal 's' is smooth over graph topology (Low Dirichlet Energy).
Noise 'n' is high-frequency / uncorrelated (High Dirichlet Energy).

Dirichlet Energy: E(h) = sum_{i,j} A_ij * (h_i - h_j)^2

We implement an Adaptive Low-Pass Filter:
The Plasticity rate (eta) is inversely proportional to the 
Local Dirichlet Energy of the node.
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
from ex_hypothesis_components import DEVICE, INPUT_DIM
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp71_dirichlet_gating_results.json")

class DirichletGatedOrgan(nn.Module):
    def __init__(self, n_nodes=32, d_feature=8):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        
        # Physics Parameters
        self.mu = nn.Parameter(torch.tensor(0.45))
        self.sigma = nn.Parameter(torch.tensor(0.35))
        self.plasticity_rate = nn.Parameter(torch.tensor(0.05))
        
        # Energy Threshold: connections only form if signal is 'smooth'
        self.energy_gamma = nn.Parameter(torch.tensor(1.0)) 

    def compute_local_dirichlet_energy(self, h, A):
        """
        Calculates how much a node differs from its neighbors.
        E_i = sum_j A_ij * ||h_i - h_j||^2
        """
        B, N, F_dim = h.shape
        # Pairwise squared distances: [B, N, N]
        h_exp1 = h.unsqueeze(2) # [B, N, 1, F]
        h_exp2 = h.unsqueeze(1) # [B, 1, N, F]
        dist_sq = torch.sum((h_exp1 - h_exp2)**2, dim=-1) # [B, N, N]
        
        # Energy per node
        energy = torch.sum(A * dist_sq, dim=-1) # [B, N]
        return energy

    def forward(self, x_in, h_prev, A_prev, training=True):
        batch = x_in.shape[0]
        
        # 1. Standard Update
        h_core = torch.tanh(h_prev + 0.5 * x_in)
        
        # 2. Dirichlet Energy Calculation (The Filter)
        # We check the energy of the PROPOSED state relative to PREVIOUS topology
        energy = self.compute_local_dirichlet_energy(h_core, A_prev)
        
        # Gating: High energy (noise) -> Low plasticity
        # gate = exp(-gamma * energy)
        gate = torch.exp(-self.energy_gamma.abs() * energy) # [B, N]
        gate_mat = torch.bmm(gate.unsqueeze(2), gate.unsqueeze(1)) # [B, N, N]
        
        # 3. Liquid Diffusion
        A_norm = A_prev / (A_prev.sum(dim=-1, keepdim=True) + 1e-6)
        h_diffused = torch.bmm(A_norm, h_core)
        h = h_core + 0.2 * (h_diffused - h_core)
        
        # 4. Plasticity Gated by Dirichlet Energy
        h_normed = F.normalize(h, dim=-1)
        corr = torch.bmm(h_normed, h_normed.transpose(1, 2))
        
        # FOUNDATION: A connection only grows if BOTH nodes are in a 'Low Energy' (smooth) state.
        # This prevents noise from 'wiring' into the brain.
        eta = torch.sigmoid(self.plasticity_rate) * 0.05
        A_next = torch.clamp(A_prev + eta * (corr * gate_mat) - 0.01 * A_prev, 0.0, 1.0)
        
        idx = torch.arange(self.n_nodes, device=x_in.device)
        A_next[:, idx, idx] = 1.0
        
        return torch.tanh(h), A_next, False

class V130_Dirichlet_Brain(nn.Module):
    def __init__(self, n_input=658, n_actions=2, d_model=128, n_nodes=32, d_feature=8, device='cuda'):
        super().__init__()
        self.device = device
        self.d_model = d_model
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        self.phys_proj = nn.Linear(d_model, n_nodes * d_feature)
        self.organ = DirichletGatedOrgan(n_nodes, d_feature)
        self.readout = nn.Linear(d_model + (n_nodes * d_feature), n_actions)
        
        self.reset()

    def reset(self):
        self.cortex_state = None
        self.h_phys = None
        self.A_phys = None

    def forward_sequence(self, x_seq, training=True):
        self.reset()
        batch, steps, _ = x_seq.shape
        for t in range(steps):
            out = self.forward(x_seq[:, t], training=training)
        return out['logits']

    def forward(self, x, training=True):
        batch = x.shape[0]
        h_in = self.input_norm(self.input_proj(x))
        if self.cortex_state is None: self.cortex_state = torch.zeros(1, batch, self.d_model, device=self.device)
        h_ctx, self.cortex_state = self.cortex(h_in.unsqueeze(1), self.cortex_state)
        h_ctx = h_ctx.squeeze(1)
        
        if self.h_phys is None:
            self.h_phys = torch.zeros(batch, self.n_nodes, self.d_feature, device=self.device)
            self.A_phys = torch.eye(self.n_nodes, device=self.device).unsqueeze(0).repeat(batch, 1, 1)
            
        x_drive = self.phys_proj(h_ctx).view(batch, self.n_nodes, self.d_feature)
        self.h_phys, self.A_phys, _ = self.organ(x_drive, self.h_phys, self.A_phys, training)
        
        logits = self.readout(torch.cat([h_ctx, self.h_phys.view(batch, -1)], dim=-1))
        return {'logits': logits}

def run_dirichlet_experiment():
    random.seed(42)
    torch.manual_seed(42)
    
    # Generate Highly Noisy Data (The 'Gauntlet' from Exp69)
    def generate_noisy_task(n_samples=1000):
        seq_len = 30
        x = torch.randn(n_samples, seq_len, 658) * 0.1
        y = torch.zeros(n_samples, dtype=torch.long)
        for i in range(n_samples):
            label = random.randint(0, 1)
            y[i] = label
            # Target signal
            x[i, 0, label] = 5.0
            # Massive background noise in ALL steps
            x[i, 1:, 100:600] += torch.randn(29, 500) * 3.0
        return x.to(DEVICE), y.to(DEVICE)

    x_train, y_train = generate_noisy_task(2000)
    x_test, y_test = generate_noisy_task(500)
    
    model = V130_Dirichlet_Brain(device=DEVICE).to(DEVICE)
    
    print("--- Training V130: Dirichlet Gating vs Noise ---")
    train_on_dataset(model, x_train, y_train, max_epochs=20)
    
    acc = evaluate(model, x_test, y_test)
    density = model.A_phys.mean().item()
    
    print(f"\nFinal Noise Resilience Acc: {acc:.4f}")
    print(f"Final Topological Density: {density:.4f}")
    
    report = {
        "experiment": "exp71_dirichlet_spectral_gating",
        "mathematical_principle": "Dirichlet Energy Filtering",
        "noise_resilience_acc": acc,
        "topological_density": density,
        "status": "SUCCESS" if acc > 0.8 else "FAILURE"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_dirichlet_experiment()
