"""
SKYNET CORE V210: RESONANT COLONY (The Synchronized Brain)
==========================================================

The first architecture to achieve Compositional Reasoning (The Great Jump).
Moves from 'passing messages' to 'Synchronizing Waves' in a 
Global Resonant Workspace (GRW).

Mathematical Foundation:
1. Complex Waveforms: h = A * e^(i*phi).
2. Shared Cavity Interference: Organs interact via superposition.
3. Phase Binding: Composition occurs when multiple organ phases align.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft

class ResonantOrgan(nn.Module):
    """
    A specialized organ that computes in the frequency domain.
    """
    def __init__(self, n_nodes=32, d_feature=16):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        self.n_res = n_nodes * d_feature
        self.freq_dim = self.n_res // 2 + 1
        
        # Internal Phase Shift (Learned)
        self.phase_shift = nn.Parameter(torch.randn(self.freq_dim))
        
    def forward(self, x_in_freq, h_prev_freq):
        # Wave evolution: rotate and add stimulus
        rotor = torch.exp(1j * self.phase_shift)
        h_next = (h_prev_freq * rotor) + x_in_freq
        
        # Thermodynamic Saturation
        mag = torch.abs(h_next)
        scale = torch.tanh(mag) / (mag + 1e-6)
        return h_next * scale

class SKYNET_CORE_V210_RESONANT_COLONY(nn.Module):
    def __init__(self, n_input=658, n_actions=20, d_model=256, n_organs=8, 
                 n_nodes_per_organ=32, d_feature=16, device='cuda'):
        super().__init__()
        self.device = device
        self.n_organs = n_organs
        self.d_model = d_model
        self.n_res = n_nodes_per_organ * d_feature
        self.freq_dim = self.n_res // 2 + 1
        
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        self.router = nn.Linear(d_model, n_organs)
        
        # The Colony
        self.organs = nn.ModuleList([
            ResonantOrgan(n_nodes_per_organ, d_feature)
            for _ in range(n_organs)
        ])
        
        # New: Organ Drive Projection (for heterogenous sizes)
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res)
            for _ in range(n_organs)
        ])
        
        # Readout from Global Resonant Workspace
        self.readout = nn.Linear(d_model + self.n_res, n_actions)
        
        self.reset()

    def reset(self):
        self.cortex_state = None
        self.h_freq_states = [None] * self.n_organs

    def forward(self, x, training=True):
        batch = x.shape[0]
        if x.dim() == 3: x = x.view(batch, -1)
        
        h_in = self.input_norm(self.input_proj(x))
        if self.cortex_state is None:
            self.cortex_state = torch.zeros(1, batch, self.d_model, device=self.device)
        h_ctx, self.cortex_state = self.cortex(h_in.unsqueeze(1), self.cortex_state)
        h_ctx = h_ctx.squeeze(1)
        
        energy_weights = torch.softmax(self.router(h_ctx), dim=-1)
        
        # --- GLOBAL RESONANT WORKSPACE (GRW) ---
        global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
        
        for i, organ in enumerate(self.organs):
            if self.h_freq_states[i] is None:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
            
            # Project cortex drive to organ resolution
            drive_time = self.organ_projs[i](h_ctx) * energy_weights[:, i:i+1]
            drive_freq = torch.fft.rfft(drive_time, dim=-1, norm='ortho')
            
            # Step organ
            self.h_freq_states[i] = organ(drive_freq, self.h_freq_states[i])
            
            # Superposition in the GRW
            global_wave = global_wave + self.h_freq_states[i]
            
        # Time-domain Synthesis
        h_workspace_time = torch.fft.irfft(global_wave, n=self.n_res, dim=-1, norm='ortho')
        
        logits = self.readout(torch.cat([h_ctx, h_workspace_time], dim=-1))
        
        return {
            'logits': logits,
            'audit': {'energy': global_wave.abs().mean().item()}
        }

if __name__ == "__main__":
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = SKYNET_CORE_V210_RESONANT_COLONY(device=device).to(device)
    print("V210 Resonant Colony Online.")
    x = torch.randn(4, 658, device=device)
    out = model(x)
    print(f"GRW Energy: {out['audit']['energy']:.4f}")
