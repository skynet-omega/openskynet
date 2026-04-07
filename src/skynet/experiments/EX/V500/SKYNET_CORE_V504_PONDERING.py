"""
SKYNET CORE V504: LATENT PONDERING BRAIN (Internal Simulation Time)
===================================================================

Physical Concept:
To solve transitivity (A>B, B>C -> A>C) and composition (3+2 = 3+1+1), 
the brain cannot be purely reactive (1 input -> 1 wave update). 
It needs "Internal Simulation Time" (Latent Pondering).

Upgrades from V503:
1. Pondering Loop: Before emitting the final Valence Wave, the Resonant 
   Colony runs for `ponder_steps` recursively. The output of the colony 
   is fed back into itself as an internal "virtual token".
2. This allows the physical wave to propagate through intermediate 
   attractors (e.g., from 'perro' to 'gato', and then from 'gato' to 'raton') 
   before collapsing into a decision.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft

class CatalyticCortex(nn.Module):
    def __init__(self, d_model, n_organs):
        super().__init__()
        self.valence_detector = nn.Linear(d_model, 1)
        self.global_shift = nn.Linear(d_model, n_organs)
        
    def forward(self, h_ctx):
        valence = torch.sigmoid(self.valence_detector(h_ctx)) # [B, T, 1]
        context_warping = self.global_shift(h_ctx) * valence # [B, T, n_organs]
        return context_warping, valence

class SKYNET_CORE_V504_PONDERING(nn.Module):
    def __init__(self, vocab_size=9594, d_model=384, n_organs=32, 
                 n_nodes_per_organ=64, d_feature=32, ponder_steps=3, 
                 device='cuda', pretrained_embeds=None):
        super().__init__()
        self.device = device
        self.n_organs = n_organs
        self.d_model = d_model
        self.n_res = n_nodes_per_organ * d_feature
        self.freq_dim = self.n_res // 2 + 1
        self.vocab_size = vocab_size
        self.ponder_steps = ponder_steps
        
        # --- PLASTIC CONCEPT MANIFOLD ---
        self.concept_manifold = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            self.concept_manifold.weight.data = pretrained_embeds.to(device)
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- CATALYTIC OBSERVER ---
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.observer = nn.TransformerEncoder(encoder_layer, num_layers=2)
        self.catalyst_engine = CatalyticCortex(d_model, n_organs)
        
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY ---
        self.organ_phases = nn.ParameterList([
            nn.Parameter(torch.randn(self.freq_dim)) for _ in range(n_organs)
        ])
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # Internal Feedback loop for Pondering
        self.internal_feedback = nn.Linear(self.n_res, d_model)
        
        # --- THE DECODER ---
        self.valence_projector = nn.Linear(d_model + self.n_res, self.n_res)
        self.vocab_wave_projector = nn.Linear(d_model, self.n_res)
        self.tau = nn.Parameter(torch.tensor([1.0]))

        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs

    def get_vocab_waves(self):
        vocab_time = self.vocab_wave_projector(self.concept_manifold.weight)
        vocab_freq = torch.fft.rfft(vocab_time, dim=-1, norm='ortho')
        return vocab_freq

    def forward(self, x_text=None, training=True):
        batch, seq_len = x_text.shape
        
        h_ctx_seq = self.observer(self.input_norm(self.concept_manifold(x_text)))
        context_warping, valence_map = self.catalyst_engine(h_ctx_seq)
        
        # Base routing from observed input
        base_routing = self.router(h_ctx_seq) + context_warping
        
        all_waves = []
        for i in range(self.n_organs):
            if self.h_freq_states[i] is None or self.h_freq_states[i].shape[0] != batch:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
                
        for t in range(seq_len):
            # For each token, we ponder for 'ponder_steps'
            # The initial state is driven by the real input
            h_ctx_t = h_ctx_seq[:, t, :]
            routing_t = base_routing[:, t, :]
            
            for step in range(self.ponder_steps):
                energy_weights = torch.softmax(routing_t, dim=-1)
                
                global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
                for i in range(self.n_organs):
                    drive_time_t = self.organ_projs[i](h_ctx_t) * energy_weights[:, i:i+1]
                    drive_freq_t = torch.fft.rfft(drive_time_t, dim=-1, norm='ortho')
                    
                    rotor = torch.exp(1j * self.organ_phases[i] * (1.0 + context_warping[:, t, i]))
                    self.h_freq_states[i] = (self.h_freq_states[i] * rotor) + drive_freq_t
                    
                    mag = torch.abs(self.h_freq_states[i])
                    scale = torch.tanh(mag) / (mag + 1e-6)
                    self.h_freq_states[i] = self.h_freq_states[i] * scale
                    global_wave = global_wave + self.h_freq_states[i]
                    
                h_workspace_time = torch.fft.irfft(global_wave, n=self.n_res, dim=-1, norm='ortho')
                
                # Feedback loop: internal state drives the next ponder step
                # simulating "thinking ahead"
                if step < self.ponder_steps - 1:
                    h_ctx_t = h_ctx_t + F.gelu(self.internal_feedback(h_workspace_time))
                    # Update routing based on new internal thought
                    routing_t = self.router(h_ctx_t) + context_warping[:, t, :]

            # Final emission after pondering
            fused_state = torch.cat([h_ctx_seq[:, t, :], h_workspace_time], dim=-1)
            valence_time = self.valence_projector(fused_state)
            valence_wave_t = torch.fft.rfft(valence_time, dim=-1, norm='ortho')
            all_waves.append(valence_wave_t)
            
        valence_wave_seq = torch.stack(all_waves, dim=1)
        
        vocab_waves = self.get_vocab_waves()
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1)
        
        raw_resonance = torch.matmul(valence_wave_seq.real, vocab_waves.real.t()) + \
                        torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4)
        
        t_tau = torch.clamp(self.tau, min=0.01)
        logits = normalized_resonance / t_tau
        
        return {
            'logits': logits,
            'valence_map': valence_map
        }
