"""
Exp57: Dynamic Neurogenesis & Synaptic Pruning (V85 Hypergraph)
==============================================================

Goal: Implement physical brain scaling. The model should:
1. Detect "Capacity Saturation" (High entropy + High flux).
2. Trigger Neurogenesis: Add new nodes to the Hypergraph.
3. Perform Synaptic Pruning: Delete weak edges to maintain O(N) efficiency.

This moves OpenSkynet from a fixed-size 'bicho' to a scaling organism.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path

# Paths for imports
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))

from ex_hypothesis_components import DEVICE, INPUT_DIM
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp57_neurogenesis_results.json")

class NeurogenesisHypergraph(nn.Module):
    def __init__(self, n_initial_nodes=8, d_feature=8, n_actions=2):
        super().__init__()
        self.n_nodes = n_initial_nodes
        self.d_feature = d_feature
        self.n_actions = n_actions
        
        # Projections must be flexible or mapped per node
        # For simplicity in this core, we project to a large fixed pool 
        # but only 'activate' nodes as we grow.
        self.max_nodes = 128
        self.input_proj = nn.Linear(INPUT_DIM, self.max_nodes * d_feature)
        self.readout = nn.Linear(self.max_nodes * d_feature, n_actions)
        
        # Internal states
        self.h = None
        self.A = None
        
        # Thresholds
        self.neurogenesis_threshold = 0.8  # If avg activity is high
        self.pruning_threshold = 0.05     # If edge is too weak

    def reset(self):
        self.h = None
        self.A = None

    def grow_brain(self):
        """Adds 4 nodes to the active set."""
        if self.n_nodes + 4 <= self.max_nodes:
            self.n_nodes += 4
            print(f"  [NEUROGENESIS] Brain expanded to {self.n_nodes} nodes.")
            # We don't need to re-init A or h, the forward pass handles the new size
            return True
        return False

    def forward_sequence(self, x_seq, training=True):
        self.reset()
        batch, steps, _ = x_seq.shape
        for t in range(steps):
            logits = self.forward(x_seq[:, t], training=training)
        return logits

    def forward(self, x, training=True):
        batch = x.shape[0]
        
        # 1. State initialization
        if self.h is None:
            self.h = torch.zeros(batch, self.n_nodes, self.d_feature, device=x.device)
            self.A = torch.eye(self.n_nodes, device=x.device).unsqueeze(0).repeat(batch, 1, 1)

        # 2. Input drive (only for active nodes)
        x_full = self.input_proj(x).view(batch, self.max_nodes, self.d_feature)
        x_in = x_full[:, :self.n_nodes, :]
        
        # 3. Physics & Plasticity (Hebbian)
        h_core = torch.tanh(self.h + 0.5 * x_in)
        
        # Liquid Diffusion over current Adjacency
        # A_norm = A / sum(A)
        A_norm = self.A / (self.A.sum(dim=-1, keepdim=True) + 1e-6)
        h_diffused = torch.bmm(A_norm, h_core)
        
        self.h = h_core + 0.2 * (h_diffused - h_core)
        
        # Adjacency Update
        h_normed = F.normalize(self.h, dim=-1)
        corr = torch.bmm(h_normed, h_normed.transpose(1, 2))
        
        # Plasticity
        self.A = torch.clamp(self.A + 0.05 * corr - 0.01 * self.A, 0.0, 1.0)
        
        # --- SYNAPTIC PRUNING ---
        if training and random.random() < 0.05:
            self.A[self.A < self.pruning_threshold] = 0.0
            
        # --- NEUROGENESIS TRIGGER ---
        # If the active nodes are saturated (high avg activity), we need more capacity
        if training and self.h.abs().mean() > self.neurogenesis_threshold:
            if self.grow_brain():
                # Re-pad h and A for the new size
                new_h = torch.zeros(batch, self.n_nodes, self.d_feature, device=x.device)
                new_h[:, :self.h.shape[1], :] = self.h
                self.h = new_h
                
                new_A = torch.eye(self.n_nodes, device=x.device).unsqueeze(0).repeat(batch, 1, 1)
                new_A[:, :self.A.shape[1], :self.A.shape[2]] = self.A
                self.A = new_A

        # 4. Readout (from all possible nodes, but only n_nodes are non-zero)
        h_flat = torch.zeros(batch, self.max_nodes * self.d_feature, device=x.device)
        current_flat = self.h.reshape(batch, -1)
        h_flat[:, :current_flat.shape[1]] = current_flat
        
        logits = self.readout(h_flat)
        return logits

def generate_scaling_task(n_samples=1000):
    """
    A task that gets harder over time, requiring more 'brain' capacity.
    """
    seq_len = 30
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.1
    y = torch.zeros(n_samples, dtype=torch.long)
    for i in range(n_samples):
        label = random.randint(0, 1)
        y[i] = label
        # Harder pattern: requires keeping track of multiple dimensions
        x[i, :, 0:5] += (3.0 if label == 1 else -3.0)
    return x, y

def run_neurogenesis_experiment():
    random.seed(42)
    torch.manual_seed(42)
    
    print("Starting Neurogenesis Stress Test...")
    x_train, y_train = generate_scaling_task(2000)
    x_test, y_test = generate_scaling_task(500)
    
    # Start with a very small brain (8 nodes)
    model = NeurogenesisHypergraph(n_initial_nodes=8).to(DEVICE)
    
    print("Training with active neurogenesis...")
    train_on_dataset(model, x_train, y_train, max_epochs=20)
    
    final_nodes = model.n_nodes
    acc = evaluate(model, x_test, y_test)
    
    # Check sparsity (Pruning effect)
    sparsity = (model.A == 0).float().mean().item() if model.A is not None else 0
    
    report = {
        "experiment": "exp57_dynamic_neurogenesis",
        "initial_nodes": 8,
        "final_nodes": final_nodes,
        "test_accuracy": acc,
        "synaptic_sparsity": sparsity,
        "conclusion": "SUCCESS" if final_nodes > 8 and acc > 0.9 else "FAILED"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_neurogenesis_experiment()
