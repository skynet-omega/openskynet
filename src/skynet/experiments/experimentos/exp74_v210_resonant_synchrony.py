"""
Exp74: V210 Resonant Colony - Synchrony by Phase Binding
========================================================

Goal: Solve the 'Compositionality' failure of V200.
Mechanism: 'Synchrony by Resonance' (Global Resonant Workspace).

Key Innovations:
1. Complex-Valued Organs: Each organ outputs a complex wave z = A * e^(i*phi).
2. Shared Resonance Cavity: Organs interact via constructive/destructive 
   interference in a shared complex field.
3. Phase Binding: Two concepts are 'composed' (Math + Geometry) when their 
   phases synchronize in the cavity.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import json
import random
from pathlib import Path
import sys
import os
import numpy as np

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V100_SINGULARITY import ScalingHypergraphOrgan

REPORT_PATH = Path("exp74_v210_resonant_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

class ResonantOrgan(ScalingHypergraphOrgan):
    """V100 Organ that operates in Complex/Frequency Space."""
    def __init__(self, d_feature=16, **kwargs):
        super().__init__(d_feature=d_feature, **kwargs)
        # Frequency bins for resonance
        self.n_freq = (d_feature * self.n_nodes) // 2 + 1
        self.phase_shift = nn.Parameter(torch.randn(self.n_freq))

    def forward_complex(self, x_complex, h_prev_complex, A_prev):
        # Implementation of phase-based wave interference
        # Simplified: z_next = (h_prev * rotor) + x_in
        rotor = torch.exp(1j * self.phase_shift)
        h_next = (h_prev_complex * rotor) + x_complex
        # Biphasic saturation in complex space
        mag = torch.abs(h_next)
        scale = torch.tanh(mag) / (mag + 1e-6)
        return h_next * scale

class V210_Resonant_Colony(nn.Module):
    def __init__(self, n_input=658, n_organs=4, n_nodes=32, d_feature=16, d_model=256, device='cuda'):
        super().__init__()
        self.device = device
        self.n_organs = n_organs
        self.d_model = d_model
        self.n_res = n_nodes * d_feature
        self.freq_dim = self.n_res // 2 + 1
        
        # New: Input Projection to d_model
        self.input_proj = nn.Linear(n_input, d_model)
        
        # 1. Executive Cortex (Router)
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        self.router = nn.Linear(d_model, n_organs)
        
        # 2. Resonant Organs
        self.organs = nn.ModuleList([
            ResonantOrgan(n_initial_nodes=n_nodes, d_feature=d_feature)
            for _ in range(n_organs)
        ])
        
        # 3. Global Resonant Workspace (Shared Cavity)
        # This is the 'field' where all organs interfere
        self.workspace_A = nn.Parameter(torch.ones(self.freq_dim))
        
        self.readout = nn.Linear(d_model + self.n_res, 2)
        self.reset()

    def reset(self):
        self.cortex_state = None
        self.h_freq_states = [None] * self.n_organs
        self.A_states = [None] * self.n_organs

    def forward(self, x_feat, training=True):
        batch = x_feat.shape[0]
        h_in = self.input_proj(x_feat)
        if self.cortex_state is None: 
            self.cortex_state = torch.zeros(1, batch, self.d_model, device=self.device)
        h_ctx, self.cortex_state = self.cortex(h_in.unsqueeze(1), self.cortex_state)
        h_ctx = h_ctx.squeeze(1)
        
        energy_weights = torch.softmax(self.router(h_ctx), dim=-1)
        
        # --- RESONANT INTERACTION ---
        # 1. Start with an empty Workspace Wave
        global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
        
        # 2. Organs generate their waves and interfere in the workspace
        for i, organ in enumerate(self.organs):
            if self.h_freq_states[i] is None:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
                self.A_states[i] = torch.eye(organ.n_nodes, device=self.device).unsqueeze(0).repeat(batch, 1, 1)
            
            # Map features to frequency
            drive_time = torch.randn(batch, self.n_res, device=self.device) * energy_weights[:, i:i+1]
            drive_freq = torch.fft.rfft(drive_time, dim=-1, norm='ortho')
            
            # Organ Resonance Step
            h_next_f = organ.forward_complex(drive_freq, self.h_freq_states[i], self.A_states[i])
            self.h_freq_states[i] = h_next_f
            
            # Interfere with Global Wave (Constructive/Destructive)
            # This is the 'Sincronía por Resonancia'
            global_wave = global_wave + h_next_f
            
        # 3. Consolidate Workspace (Reverse FFT)
        h_workspace_time = torch.fft.irfft(global_wave, n=self.n_res, dim=-1, norm='ortho')
        
        # 4. Final Readout
        logits = self.readout(torch.cat([h_ctx, h_workspace_time], dim=-1))
        
        return {'logits': logits, 'routing': energy_weights}

def get_compositional_data(n=1000):
    # Task: Count (Logic) + Mirror (Geometry)
    x = torch.zeros(n, 10, 658).to(DEVICE)
    y = torch.zeros(n, dtype=torch.long).to(DEVICE)
    for i in range(n):
        count = random.randint(1, 3)
        pos = random.randint(0, 5)
        # Features: [Count Signal, Pos Signal]
        for c in range(count): x[i, c, 50+c] = 5.0 
        x[i, 0, 100+pos] = 5.0
        # Composite Rule: If count >= 2 AND pos is high
        y[i] = 1 if (count >= 2 and pos > 2) else 0
    return x, y

def run_resonant_jump():
    print("--- V210 RESONANT COLONY: COMPOSITIONALITY TEST ---")
    model = V210_Resonant_Colony(n_organs=8, n_nodes=16, d_feature=8, device=DEVICE).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print("Phase 1: Training on Compositional Task...")
    for epoch in range(150):
        model.train()
        xb, yb = get_compositional_data(16)
        model.reset()
        for t in range(10): out = model(xb[:, t])
        
        loss = F.cross_entropy(out['logits'], yb)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (epoch+1) % 50 == 0: print(f"  Epoch {epoch+1}, Loss: {loss.item():.4f}")
        
    print("\nPhase 2: Final Validation...")
    xt, yt = get_compositional_data(200)
    model.eval()
    model.reset()
    for t in range(10): out = model(xt[:, t])
    acc = (out['logits'].argmax(-1) == yt).float().mean().item()
    
    print(f"Resonant Composition Accuracy: {acc:.4f}")
    
    report = {
        "experiment": "exp74_v210_resonant_synchrony",
        "mechanism": "Global Resonant Workspace",
        "test_accuracy": acc,
        "status": "SUCCESS" if acc > 0.85 else "FAIL"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_resonant_jump()
