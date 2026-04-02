"""
Exp68: The Hybrid Singularity (V110 - Cognition + DSL)
=====================================================

Goal: Achieve 100% on the Complex Multimodal task by combining 
V105 (Gated Brain) with a DSL Symbolic Engine (V31 logic).

Mechanism:
1. V105 Brain: Processes Text and Vision to produce a 'Rule Choice' logit.
2. DSL Engine: A library of functions (Mirror, Rotate, Recolor).
3. Selection: The model selects the rule with highest logit and 
   executes it on the input grid.
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

REPORT_PATH = Path("exp68_hybrid_singularity_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V100_PERSISTENT_BRAIN.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

PHYSICS_CONCEPTS = ["atom", "nucleus", "energy", "mass", "quantum", "gravity"]
AGI_CONCEPTS = ["agi", "reasoning", "neural_network", "brain", "intelligence"]

class V110_Hybrid_Singularity(SKYNET_CORE_V100_SINGULARITY):
    """
    V110: The Hybrid Brain. 
    Outputs a discrete Rule ID instead of pixel values.
    """
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Choosing between 3 rules: [0: Identity, 1: Mirror, 2: Rotate]
        self.readout = nn.Linear(self.d_model + (self.organ.n_nodes * self.organ.d_feature), 3)

    def forward(self, x_text=None, x_vision=None, training=True):
        batch = x_text.shape[0] if x_text is not None else x_vision.shape[0]
        
        # Brain processing (System 1 + 2)
        h_ctx = torch.zeros(batch, self.d_model, device=self.device)
        if x_text is not None:
            h_text_in = self.input_norm(self.text_embed(x_text))
            _, self.cortex_state = self.cortex(h_text_in.unsqueeze(1), self.cortex_state)
            h_ctx = self.cortex_state.squeeze(0)
            
        if x_vision is not None:
            v_feat = self.vision_proj(self.quantizer(x_vision).view(batch, -1))
            if self.h_phys is None:
                self.h_phys = torch.zeros(batch, self.organ.n_nodes, self.organ.d_feature, device=self.device)
                self.A_phys = self.A_init.unsqueeze(0).repeat(batch, 1, 1).clamp(0, 1).to(self.device)
            
            x_drive = self.phys_proj(v_feat).view(batch, self.organ.n_nodes, self.organ.d_feature)
            for _ in range(self.n_internal_steps):
                self.h_phys, self.A_phys, _ = self.organ(x_drive, self.h_phys, self.A_phys, training)
                x_drive = x_drive * 0.1 # Sharp decay for cognition
                
        h_phys_flat = self.h_phys.view(batch, -1)
        # Logic choice
        logits = self.readout(torch.cat([h_ctx, h_phys_flat], dim=-1))
        return {'logits': logits}

def dsl_executor(grid, rule_id):
    # rule_id: 0=Identity, 1=Mirror, 2=Rotate
    if rule_id == 0: return grid
    if rule_id == 1: return torch.flip(grid, dims=[-1])
    if rule_id == 2: return torch.rot90(grid, k=1, dims=(-2, -1))
    return grid

def generate_hybrid_data(n_samples=1000):
    x_text, x_vision, y_rule = [], [], []
    for _ in range(n_samples):
        r = random.random()
        if r < 0.33:
            word, rule = random.choice(PHYSICS_CONCEPTS), 1 # Physics -> Mirror
        elif r < 0.66:
            word, rule = random.choice(AGI_CONCEPTS), 2    # AGI -> Rotate
        else:
            word, rule = "something_else", 0               # Unknown -> Identity
            
        x_text.append(hash(word) % 30000)
        x_vision.append(torch.randint(0, 2, (1, 3, 3)).float())
        y_rule.append(rule)
            
    return torch.tensor(x_text).to(DEVICE), torch.stack(x_vision).to(DEVICE), torch.tensor(y_rule).to(DEVICE)

def run_hybrid_audit():
    print("--- RUNNING V110 HYBRID SINGULARITY TEST ---")
    model = V110_Hybrid_Singularity(vocab_size=30000, n_nodes=512, device=DEVICE).to(DEVICE)
    if CHECKPOINT_PATH.exists():
        chkpt = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
        st = chkpt['model_state_dict']
        if 'readout.weight' in st: del st['readout.weight']
        if 'readout.bias' in st: del st['readout.bias']
        model.load_state_dict(st, strict=False)
        print("Loaded checkpoint with mismatched readout omitted.")
    
    # Training the Logic Selector
    t_data, v_data, y_rule = generate_hybrid_data(1000)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    batch_size = 32
    
    model.train()
    for epoch in range(15):
        total_loss = 0
        for i in range(0, len(t_data), batch_size):
            model.reset()
            t_batch = t_data[i:i+batch_size]
            v_batch = v_data[i:i+batch_size]
            y_batch = y_rule[i:i+batch_size]
            
            out = model(x_text=t_batch, x_vision=v_batch)
            loss = F.cross_entropy(out['logits'], y_batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if (epoch+1) % 5 == 0:
            print(f"  Epoch {epoch+1}, Avg Loss: {total_loss/(len(t_data)/batch_size):.4f}")

    # Final Test with DSL Execution
    model.eval()
    t_test, v_test, y_rule_test = generate_hybrid_data(200)
    model.reset()
    with torch.no_grad():
        out = model(x_text=t_test, x_vision=v_test)
        selected_rules = out['logits'].argmax(dim=-1)
        
        # Execute rules on input images
        correct = 0
        for i in range(len(v_test)):
            final_pred = dsl_executor(v_test[i], selected_rules[i].item())
            target = dsl_executor(v_test[i], y_rule_test[i].item())
            if torch.all(final_pred == target):
                correct += 1
                
    acc = correct / float(len(v_test))
    print(f"\nFinal Hybrid Accuracy (Logic + DSL): {acc:.4f}")
    
    report = {
        "experiment": "exp68_v110_hybrid_singularity",
        "logic_accuracy": acc,
        "method": "Cognitive Selection + DSL Execution",
        "conclusion": "SUCCESS" if acc > 0.95 else "FAILURE"
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_hybrid_audit()
