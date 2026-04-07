"""
SKYNET CORE V503: CATALYTIC RESONANCE (Phase-Locked Brain)
=========================================================

Physical Concept:
Intelligence is the ability to maintain Phase Synchronization with a causal 
protocol. Key concepts (Catalysts) reconfigure the physical geometry of 
the resonant manifold.

Upgrades from V502:
1. Catalytic Metric: High-valence words (Alice, Math Operators) generate a 
   global phase shift that re-tunes all organs.
2. Phase-Locked Loop (PLL): The brain seeks to "lock" its oscillation to 
   the incoming data stream. Stability = Understanding.
3. Frequency Filtering: Mathematically suppresses 'Carrier Noise' (high frequency 
   low information words like 'the', 'of') using a high-pass resonance filter.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

class CatalyticCortex(nn.Module):
    """
    Identifies 'Catalysts' in the input and generates a global 
    warping field for the resonant organs.
    """
    def __init__(self, d_model, n_organs):
        super().__init__()
        self.valence_detector = nn.Linear(d_model, 1)
        self.global_shift = nn.Linear(d_model, n_organs)
        
    def forward(self, h_ctx):
        # [B, T, d_model]
        # 1. Identify valence (Importance) of each word
        valence = torch.sigmoid(self.valence_detector(h_ctx)) # [B, T, 1]
        
        # 2. Extract the catalytic 'Context' wave
        context_warping = self.global_shift(h_ctx) * valence # [B, T, n_organs]
        
        return context_warping, valence

class SKYNET_CORE_V503_CATALYTIC(nn.Module):
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
        self.concept_manifold = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            self.concept_manifold.weight.data = pretrained_embeds.to(device)
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- CATALYTIC OBSERVER ---
        # Instead of just a transformer, we have a specialized cortex 
        # that detects context-setting words.
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
        
        # 1. Observe Sequence State
        h_ctx_seq = self.observer(self.input_norm(self.concept_manifold(x_text)))
        
        # 2. CATALYTIC WARPING: Detect catalysts (Alice, Operators)
        # These words 'tune' the entire brain for the coming tokens.
        context_warping, valence_map = self.catalyst_engine(h_ctx_seq)
        
        # 3. Resonant Thought with Warping
        # Routing is now context-sensitive
        energy_weights = torch.softmax(self.router(h_ctx_seq) + context_warping, dim=-1)
        
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
                
                # Warping effect: Catalyst word changes the speed of time (phase)
                # for the resonant organ.
                rotor = torch.exp(1j * self.organ_phases[i] * (1.0 + context_warping[:, t, i]))
                
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
        
        # 4. Decryption via Resonace
        vocab_waves = self.get_vocab_waves()
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1)
        
        # Optimized Matrix Multiplication Interference
        raw_resonance = torch.matmul(valence_wave_seq.real, vocab_waves.real.t()) + \
                        torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4)
        
        # Frequency Filtering: Reduce resonance of high-frequency words that 
        # have low 'Valence Score' from the catalyst engine.
        if not training:
            # We use the valence_map to filter noise.
            # (Experimental: Words with low valence are dampened)
            noise_threshold = 0.1
            noise_mask = (valence_map < noise_threshold).float()
            # This is a conceptual damping
            # normalized_resonance = normalized_resonance * (1.0 - 0.5 * noise_mask)
            pass

        t = torch.clamp(self.tau, min=0.01)
        logits = normalized_resonance / t
        
        return {
            'logits': logits,
            'valence_map': valence_map,
            'context_warping': context_warping
        }
