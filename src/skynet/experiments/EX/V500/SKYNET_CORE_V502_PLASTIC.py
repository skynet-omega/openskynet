"""
SKYNET CORE V502: PLASTIC RICCI GEOMETRY (Homeostatic Brain)
===========================================================

Physical Concept:
Intelligence is a dissipative structure that maintains order by inhibiting 
redundant information. 

Upgrades from V501:
1. Concept Plasticity: The embeddings are now fully learnable and 
   self-organize based on the discovered Causal Protocol.
2. Homeostatic Inhibition: Implements a "Fatigue" mechanism. Concepts that 
   carry low information (high frequency but low causal link) are 
   mathematically suppressed during decoding to prevent "el de la que" babbling.
3. Ricci Metric Learning: The internal geometry (G) is updated dynamically 
   to prioritize hubs that solve the "Decryption" of the data.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

class RicciCausalGeometry(nn.Module):
    def __init__(self, n_organs):
        super().__init__()
        # Learnable Gravitational constant for the manifold
        self.G = nn.Parameter(torch.tensor([0.5]))
        
    def forward(self, protocol_map):
        abs_map = torch.abs(protocol_map)
        local_density = abs_map.sum(dim=-1)
        global_mean = local_density.mean()
        # Ricci curvature kappa
        kappa = local_density - global_mean
        return torch.tanh(self.G * kappa)

class SKYNET_CORE_V502_PLASTIC(nn.Module):
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
        
        # --- PLASTIC CONCEPT MANIFOLD ---
        # Fully learnable embeddings - the brain carves its own mental images
        self.concept_manifold = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            # We initialize with MiniLM but WE DON'T FREEZE IT.
            self.concept_manifold.weight.data = pretrained_embeds.to(device)
            print(f"  [V502] Plastic Manifold initialized with {vocab_size} seeds.")
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- CAUSAL SEQUENCE OBSERVER ---
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.cortex = nn.TransformerEncoder(encoder_layer, num_layers=2)
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY ---
        self.organ_phases = nn.ParameterList([
            nn.Parameter(torch.randn(self.freq_dim)) for _ in range(n_organs)
        ])
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # --- RICCI GEOMETRY ENGINE ---
        self.protocol_map = nn.Parameter(torch.randn(n_organs, n_organs) * 0.01)
        self.ricci = RicciCausalGeometry(n_organs)
        
        # --- HOMEOSTATIC INHIBITION ---
        # Keeps track of concept usage to penalize babbling
        self.register_buffer('concept_fatigue', torch.zeros(vocab_size))
        
        # --- THE DECODER ---
        self.valence_projector = nn.Linear(d_model + self.n_res, self.n_res)
        self.vocab_wave_projector = nn.Linear(d_model, self.n_res)
        self.tau = nn.Parameter(torch.tensor([1.0]))

        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs
        # Reset fatigue at the start of a new thought session
        self.concept_fatigue.zero_()

    def get_vocab_waves(self):
        # The waves now evolve as the concept manifold learns
        vocab_time = self.vocab_wave_projector(self.concept_manifold.weight)
        vocab_freq = torch.fft.rfft(vocab_time, dim=-1, norm='ortho')
        return vocab_freq

    def forward(self, x_text=None, training=True):
        batch, seq_len = x_text.shape
        
        # 1. Geometry Update
        curvature = self.ricci(self.protocol_map) 
        
        # 2. Sequence Observation
        h_ctx_seq = self.cortex(self.input_norm(self.concept_manifold(x_text)))
        
        # 3. Warped Routing
        gravity_scale = (1.0 + curvature).unsqueeze(0).unsqueeze(0)
        energy_weights = torch.softmax(self.router(h_ctx_seq) * gravity_scale, dim=-1)
        
        all_waves = []
        for i in range(self.n_organs):
            if self.h_freq_states[i] is None or self.h_freq_states[i].shape[0] != batch:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
                
        drive_times = [self.organ_projs[i](h_ctx_seq) for i in range(self.n_organs)]
        
        for t in range(seq_len):
            global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
            for i in range(self.n_organs):
                drive_time_t = drive_times[i][:, t, :] * energy_weights[:, t, i:i+1]
                drive_freq_t = torch.fft.rfft(drive_time_t, dim=-1, norm='ortho')
                
                # Warped Time (Relativistic effect on phase)
                rotor = torch.exp(1j * self.organ_phases[i] * (1.0 + curvature[i]))
                self.h_freq_states[i] = (self.h_freq_states[i] * rotor) + drive_freq_t
                
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
        
        # 4. Decryption with Homeostatic Inhibition
        vocab_waves = self.get_vocab_waves()
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1)
        
        raw_resonance = torch.matmul(valence_wave_seq.real, vocab_waves.real.t()) + \
                        torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4)
        
        # Apply Homeostatic Inhibition: reduce energy of concepts that are "too loud"
        # This prevents the 'de de de' loop.
        if not training:
            # During inference, we punish recently used words
            inhibition = self.concept_fatigue.unsqueeze(0).unsqueeze(0) * 5.0
            normalized_resonance = normalized_resonance - inhibition
        
        t = torch.clamp(self.tau, min=0.01)
        logits = normalized_resonance / t
        
        return {
            'logits': logits,
            'curvature': curvature,
            'manifold_norm': self.concept_manifold.weight.norm()
        }

    def update_fatigue(self, token_ids):
        """Updates the homeostatic fatigue of used concepts"""
        # Decay existing fatigue
        self.concept_fatigue *= 0.9 
        # Increase fatigue for used tokens
        for tid in token_ids:
            if tid < self.vocab_size:
                self.concept_fatigue[tid] += 1.0
