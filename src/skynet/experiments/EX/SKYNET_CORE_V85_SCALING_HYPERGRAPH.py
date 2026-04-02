"""
SKYNET CORE V85: SCALING HYPERGRAPH (The Living Brain)
=====================================================

Integration of V80 (Dynamic Topology) with V85 (Neurogenesis & Pruning).
This core implements physical brain expansion and synaptic cleaning.

Features:
1. Dynamic Topology: Adjacency A_t evolves via Hebbian Plasticity.
2. Neurogenesis: Adds nodes when hidden state saturation is detected.
3. Synaptic Pruning: Deletes edges with weight < threshold.
4. Higgs Decision: Mexican Hat force for stable commitments.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

class ScalingHypergraphOrgan(nn.Module):
    def __init__(self, n_initial_nodes=16, d_feature=8, max_nodes=128):
        super().__init__()
        self.n_nodes = n_initial_nodes
        self.d_feature = d_feature
        self.max_nodes = max_nodes
        
        # Hyperparameters
        self.mu = nn.Parameter(torch.tensor(0.45))
        self.sigma = nn.Parameter(torch.tensor(0.35))
        self.plasticity_rate = nn.Parameter(torch.tensor(0.05))
        self.decay_rate = nn.Parameter(torch.tensor(0.005))
        
        self.neuro_threshold = 0.75
        self.pruning_threshold = 0.02

    def forward(self, x_in, h_prev, A_prev, training=True):
        batch = x_in.shape[0]
        
        # 1. Biphasic Physics + Mexican Hat
        h_core = torch.tanh(h_prev + 0.5 * x_in)
        force = (h_core - torch.pow(h_core, 3)).detach()
        h = h_core + 0.3 * force 
        
        # 2. Liquid Diffusion (Communication)
        A_norm = A_prev / (A_prev.sum(dim=-1, keepdim=True) + 1e-6)
        h_diffused = torch.bmm(A_norm, h)
        h = h + 0.2 * (h_diffused - h)
        
        # 3. Plasticity
        h_normed = F.normalize(h, dim=-1)
        corr = torch.bmm(h_normed, h_normed.transpose(1, 2))
        
        eta = torch.sigmoid(self.plasticity_rate) * 0.05
        lam = torch.sigmoid(self.decay_rate) * 0.01
        A_next = torch.clamp(A_prev + eta * corr - lam * A_prev, 0.0, 1.0)
        
        # Synaptic Pruning
        if training:
            A_next[A_next < self.pruning_threshold] = 0.0
            
        # Self-loops
        idx = torch.arange(self.n_nodes, device=x_in.device)
        A_next[:, idx, idx] = 1.0
        
        h_next = torch.tanh(h)
        
        # 4. Neurogenesis Trigger
        should_grow = False
        if training and h_next.abs().mean() > self.neuro_threshold and self.n_nodes + 4 <= self.max_nodes:
            should_grow = True
            
        return h_next, A_next, should_grow

class SKYNET_CORE_V85_SCALING_HYPERGRAPH(nn.Module):
    def __init__(self, n_input=658, n_actions=20, d_model=128, n_initial_nodes=16, d_feature=8, max_nodes=128, device='cuda'):
        super().__init__()
        self.device = device
        self.max_nodes = max_nodes
        self.d_feature = d_feature
        self.d_model = d_model
        
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        
        # Fixed pool projection (for max capacity)
        self.phys_proj = nn.Linear(d_model, max_nodes * d_feature)
        self.organ = ScalingHypergraphOrgan(n_initial_nodes, d_feature, max_nodes)
        
        self.readout = nn.Linear(d_model + (max_nodes * d_feature), n_actions)
        
        self.reset()

    def reset(self):
        self.cortex_state = None
        self.h_phys = None
        self.A_phys = None

    def grow(self, batch):
        old_n = self.organ.n_nodes
        self.organ.n_nodes += 4
        new_n = self.organ.n_nodes
        
        # Expand states
        new_h = torch.zeros(batch, new_n, self.d_feature, device=self.device)
        new_h[:, :old_n, :] = self.h_phys
        self.h_phys = new_h
        
        new_A = torch.eye(new_n, device=self.device).unsqueeze(0).repeat(batch, 1, 1)
        new_A[:, :old_n, :old_n] = self.A_phys
        self.A_phys = new_A

    def forward(self, x, training=True):
        batch = x.shape[0]
        if x.dim() == 3: x = x.view(batch, -1)
        
        h_in = self.input_norm(self.input_proj(x))
        if self.cortex_state is None:
            self.cortex_state = torch.zeros(1, batch, self.d_model, device=x.device)
            
        h_ctx, self.cortex_state = self.cortex(h_in.unsqueeze(1), self.cortex_state)
        h_ctx = h_ctx.squeeze(1)
        
        if self.h_phys is None:
            self.h_phys = torch.zeros(batch, self.organ.n_nodes, self.d_feature, device=x.device)
            self.A_phys = torch.eye(self.organ.n_nodes, device=x.device).unsqueeze(0).repeat(batch, 1, 1)
            
        # Drive
        full_drive = self.phys_proj(h_ctx).view(batch, self.max_nodes, self.d_feature)
        x_drive = full_drive[:, :self.organ.n_nodes, :]
        
        self.h_phys, self.A_phys, should_grow = self.organ(x_drive, self.h_phys, self.A_phys, training)
        
        if should_grow:
            self.grow(batch)
            
        # Padded readout
        h_full = torch.zeros(batch, self.max_nodes, self.d_feature, device=x.device)
        h_full[:, :self.organ.n_nodes, :] = self.h_phys
        
        h_fused = torch.cat([h_ctx, h_full.view(batch, -1)], dim=-1)
        logits = self.readout(h_fused)
        
        return {
            'logits': logits,
            'audit': {'nodes': self.organ.n_nodes, 'sparsity': (self.A_phys == 0).float().mean().item()}
        }

if __name__ == "__main__":
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = SKYNET_CORE_V85_SCALING_HYPERGRAPH(device=device).to(device)
    for _ in range(5):
        x = torch.randn(2, 658, device=device)
        out = model(x)
        print(f"Nodes: {out['audit']['nodes']}, Sparsity: {out['audit']['sparsity']:.2f}")
