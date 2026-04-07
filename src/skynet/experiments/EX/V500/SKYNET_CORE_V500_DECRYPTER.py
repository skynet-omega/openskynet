"""
SKYNET CORE V500: CAUSAL PROTOCOL DECRYPTER (Symmetry-Based Resonance)
=====================================================================

Mathematical Concept:
Intelligence is the process of finding the "Hidden Protocol" in a noisy signal.
The V500 treats data as an encrypted physical field. It discovers the 
mathematical laws (Symmetries) that govern state transitions.

Features:
1. Symmetry Explorer: The organs now learn to identify "Invariants" in the 
   data flow using a Cross-Correlation matrix.
2. Minimal Entropy Loss: Rewards the model for finding the most "Compact Law"
   (lowest frequency complexity) that explains the signal.
3. Causal Valence Linking: Measures the "Force" between concepts as a 
   physical attraction in the resonant manifold.
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
        # The rotor: learns the fundamental frequency of a "Protocol Rule"
        self.phase_shift = nn.Parameter(torch.randn(self.freq_dim))
        
    def forward(self, x_in_freq, h_prev_freq):
        rotor = torch.exp(1j * self.phase_shift)
        h_next = (h_prev_freq * rotor) + x_in_freq
        mag = torch.abs(h_next)
        scale = torch.tanh(mag) / (mag + 1e-6)
        return h_next * scale

class ProtocolObserver(nn.Module):
    """
    Analyzes the internal state to find hidden mathematical relationships 
    (The 'Decrypter' logic).
    """
    def __init__(self, n_organs, d_model):
        super().__init__()
        # Measures correlation between different areas of the brain
        self.causal_link = nn.Parameter(torch.randn(n_organs, n_organs) * 0.01)
        
    def forward(self, organ_activations):
        # [B, T, n_organs]
        # Calculate how much one organ's fire influences the protocol
        # This is the "Hidden Protocol" discovery
        protocol_energy = torch.matmul(organ_activations, self.causal_link)
        return protocol_energy

class SKYNET_CORE_V500_DECRYPTER(nn.Module):
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
        
        # --- PERCEPTION (The Input Signal) ---
        self.text_embed = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            self.text_embed.weight.data = pretrained_embeds.to(device)
            print(f"  [V500] Signal Anchored with {vocab_size} basic concepts.")
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- CAUSAL CORTEX (The Sequence Observer) ---
        # We use a very light Transformer as a simple "Observation Window"
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.cortex = nn.TransformerEncoder(encoder_layer, num_layers=2)
        
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY (The Protocol Processor) ---
        self.organs = nn.ModuleList([
            ResonantOrgan(n_nodes_per_organ, d_feature) for _ in range(n_organs)
        ])
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # --- PROTOCOL DISCOVERY MODULE ---
        self.observer = ProtocolObserver(n_organs, d_model)
        
        # --- DECODER (The Symmetry Breaker) ---
        self.valence_projector = nn.Linear(d_model + self.n_res, self.n_res)
        self.vocab_wave_projector = nn.Linear(d_model, self.n_res)
        
        # Learnable Boltzmann Temperature (Tau)
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
        
        # 1. State Observation
        h_ctx_seq = self.cortex(self.input_norm(self.text_embed(x_text)))
        
        # 2. Resonant Thought
        energy_weights = torch.softmax(self.router(h_ctx_seq), dim=-1) # [B, T, n_organs]
        
        # Discover hidden causal links between organs
        protocol_bias = self.observer(energy_weights) # [B, T, n_organs]
        energy_weights = torch.softmax(self.router(h_ctx_seq) + protocol_bias, dim=-1)
        
        all_waves = []
        
        for i in range(self.n_organs):
            if self.h_freq_states[i] is None or self.h_freq_states[i].shape[0] != batch:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
                
        drive_times = [self.organ_projs[i](h_ctx_seq) for i in range(self.n_organs)]
        
        for t in range(seq_len):
            global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
            for i, organ in enumerate(self.organs):
                drive_time_t = drive_times[i][:, t, :] * energy_weights[:, t, i:i+1]
                drive_freq_t = torch.fft.rfft(drive_time_t, dim=-1, norm='ortho')
                self.h_freq_states[i] = organ(drive_freq_t, self.h_freq_states[i])
                global_wave = global_wave + self.h_freq_states[i]
                
            h_workspace_time = torch.fft.irfft(global_wave, n=self.n_res, dim=-1, norm='ortho')
            fused_state = torch.cat([h_ctx_seq[:, t, :], h_workspace_time], dim=-1)
            valence_time = self.valence_projector(fused_state)
            valence_wave_t = torch.fft.rfft(valence_time, dim=-1, norm='ortho')
            all_waves.append(valence_wave_t)
            
        valence_wave_seq = torch.stack(all_waves, dim=1) # [B, T, freq_dim]
        
        # 3. Thermodynamic Decryption (Interference + Boltzmann)
        vocab_waves = self.get_vocab_waves()
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1)
        
        real_part = torch.matmul(valence_wave_seq.real, vocab_waves.real.t())
        imag_part = torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        raw_resonance = real_part + imag_part
        
        # Resonance normalized by word complexity (Hubness fix)
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4)
        
        # Boltzmann logits (The Symmetry Breaker)
        t = torch.clamp(self.tau, min=0.01)
        logits = normalized_resonance / t
        
        return {
            'logits': logits,
            'protocol_map': self.observer.causal_link,
            'tau': t.item()
        }
