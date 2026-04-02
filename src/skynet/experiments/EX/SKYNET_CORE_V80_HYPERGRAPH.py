"""
SKYNET CORE V80: HYPERGRAPH (The Liquid Brain)
==============================================

This core represents the integration of Biphasic Physics and Dynamic Topology.
It moves beyond fixed matrices to a fully autopoietic substrate where
matter (nodes) creates space (adjacency) on the fly based on the signal.

Key Innovations:
1. Dynamic Topology: The adjacency matrix A_t evolves via Hebbian Plasticity.
2. Topological Wells: The Mexican Hat force allows nodes to "crystallize"
   and resist catastrophic erasure and noise.
3. Liquid Diffusion: Information flows through the dynamic network, allowing
   logic-over-time and spatial abstraction.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F

class LiquidBrainOrgan(nn.Module):
    """
    The physical organ of the V80 Hypergraph.
    """
    def __init__(self, n_nodes=32, d_feature=8):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        self.hidden_dim = n_nodes * d_feature
        
        # Physics Parameters
        self.mu = nn.Parameter(torch.tensor(0.45))
        self.sigma = nn.Parameter(torch.tensor(0.35))
        
        # Plasticity
        self.plasticity_rate = nn.Parameter(torch.tensor(0.05))
        self.decay_rate = nn.Parameter(torch.tensor(0.005))

    def g_fluid(self, h):
        return 2.0 * torch.exp(-((h - self.mu)**2) / (2 * self.sigma**2 + 1e-6)) - 1.0

    def forward(self, h_ctx, x_in, A_prev=None, h_prev=None):
        """
        Single step forward for the physical organ.
        x_in: [B, N, F] drive from cortex/input
        h_prev: [B, N, F] previous physical state
        A_prev: [B, N, N] previous topology
        """
        batch = x_in.shape[0]
        
        if h_prev is None:
            h_prev = torch.zeros(batch, self.n_nodes, self.d_feature, device=x_in.device)
        if A_prev is None:
            A_prev = torch.eye(self.n_nodes, device=x_in.device).unsqueeze(0).repeat(batch, 1, 1)
            
        # 1. Input injection with damping
        x_damped = x_in / (1.0 + torch.norm(x_in, dim=-1, keepdim=True) * 0.1)
        
        # 2. Biphasic Interaction + Topological Well (Mexican Hat)
        h_core = torch.tanh(h_prev + 0.5 * x_damped)
        force = (h_core - torch.pow(h_core, 3)).detach()
        h = h_core + 0.35 * force 
        
        # 3. Liquid Diffusion
        A_norm = A_prev / (A_prev.sum(dim=-1, keepdim=True) + 1e-6)
        h_diffused = torch.bmm(A_norm, h)
        h = h + 0.2 * (h_diffused - h)
        
        # 4. Topology Update (Plasticity)
        h_normed = F.normalize(h, dim=-1)
        corr = torch.bmm(h_normed, h_normed.transpose(1, 2))
        
        eta = torch.sigmoid(self.plasticity_rate) * 0.05
        lam = torch.sigmoid(self.decay_rate) * 0.01
        
        A_next = torch.clamp(A_prev + eta * corr - lam * A_prev, 0.0, 1.0)
        
        # Self-loop preservation
        idx = torch.arange(self.n_nodes, device=x_in.device)
        A_next[:, idx, idx] = 1.0
        
        h_next = torch.tanh(h)
        
        return h_next, A_next

class SKYNET_CORE_V80_HYPERGRAPH(nn.Module):
    """
    SKYNET V80: THE HYPERGRAPH
    Neural Cortex coupled with the Liquid Brain Organ.
    """
    def __init__(self, n_input=658, n_actions=20, d_model=128, n_nodes=32, d_feature=8, device='cuda'):
        super().__init__()
        self.device = device
        self.d_model = d_model
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        
        self.phys_proj = nn.Linear(d_model, n_nodes * d_feature)
        self.organ = LiquidBrainOrgan(n_nodes=n_nodes, d_feature=d_feature)
        
        # Readout
        self.readout = nn.Linear(d_model + (n_nodes * d_feature), n_actions)
        
        self.cortex_state = None
        self.organ_state = None
        self.topology_state = None

    def reset(self):
        self.cortex_state = None
        self.organ_state = None
        self.topology_state = None

    def detach_states(self):
        if self.cortex_state is not None: self.cortex_state = self.cortex_state.detach()
        if self.organ_state is not None: self.organ_state = self.organ_state.detach()
        if self.topology_state is not None: self.topology_state = self.topology_state.detach()

    def forward_sequence(self, x_seq, training=True):
        """
        Processes a full sequence and returns the final logits.
        Compatible with sequential benchmarks.
        """
        self.reset()
        batch, steps, _ = x_seq.shape
        for t in range(steps):
            out = self.forward(x_seq[:, t], training=training)
        return out['logits']

    def forward(self, x, training=True):
        batch = x.shape[0]
        if x.dim() == 3:
            x = x.view(batch, -1)
            
        h_in = self.input_norm(self.input_proj(x))
        
        if self.cortex_state is None or self.cortex_state.shape[1] != batch:
            self.cortex_state = torch.zeros(1, batch, self.d_model, device=x.device)
            
        h_ctx, self.cortex_state = self.cortex(h_in.unsqueeze(1), self.cortex_state)
        h_ctx = h_ctx.squeeze(1)
        
        # Drive the physical organ
        phys_drive = self.phys_proj(h_ctx).view(batch, self.n_nodes, self.d_feature)
        
        self.organ_state, self.topology_state = self.organ(
            h_ctx, phys_drive, A_prev=self.topology_state, h_prev=self.organ_state
        )
        
        h_phys_flat = self.organ_state.view(batch, -1)
        h_fused = torch.cat([h_ctx, h_phys_flat], dim=-1)
        
        logits = self.readout(h_fused)
        probs = F.softmax(logits, dim=-1)
        entropy = -(probs * torch.log(probs + 1e-6)).sum(-1, keepdim=True)
        
        audit = {
            'topology_density': self.topology_state.mean().item(),
            'phys_flux': self.organ_state.abs().mean().item(),
            'entropy': entropy.mean().item()
        }
        
        return {
            'logits': logits,
            'probs': probs,
            'entropy': entropy,
            'audit': audit
        }

if __name__ == "__main__":
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = SKYNET_CORE_V80_HYPERGRAPH(device=device).to(device)
    x = torch.randn(4, 658, device=device)
    out = model(x)
    print("V80 Hypergraph Forward Pass Successful.")
    print(f"Logits Shape: {out['logits'].shape}")
    print(f"Audit: {out['audit']}")
