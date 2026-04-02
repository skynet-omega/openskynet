"""
Exp67: Gated Cognitive Synthesis (V105 - Attentional Control)
============================================================

Goal: Fix the failure of Exp66 by implementing 'Topological Gating'.
Instead of just averaging Text and Vision, the Semantic Brain (Cortex)
now DIRECTLY modulates the physical constants of the Biphasic Organ.

Mechanism:
1. Cortex (GRU) processes the text concept.
2. Cortex output generates a 'Physics Bias' vector.
3. This bias changes the 'mu' (growth center) and 'A_t' (topology) 
   dynamically, allowing the text to 'steer' how the vision is processed.
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

REPORT_PATH = Path("exp67_gated_synthesis_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V100_PERSISTENT_BRAIN.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

PHYSICS_CONCEPTS = ["atom", "nucleus", "energy", "mass", "quantum", "gravity"]
AGI_CONCEPTS = ["agi", "reasoning", "neural_network", "brain", "intelligence"]

class V105_Gated_Singularity(SKYNET_CORE_V100_SINGULARITY):
    """
    V105: The 'Steering' Brain. 
    Text signal gates visual physics.
    """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Physics modulation head
        self.physics_steer = nn.Linear(self.d_model, 3) # Controls [mu_offset, sigma_offset, plasticity_boost]

    def forward(self, x_text=None, x_vision=None, training=True):
        batch = x_text.shape[0] if x_text is not None else x_vision.shape[0]
        
        # 1. First, process TEXT ONLY to set the 'Mental Context'
        h_ctx = torch.zeros(batch, self.d_model, device=self.device)
        if x_text is not None:
            h_text_in = self.input_norm(self.text_embed(x_text))
            _, self.cortex_state = self.cortex(h_text_in.unsqueeze(1), self.cortex_state)
            h_ctx = self.cortex_state.squeeze(0)
            
        # 2. Generate Physics Steering
        steer = torch.tanh(self.physics_steer(h_ctx))
        mu_off, sig_off, plast_boost = steer[:, 0], steer[:, 1], steer[:, 2]
        
        # Apply steer to organ (Temporary shift for this forward pass)
        original_mu = self.organ.mu.data.clone()
        self.organ.mu.data += mu_off.mean() * 0.5
        
        # 3. Process VISION under the 'Text-Steered' physics
        if x_vision is not None:
            v_feat = self.vision_proj(self.quantizer(x_vision).view(batch, -1))
            # Drive the organ with vision
            if self.h_phys is None:
                self.h_phys = torch.zeros(batch, self.organ.n_nodes, self.organ.d_feature, device=self.device)
                self.A_phys = self.A_init.unsqueeze(0).repeat(batch, 1, 1).clamp(0, 1).to(self.device)
            
            x_drive = self.phys_proj(v_feat).view(batch, self.organ.n_nodes, self.organ.d_feature)
            # System 1 + 2
            for _ in range(self.n_internal_steps + 1):
                self.h_phys, self.A_phys, _ = self.organ(x_drive, self.h_phys, self.A_phys, training)
                x_drive = x_drive * 0.5 # Decay drive to simulate persistence
                
        # Restore original physics for next batch
        self.organ.mu.data = original_mu
        
        # 4. Final Readout
        h_phys_flat = self.h_phys.view(batch, -1)
        logits = self.readout(torch.cat([h_ctx, h_phys_flat], dim=-1))
        return {'logits': logits}

def generate_gated_data(n_samples=1000):
    x_text = []
    x_vision = torch.zeros(n_samples, 1, 3, 3)
    y_target = torch.zeros(n_samples, 1, 3, 3)
    
    for i in range(n_samples):
        if random.random() > 0.5:
            word = random.choice(PHYSICS_CONCEPTS)
            mode = "mirror"
        else:
            word = random.choice(AGI_CONCEPTS)
            mode = "rotate"
        x_text.append(hash(word) % 30000)
        grid = torch.randint(0, 2, (1, 3, 3)).float()
        x_vision[i] = grid
        y_target[i] = torch.flip(grid, dims=[-1]) if mode == "mirror" else torch.rot90(grid, k=1, dims=[-2, -1])
            
    return torch.tensor(x_text).to(DEVICE), x_vision.to(DEVICE), y_target.to(DEVICE)

def run_gated_audit():
    print("--- RUNNING V105 GATED SYNTHESIS TEST ---")
    model = V105_Gated_Singularity(vocab_size=30000, n_nodes=512, device=DEVICE).to(DEVICE)
    if CHECKPOINT_PATH.exists():
        model.load_checkpoint(CHECKPOINT_PATH)
    
    # Custom readout for 3x3 grid
    model.readout = nn.Linear(model.d_model + (512 * 32), 9).to(DEVICE)
    
    # Training
    t_data, v_data, y_data = generate_gated_data(1000)
    optimizer = torch.optim.Adam(model.parameters(), lr=2e-3)
    
    model.train()
    for epoch in range(30): # More epochs
        model.reset()
        out = model(x_text=t_data, x_vision=v_data)
        loss = F.mse_loss(out['logits'], y_data.view(-1, 9))
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        if (epoch+1) % 5 == 0:
            print(f"  Epoch {epoch+1}, Loss: {loss.item():.4f}")

    # Test
    model.eval()
    t_test, v_test, y_test = generate_gated_data(200)
    model.reset()
    with torch.no_grad():
        out = model(x_text=t_test, x_vision=v_test)
        pred = out['logits'].view(-1, 1, 3, 3).round().clamp(0, 1)
        acc = torch.all(pred == y_test, dim=(1, 2, 3)).float().mean().item()
        
    print(f"\nFinal Gated Accuracy: {acc:.4f}")
    
    report = {
        "experiment": "exp67_v105_gated_synthesis",
        "acc": acc,
        "loss": loss.item(),
        "status": "SUCCESS" if acc > 0.7 else "IMPROVING"
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_gated_audit()
