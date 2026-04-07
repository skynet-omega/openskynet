"""
Exp88_V29: Back to the Roots (V28 Physical Cyborg with Whole Words)
===================================================================

Goal: The user correctly identified that the recent FFT/Mamba architectures 
deviated too far from the original, successful Physical Cyborg (V28) and 
Singularity (V100) ideas. Those earlier models used actual physics 
(Biphasic Growth, Lenia, Double-Well, Dirichlet Energy, Temperature T) to 
create true Spontaneous Symmetry Breaking (Crystal vs Fluid states).

Here, we return to the V28/V100 roots. We will use:
1. A discrete cortex (GRU) to learn the routing and Temperature (T).
2. A continuous physical organ using Biphasic Growth (Lenia + Double Well).
3. The new WHOLE-WORD Dictionary to avoid the tokenization flaw we discovered.

We will test this "True Physical Cyborg" on the Causal Atoms task to see if 
it recovers the deep reasoning capabilities of the earlier versions.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
import random
import re
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
# We will reimplement the V28 core locally here for clarity and focus on the Causal Atoms task.

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

# --- V28 PHYSICAL COMPONENTS ---

class BiphasicGrowth(nn.Module):
    """
    G(h, T) = T * G_fluid(h) + (1-T) * G_crystal(h)
    Fluid: Lenia-style continuous abstraction.
    Crystal: Double-well potential for discrete memory/decisions.
    """
    def __init__(self, d_state, dt=0.1):
        super().__init__()
        self.d_state = d_state
        self.dt = dt
        self.mu = nn.Parameter(torch.tensor(0.4))
        self.sigma = nn.Parameter(torch.tensor(0.3))
        self.crystal_strength = nn.Parameter(torch.tensor(1.0))

    def g_fluid(self, h):
        sigma_safe = torch.clamp(self.sigma.abs(), min=0.3)
        return 2.0 * torch.exp(-((h - self.mu) ** 2) / (2 * sigma_safe ** 2 + 1e-6)) - 1.0

    def g_crystal(self, h):
        h_core = torch.tanh(h)
        force = h_core - torch.pow(h_core, 3)
        return self.crystal_strength.abs() * force.detach()

    def forward(self, h, T):
        g_f = self.g_fluid(h)
        g_c = self.g_crystal(h)
        return self.dt * (T * g_f + (1.0 - T) * g_c)

class SKYNET_CORE_V28_REBORN(nn.Module):
    """
    The True Physical Cyborg:
    - Discrete Cortex (GRU) that learns to navigate the dictionary.
    - Physical Organ (Biphasic Growth) that acts as the causal memory.
    """
    def __init__(self, vocab_size, d_model=384, d_state=64, pretrained_embeds=None):
        super().__init__()
        self.vocab_size = vocab_size
        self.d_model = d_model
        self.d_state = d_state
        
        # Whole-word embeddings
        self.embed = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            self.embed.weight.data = pretrained_embeds.to(DEVICE)
            
        # The Cortex (Discrete Logic & Routing)
        self.cortex = nn.GRUCell(d_model, d_model)
        
        # The Physics Interface
        self.to_physics = nn.Linear(d_model, d_state)
        self.temperature_net = nn.Sequential(
            nn.Linear(d_model, d_state),
            nn.Sigmoid() # T in [0, 1]. 0=Crystal(Memory), 1=Fluid(Abstraction)
        )
        
        # The Physical Organ
        self.biphasic = BiphasicGrowth(d_state)
        
        # The Decoder (Reading the physical state)
        self.readout = nn.Linear(d_model + d_state, vocab_size)

        self.reset()

    def reset(self):
        self.h_cortex = None
        self.h_physics = None

    def forward(self, x_seq, training=True):
        batch, seq_len = x_seq.shape
        
        if self.h_cortex is None or self.h_cortex.shape[0] != batch:
            self.h_cortex = torch.zeros(batch, self.d_model, device=DEVICE)
            self.h_physics = torch.zeros(batch, self.d_state, device=DEVICE)
            
        logits_seq = []
        temperatures = []
        
        for t in range(seq_len):
            x_t = self.embed(x_seq[:, t])
            
            # 1. Neural Routing
            self.h_cortex = self.cortex(x_t, self.h_cortex)
            
            # 2. Physics Interface (Drive & Temperature)
            drive = self.to_physics(self.h_cortex)
            T = self.temperature_net(self.h_cortex)
            
            # 3. Physical Simulation (Dissipative Substrate)
            # Add drive to physics
            self.h_physics = self.h_physics + 0.1 * drive
            # Apply Biphasic Growth (The core V28 innovation)
            self.h_physics = self.h_physics + self.biphasic(self.h_physics, T)
            # Dissipation to prevent explosion
            self.h_physics = self.h_physics * 0.95
            
            # 4. Readout
            fused_state = torch.cat([self.h_cortex, self.h_physics], dim=-1)
            logits_t = self.readout(fused_state)
            logits_seq.append(logits_t)
            temperatures.append(T.mean().item())
            
        return {
            'logits': torch.stack(logits_seq, dim=1),
            'temperature': temperatures[-1] # T at last step
        }


def run_v28_roots_test():
    print("--- OPEN SKYNET: V28 PHYSICAL CYBORG (REBORN) ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # --- CURRICULUM: THE CAUSAL ATOMS ---
    # We teach the relationship [Condition] -> [Action]
    training_data = [
        "alicia tiene hambre alicia come",
        "alicia tiene sed alicia beber",
        "conejo tiene hambre conejo come",
        "conejo tiene sed conejo beber"
    ]
    
    model = SKYNET_CORE_V28_REBORN(
        vocab_size=len(vocab_map),
        d_model=weights.shape[1],
        d_state=128,
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print("\n  [TRAINING: Biphasic Crystallization of Logic]")
    model.train()
    for step in range(1, 401):
        total_loss = 0
        random.shuffle(training_data)
        for sentence in training_data:
            words = sentence.split()
            seq = [vocab_map[w] for w in words]
            x_train = torch.tensor([seq[:-1]]).to(DEVICE)
            y_train = torch.tensor([seq[1:]]).to(DEVICE)
            
            model.reset()
            out = model(x_train)
            loss = F.cross_entropy(out['logits'].view(-1, len(vocab_map)), y_train.view(-1))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if step % 50 == 0:
            print(f"    Step {step:3} | Loss: {total_loss/4:.4f} | Temp(T): {out['temperature']:.4f}")

    print("\n  [TEST: Zero-Shot Causal Logic]")
    test_subject = "reina"
    if test_subject not in vocab_map: test_subject = "niña"
        
    test_prompt = f"{test_subject} tiene sed"
    print(f"  Prompt: '{test_prompt}'")

    model.eval()
    with torch.no_grad():
        words = test_prompt.split()
        seq = [vocab_map[w] for w in words]
        x_input = torch.tensor([seq]).to(DEVICE)
        
        gen_tokens = []
        model.reset()
        # Feed prompt
        for t in range(x_input.shape[1]):
            out = model(x_input[:, t:t+1])
            
        # Autoregressive generation
        next_id = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
        gen_tokens.append(next_id)
        
        # Second word
        out = model(torch.tensor([[next_id]]).to(DEVICE))
        next_id2 = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
        gen_tokens.append(next_id2)
            
        print(f"  V28 Response: {' '.join([id_to_word[t] for t in gen_tokens])}")

if __name__ == "__main__":
    run_v28_roots_test()
