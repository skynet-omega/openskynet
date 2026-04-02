"""
Exp53: Dynamic Topology (Grafo-Génesis) - The Missing Link
==========================================================

Goal: Implement a differentiable mechanism for Dynamic Topology
(Metric Warping / Autopoiesis) where the "matter creates the space".

Mechanism:
Instead of a fixed grid (Lenia) or fixed sequence (GRU), the Organ 
maintains a dynamic Adjacency Matrix A.
A is updated via Hebbian Plasticity based on the energy/flux of the nodes.
Nodes that "fire together, wire together".
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
from ex_hypothesis_components import DEVICE, INPUT_DIM
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp53_dynamic_topology.json")

class DynamicTopologyOrgan(nn.Module):
    def __init__(self, n_nodes=16, d_feature=8, n_classes=2):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        
        # Node features encoder
        self.input_proj = nn.Linear(INPUT_DIM, n_nodes * d_feature)
        
        # Message passing neural net
        self.msg_net = nn.Sequential(
            nn.Linear(d_feature, d_feature),
            nn.Tanh()
        )
        
        # Topology Update rate
        self.plasticity_rate = nn.Parameter(torch.tensor(0.1))
        self.decay_rate = nn.Parameter(torch.tensor(0.01))
        
        self.head = nn.Linear(n_nodes * d_feature, n_classes)

    def forward_sequence(self, x_seq: torch.Tensor) -> torch.Tensor:
        batch, steps, _ = x_seq.shape
        
        # Initialize nodes [Batch, Nodes, Features]
        h = torch.zeros(batch, self.n_nodes, self.d_feature, device=x_seq.device)
        
        # Initialize Adjacency Matrix [Batch, Nodes, Nodes] (Starts empty/identity)
        A = torch.eye(self.n_nodes, device=x_seq.device).unsqueeze(0).repeat(batch, 1, 1)
        
        for t in range(steps):
            # 1. Inject input into nodes
            x_in = self.input_proj(x_seq[:, t]).view(batch, self.n_nodes, self.d_feature)
            h = h + x_in
            
            # 2. Message Passing over Dynamic Topology
            # h_next_i = sum_j A_ij * msg(h_j)
            msgs = self.msg_net(h)
            h_next = torch.bmm(A, msgs) # [B, N, N] x [B, N, F] -> [B, N, F]
            
            # 3. Dynamic Topology Update (Hebbian: Fire together, wire together)
            # Correlation between node activities (using norm of features)
            activity = torch.norm(h_next, dim=-1) # [B, N]
            # Outer product to get pairwise activity correlation
            correlation = torch.bmm(activity.unsqueeze(2), activity.unsqueeze(1)) # [B, N, N]
            
            # Update A: Grow connections where correlation is high, decay everywhere
            # A_new = A + eta * corr - lambda * A
            eta = torch.sigmoid(self.plasticity_rate)
            lam = torch.sigmoid(self.decay_rate)
            
            A_new = A + eta * correlation - lam * A
            
            # Bound A to [0, 1] and keep diagonal at 1
            A = torch.clamp(A_new, 0.0, 1.0)
            idx = torch.arange(self.n_nodes, device=x_seq.device)
            A[:, idx, idx] = 1.0
            
            h = h_next
            
        # Flatten for classification
        h_flat = h.view(batch, -1)
        return self.head(h_flat)

def generate_topology_data(n_samples=1000, seq_len=10):
    """
    Task requires associating two distinct inputs separated by time.
    Standard RNNs can learn this, but a dynamic topology might form a 
    direct edge between the input node and memory node.
    """
    x = torch.randn(n_samples, seq_len, INPUT_DIM) * 0.1
    y = torch.zeros(n_samples, dtype=torch.long)
    for i in range(n_samples):
        label = random.randint(0, 1)
        y[i] = label
        x[i, 0, label] = 2.0
    return x, y

def run_experiment():
    random.seed(42)
    torch.manual_seed(42)
    
    x_train, y_train = generate_topology_data(1000, 15)
    x_test, y_test = generate_topology_data(300, 30) # Generalization
    
    model = DynamicTopologyOrgan(n_nodes=8, d_feature=4).to(DEVICE)
    
    train_on_dataset(model, x_train, y_train, max_epochs=15)
    
    acc_test = evaluate(model, x_test, y_test)
    
    report = {
        "experiment": "exp53_dynamic_topology",
        "model": "DynamicTopologyOrgan",
        "test_acc": acc_test,
        "status": "IMPLEMENTED"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_experiment()
