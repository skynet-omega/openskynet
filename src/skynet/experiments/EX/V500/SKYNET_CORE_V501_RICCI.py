"""
SKYNET CORE V501: RICCI CAUSAL GEOMETRY (The Curvature Brain)
============================================================

Physical Concept:
Based on your 'analisis.md', we move from flat information processing to 
Non-Euclidean Causal Geometry. In General Relativity, matter curves space-time. 
In V501, 'Meaning' (Causal Valence) curves the 'Protocol Space'.

Upgrades from V500:
1. Ricci Curvature Module: Calculates the local density of causal links 
   between organs. Dense hubs represent "Mathematical Laws" and create 
   high curvature (Semantic Gravity).
2. Geodesic Signal Flow: Information no longer flows linearly; it follows 
   the 'shortest path' (geodesics) through the curved manifold of the brain.
3. Gravitational Attractor: Words that are central to the protocol (like 
   subject-verb relationships) exert more 'gravity' on the resonance wave, 
   preventing it from drifting into noise.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

class ResonantOrgan(nn.Module):
    def __init__(self, n_nodes=64, d_feature=32):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        self.n_res = n_nodes * d_feature
        self.freq_dim = self.n_res // 2 + 1
        self.phase_shift = nn.Parameter(torch.randn(self.freq_dim))
        
    def forward(self, x_in_freq, h_prev_freq, curvature_bias=1.0):
        # Curvature bias acts as a time-dilation/acceleration factor for the rotor
        rotor = torch.exp(1j * self.phase_shift * curvature_bias)
        h_next = (h_prev_freq * rotor) + x_input_freq_warped # Note: x_input_freq_warped is passed externally
        # This organ forward is called manually in the model loop for transparency
        return h_next

class RicciCausalGeometry(nn.Module):
    """
    Computes the 'Curvatura de Ricci' of the internal organ manifold.
    """
    def __init__(self, n_organs):
        super().__init__()
        # Learnable 'Gravitational Constant'
        self.G = nn.Parameter(torch.tensor([0.1]))
        
    def forward(self, protocol_map):
        """
        Calculates local curvature kappa for each organ node.
        kappa_i represents the local connectivity density (Ricci-like).
        """
        # [n_organs, n_organs]
        abs_map = torch.abs(protocol_map)
        
        # Local Degree (Connectivity density)
        local_density = abs_map.sum(dim=-1)
        # Global mean density
        global_mean = local_density.mean()
        
        # Ricci Curvature: deviation from the flat mean
        # Positive kappa = Hub (high gravity), Negative = Void (low priority)
        kappa = local_density - global_mean
        
        # Normalize and scale by G
        curvature = torch.tanh(self.G * kappa)
        return curvature # [n_organs]

class SKYNET_CORE_V501_RICCI(nn.Module):
    def __init__(self, vocab_size=9594, d_model=384, n_organs=32, 
                 n_nodes_per_organ=64, d_feature=32, device='cuda',
                 pretrained_embeds=None):
        super().__init__()
        self.device = device
        self.n_organs = n_organs
        self.d_model = d_model
        self.n_res = n_nodes_per_organ * d_feature
        self.freq_dim = self.n_res // 2 + 1
        self.vocab_size = vocab_size
        
        # --- PERCEPTION ---
        self.text_embed = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            self.text_embed.weight.data = pretrained_embeds.to(device)
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- CAUSAL SEQUENCE OBSERVER ---
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.cortex = nn.TransformerEncoder(encoder_layer, num_layers=2)
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY ---
        self.organs = nn.ModuleList([
            nn.Module() for _ in range(n_organs) # We keep states here
        ])
        # Manually define parameters for organs to control the warped forward pass
        self.organ_phases = nn.ParameterList([
            nn.Parameter(torch.randn(self.freq_dim)) for _ in range(n_organs)
        ])
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # --- RICCI GEOMETRY ENGINE ---
        self.protocol_map = nn.Parameter(torch.randn(n_organs, n_organs) * 0.01)
        self.ricci = RicciCausalGeometry(n_organs)
        
        # --- THE MOUTH ---
        self.valence_projector = nn.Linear(d_model + self.n_res, self.n_res)
        self.vocab_wave_projector = nn.Linear(d_model, self.n_res)
        self.tau = nn.Parameter(torch.tensor([1.0]))

        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs

    def get_vocab_waves(self):
        vocab_time = self.vocab_wave_projector(self.text_embed.weight)
        vocab_freq = torch.fft.rfft(vocab_time, dim=-1, norm='ortho')
        return vocab_freq

    def forward(self, x_text=None, training=True):
        batch, seq_len = x_text.shape
        
        # 1. Calculate Ricci Curvature from the Protocol Map
        # This curves the brain's internal space-time
        curvature = self.ricci(self.protocol_map) # [n_organs]
        
        # 2. Sequence Observation
        h_ctx_seq = self.cortex(self.input_norm(self.text_embed(x_text)))
        
        # 3. Warped Routing (Semantic Gravity)
        # Activation is scaled by (1 + curvature)
        raw_routing = self.router(h_ctx_seq) # [B, T, n_organs]
        gravity_scale = (1.0 + curvature).unsqueeze(0).unsqueeze(0)
        energy_weights = torch.softmax(raw_routing * gravity_scale, dim=-1)
        
        all_waves = []
        for i in range(self.n_organs):
            if self.h_freq_states[i] is None or self.h_freq_states[i].shape[0] != batch:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
                
        drive_times = [self.organ_projs[i](h_ctx_seq) for i in range(self.n_organs)]
        
        for t in range(seq_len):
            global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
            for i in range(self.n_organs):
                # Drive wave warped by local curvature
                # Hubs resonate faster/stronger
                drive_time_t = drive_times[i][:, t, :] * energy_weights[:, t, i:i+1]
                drive_freq_t = torch.fft.rfft(drive_time_t, dim=-1, norm='ortho')
                
                # Warped Rotor Phase: delta_t' = delta_t * (1 + kappa)
                rotor = torch.exp(1j * self.organ_phases[i] * (1.0 + curvature[i]))
                
                # Advance state
                self.h_freq_states[i] = (self.h_freq_states[i] * rotor) + drive_freq_t
                # Thermodynamic Saturation
                mag = torch.abs(self.h_freq_states[i])
                scale = torch.tanh(mag) / (mag + 1e-6)
                self.h_freq_states[i] = self.h_freq_states[i] * scale
                
                global_wave = global_wave + self.h_freq_states[i]
                
            h_workspace_time = torch.fft.irfft(global_wave, n=self.n_res, dim=-1, norm='ortho')
            fused_state = torch.cat([h_ctx_seq[:, t, :], h_workspace_time], dim=-1)
            valence_time = self.valence_projector(fused_state)
            valence_wave_t = torch.fft.rfft(valence_time, dim=-1, norm='ortho')
            all_waves.append(valence_wave_t)
            
        valence_wave_seq = torch.stack(all_waves, dim=1)
        
        # 4. Decryption via Interference
        vocab_waves = self.get_vocab_waves()
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1)
        raw_resonance = torch.matmul(valence_wave_seq.real, vocab_waves.real.t()) + \
                        torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4)
        
        t = torch.clamp(self.tau, min=0.01)
        logits = normalized_resonance / t
        
        return {
            'logits': logits,
            'curvature': curvature,
            'tau': t.item()
        }
