"""
SKYNET CORE V8000: SINGULARITY (The True Physical Cyborg)
=========================================================

REFACTORIZATION (100%):
Abandoning the "fake physics" of FFT/Mamba LLMs. Returning to the empirically 
proven foundations of V28 and Exp50: The Biphasic Continuous Organ.

Upgrades to solve the "Binding Problem":
- Added an Episodic Pointer Network. The Brain now computes a "p_gen" 
  (probability of generation vs copying) and can directly route attention 
  to its recent short-term memory to copy variables (like subjects) that 
  would otherwise dissolve in the continuous diffusion of the organ.

Architecture:
1. Perception: Whole-word embeddings.
2. Cortex (Discrete): GRUCell. Handles logical routing.
3. Organ (Continuous): Physical 1D ring substrate (Lenia + Double-Well).
4. Bridge: Bidirectional feedback.
5. Episodic Pointer: Explicit short-term variable binding.
"""

import torch
import torch.nn as nn
from typing import Tuple
import math

class ContinuousOrgan(nn.Module):
    """
    The Physical Substrate (Biphasic).
    Fluid mechanics (Diffusion) vs Solid mechanics (Crystallization).
    """
    def __init__(self, drive_dim: int, organ_dim: int):
        super().__init__()
        self.organ_dim = organ_dim
        self.drive_proj = nn.Linear(drive_dim, organ_dim)
        
        # Temperature network: Decides whether to be fluid or crystal
        self.temp_net = nn.Sequential(
            nn.Linear(drive_dim + organ_dim, organ_dim),
            nn.Tanh(),
            nn.Linear(organ_dim, organ_dim),
        )
        
        self.dt = 0.12
        # Physical constants (learned)
        self.log_diffusion = nn.Parameter(torch.tensor(-2.4))
        self.log_dissipation = nn.Parameter(torch.tensor(-1.7))
        self.log_crystal = nn.Parameter(torch.tensor(-0.3))
        self.temp_bias = nn.Parameter(torch.tensor(-1.1))

    def init_state(self, batch_size: int, device: str) -> torch.Tensor:
        return torch.zeros(batch_size, self.organ_dim, device=device)

    def step(self, drive: torch.Tensor, state: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        fluid_drive = torch.tanh(self.drive_proj(drive))
        temp = torch.sigmoid(self.temp_net(torch.cat([drive, state], dim=-1)) + self.temp_bias)

        left = torch.roll(state, 1, dims=-1)
        right = torch.roll(state, -1, dims=-1)
        laplacian = left + right - 2.0 * state

        h_core = torch.tanh(state)
        crystal_force = h_core - torch.pow(h_core, 3)

        diffusion = self.log_diffusion.exp() * laplacian
        dissipation = self.log_dissipation.exp() * state
        crystal = self.log_crystal.exp() * crystal_force

        delta = temp * (fluid_drive + diffusion) + (1.0 - temp) * crystal - dissipation
        next_state = state + self.dt * delta
        return next_state, temp


class SKYNET_CORE_V8000_SINGULARITY(nn.Module):
    def __init__(self, vocab_size: int, d_model: int = 384, cortex_dim: int = 128, 
                 organ_dim: int = 256, pretrained_embeds=None, device='cuda'):
        super().__init__()
        self.device = device
        self.vocab_size = vocab_size
        self.d_model = d_model
        self.cortex_dim = cortex_dim
        self.organ_dim = organ_dim
        
        # --- PERCEPTION ---
        self.embed = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            self.embed.weight.data = pretrained_embeds.to(device)
            
        self.input_proj = nn.Linear(d_model, cortex_dim)
        self.norm = nn.LayerNorm(cortex_dim)
        
        # --- CORTEX (Discrete Logic) ---
        self.cortex = nn.GRUCell(cortex_dim, cortex_dim)
        
        # --- ORGAN (Physical Memory) ---
        self.organ = ContinuousOrgan(cortex_dim + d_model, organ_dim)
        
        # --- BRIDGE (Cortex <-> Organ) ---
        self.bridge_gate = nn.Sequential(
            nn.Linear(cortex_dim + organ_dim, cortex_dim),
            nn.Tanh(),
            nn.Linear(cortex_dim, cortex_dim),
            nn.Sigmoid(),
        )
        self.organ_to_cortex = nn.Linear(organ_dim, cortex_dim)
        
        # --- READOUT (Generative) ---
        self.head = nn.Linear(cortex_dim + organ_dim, vocab_size)
        
        # --- EPISODIC POINTER NETWORK (The Binding Fix) ---
        self.pointer_query = nn.Linear(cortex_dim + organ_dim, cortex_dim)
        self.pointer_key = nn.Linear(cortex_dim, cortex_dim)
        self.p_gen_net = nn.Sequential(
            nn.Linear(cortex_dim + organ_dim, 1),
            nn.Sigmoid()
        )

        with torch.no_grad():
            self.bridge_gate[2].bias.fill_(-2.0)
            self.bridge_gate[2].weight.mul_(0.25)
            self.organ_to_cortex.weight.mul_(0.15)
            self.organ_to_cortex.bias.zero_()

        self.reset()

    def reset(self):
        self.h_cortex = None
        self.h_organ = None
        self.cortex_history = []

    def forward(self, x_seq: torch.Tensor, training=True):
        batch, steps = x_seq.shape
        
        if self.h_cortex is None or self.h_cortex.shape[0] != batch:
            self.h_cortex = torch.zeros(batch, self.cortex_dim, device=self.device)
            self.h_organ = self.organ.init_state(batch, self.device)
            self.cortex_history = []
            # We also need to keep track of ALL tokens seen so far for the pointer
            self.token_history = []
            
        logits_seq = []
        temperatures = []
        
        for t in range(steps):
            current_token = x_seq[:, t:t+1] # [B, 1]
            self.token_history.append(current_token)
            
            x_t_raw = self.embed(current_token.squeeze(1))
            x_t = self.norm(self.input_proj(x_t_raw))
            
            # 1. Cortex processes the token
            self.h_cortex = self.cortex(x_t, self.h_cortex)
            self.cortex_history.append(self.h_cortex)
            
            # 2. Physics processes
            drive = torch.cat([x_t_raw, self.h_cortex], dim=-1)
            self.h_organ, temp = self.organ.step(drive, self.h_organ)
            
            # 3. Organ feeds back to Cortex
            bridge = self.bridge_gate(torch.cat([self.h_cortex, self.h_organ], dim=-1))
            self.h_cortex = self.h_cortex + bridge * torch.tanh(self.organ_to_cortex(self.h_organ))
            
            # 4. Generate Output (Generative + Pointer)
            fused_state = torch.cat([self.h_cortex, self.h_organ], dim=-1)
            
            # Generative branch
            gen_logits = self.head(fused_state)
            gen_probs = torch.softmax(gen_logits, dim=-1)
            
            # Pointer branch (Attention over history)
            query = self.pointer_query(fused_state) # [B, cortex_dim]
            keys = self.pointer_key(torch.stack(self.cortex_history, dim=1)) # [B, t+1, cortex_dim]
            
            attn = torch.einsum('bd,btd->bt', query, keys) / math.sqrt(self.cortex_dim)
            attn_probs = torch.softmax(attn, dim=-1) # [B, t+1]
            
            # Mixture weight
            p_gen = self.p_gen_net(fused_state) # [B, 1]
            
            # Combine probabilities
            final_probs = p_gen * gen_probs
            past_tokens = torch.cat(self.token_history, dim=1) # [B, t+1]
            
            # Scatter add pointer probabilities to the vocabulary distribution
            final_probs.scatter_add_(1, past_tokens, (1.0 - p_gen) * attn_probs)
            
            # Convert back to pseudo-logits for cross_entropy compatibility
            logits_t = torch.log(final_probs + 1e-8)
            
            logits_seq.append(logits_t)
            temperatures.append(temp.mean().item())
            
        return {
            'logits': torch.stack(logits_seq, dim=1),
            'temperature': temperatures[-1],
            'p_gen': p_gen.mean().item() if 'p_gen' in locals() else 1.0
        }
