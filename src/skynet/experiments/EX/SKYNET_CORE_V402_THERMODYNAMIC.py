"""
SKYNET CORE V402: THERMODYNAMIC RESONANCE (The Boltzmann Brain)
===============================================================

Physical Justification:
We abandon traditional LLM Logits completely. Instead, we embrace Statistical Mechanics.
1. The network generates a Valence Wave in the frequency domain.
2. We calculate the Normalized Interference Energy against every Dictionary Wave.
3. The probability of a word "crystallizing" from the wave is governed by the 
   Boltzmann Distribution (Softmax over Energies divided by a Temperature tau).
   P(w) = exp(Energy(w) / tau) / Z
4. This provides true "Cognitive Friction": the network must maximize the physical 
   resonance energy of the correct concept while minimizing the energy of all others, 
   acting as a cooling dissipative system.
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
        
    def forward(self, x_in_freq, h_prev_freq):
        rotor = torch.exp(1j * self.phase_shift)
        h_next = (h_prev_freq * rotor) + x_in_freq
        mag = torch.abs(h_next)
        scale = torch.tanh(mag) / (mag + 1e-6)
        return h_next * scale

class ThalamusThermodynamic(nn.Module):
    def __init__(self, initial_tau=1.0):
        super().__init__()
        # Learnable thermodynamic temperature
        self.tau = nn.Parameter(torch.tensor([initial_tau]))

    def forward(self, energy):
        # Prevent absolute zero temperature (division by zero)
        t = torch.clamp(self.tau, min=0.01)
        # Boltzmann distribution: exp(E / T)
        return energy / t

class SKYNET_CORE_V402_THERMODYNAMIC(nn.Module):
    def __init__(self, vocab_size=250002, d_model=512, n_organs=32, 
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
            if pretrained_embeds.shape[1] != d_model:
                proj = nn.Linear(pretrained_embeds.shape[1], d_model).to(device)
                with torch.no_grad():
                    self.text_embed.weight.data = proj(pretrained_embeds.to(device))
            else:
                self.text_embed.weight.data = pretrained_embeds.to(device)
            print(f"  [V402] Inherited {vocab_size} embeddings (Static Dictionary).")
            # Freeze the dictionary to force the network to learn to navigate the space
            # self.text_embed.weight.requires_grad = False
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- EXECUTIVE CORTEX ---
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.cortex = nn.TransformerEncoder(encoder_layer, num_layers=4) # Deeper cortex for better sequential modeling
        self.pos_encoder = nn.Parameter(torch.randn(1, 2048, d_model) * 0.02)
        
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY ---
        self.organs = nn.ModuleList([
            ResonantOrgan(n_nodes_per_organ, d_feature) for _ in range(n_organs)
        ])
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # --- WAVE GENERATORS ---
        self.sys2_mixer = nn.Linear(self.n_res, self.n_res)
        self.valence_projector = nn.Sequential(
            nn.Linear(d_model + self.n_res, self.n_res), # Hybrid fusion into wave
            nn.GELU(),
            nn.Linear(self.n_res, self.n_res)
        )
        
        self.vocab_wave_projector = nn.Sequential(
            nn.Linear(d_model, self.n_res),
            nn.GELU(),
            nn.Linear(self.n_res, self.n_res)
        )
        
        # --- THE THALAMUS (Thermodynamic Collapse) ---
        self.thalamus = ThalamusThermodynamic(initial_tau=1.0)

        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs

    def save_checkpoint(self, path):
        torch.save(self.state_dict(), path)

    def load_checkpoint(self, path):
        self.load_state_dict(torch.load(path, map_location=self.device))

    def get_vocab_waves(self):
        vocab_time = self.vocab_wave_projector(self.text_embed.weight)
        vocab_freq = torch.fft.rfft(vocab_time, dim=-1, norm='ortho')
        return vocab_freq

    def forward(self, x_text=None, get_logits=True):
        batch, seq_len = x_text.shape
        
        h_in = self.input_norm(self.text_embed(x_text)) + self.pos_encoder[:, :seq_len, :]
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seq_len).to(self.device)
        h_ctx_seq = self.cortex(h_in, mask=causal_mask, is_causal=True)
        
        energy_weights = torch.softmax(self.router(h_ctx_seq), dim=-1)
        all_waves = []
        global_energy = 0.0
        
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
            h_workspace_time = h_workspace_time + F.gelu(self.sys2_mixer(h_workspace_time))
            
            # Hybrid fusion: context + semantic resonance -> Valence Wave
            fused_state = torch.cat([h_ctx_seq[:, t, :], h_workspace_time], dim=-1)
            valence_time = self.valence_projector(fused_state)
            valence_wave_t = torch.fft.rfft(valence_time, dim=-1, norm='ortho')
            
            global_energy += valence_wave_t.abs().mean().item()
            all_waves.append(valence_wave_t)
            
        valence_wave_seq = torch.stack(all_waves, dim=1) # [B, T, freq_dim]
        
        if not get_logits:
            return {'valence_waves': valence_wave_seq}

        # --- THERMODYNAMIC INTERFERENCE (Boltzmann Distribution) ---
        vocab_waves = self.get_vocab_waves() # [V, freq_dim]
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1) # [V]
        
        # Constructive Interference Re(A * B*)
        real_part = torch.matmul(valence_wave_seq.real, vocab_waves.real.t())
        imag_part = torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        raw_resonance = real_part + imag_part # [B, T, V]
        
        # Normalized Resonance (Energy)
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4)
        
        # The Thalamus computes the Boltzmann "logits" (Energy / Temperature)
        boltzmann_logits = self.thalamus(normalized_resonance)
        
        return {
            'logits': boltzmann_logits, # Ready for CrossEntropy (which represents the Boltzmann partition function Z)
            'audit': {
                'energy': global_energy / seq_len,
                'tau': self.thalamus.tau.item()
            }
        }
