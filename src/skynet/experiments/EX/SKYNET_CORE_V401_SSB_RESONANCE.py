"""
SKYNET CORE V401: SPONTANEOUS SYMMETRY BREAKING (SSB) RESONANCE
===============================================================

Based on the physics of Dissipative Systems and Prigogine's structures.
Fixes the "Hubness / White Noise" problem of V400 by implementing:
1. Normalized Interference: Resonance is penalized by the inherent energy 
   of the dictionary wave (|W|^2). "White noise" words like 'la' are suppressed.
2. The Thalamus (Symmetry Breaking): A Mexican Hat (Double Well) potential 
   or Gumbel-Softmax equivalent that acts as "Cognitive Friction". It forces 
   the continuous wave to collapse into a discrete "particle" (a single decision),
   breaking the continuous symmetry and preventing ghost averaging.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft

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

class ThalamusSSB(nn.Module):
    def __init__(self, tau=1.0):
        super().__init__()
        # Temperature parameter for the Gumbel-Softmax (Symmetry Breaking)
        # Learns to cool down, crystallizing the wave into a discrete decision
        self.tau = nn.Parameter(torch.tensor([tau]))

    def forward(self, resonance_energies, training=True):
        """
        Takes raw continuous resonance energies and forces a Symmetry Breaking 
        (Wave Collapse) using Gumbel-Softmax.
        """
        # Ensure temperature stays positive
        tau = torch.clamp(self.tau, min=0.1)
        
        if training:
            # Gumbel-Softmax adds thermodynamic noise and sharpens the distribution,
            # acting as the "Cognitive Friction" that forces a decision.
            return F.gumbel_softmax(resonance_energies, tau=tau, hard=False, dim=-1)
        else:
            # During inference, the wave fully collapses into a discrete particle (Hard Gumbel)
            return F.gumbel_softmax(resonance_energies, tau=tau, hard=True, dim=-1)

class SKYNET_CORE_V401_SSB_RESONANCE(nn.Module):
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
            print(f"  [V401] Inherited {vocab_size} embeddings.")
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- EXECUTIVE CORTEX ---
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.cortex = nn.TransformerEncoder(encoder_layer, num_layers=2)
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
        self.valence_projector = nn.Linear(self.n_res, self.n_res)
        self.vocab_wave_projector = nn.Linear(d_model, self.n_res)
        
        # --- THE THALAMUS (Symmetry Breaking) ---
        self.thalamus = ThalamusSSB(tau=2.0)

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

    def forward(self, x_text=None, training=True):
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
            valence_time = F.gelu(self.valence_projector(h_workspace_time))
            valence_wave_t = torch.fft.rfft(valence_time, dim=-1, norm='ortho')
            
            global_energy += valence_wave_t.abs().mean().item()
            all_waves.append(valence_wave_t)
            
        valence_wave_seq = torch.stack(all_waves, dim=1) # [B, T, freq_dim]
        
        # --- NORMALIZED INTERFERENCE (Solving the Hubness / White Noise Problem) ---
        # Get dictionary waves
        vocab_waves = self.get_vocab_waves() # [V, freq_dim]
        
        # Calculate innate energy (magnitude squared) of each dictionary wave
        # |W|^2 = W.real^2 + W.imag^2
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1) # [V]
        
        # Calculate Constructive Interference using matrix multiplication to avoid OOM
        # Re(A * B*) = Re(A)Re(B) + Im(A)Im(B)
        # valence_wave_seq is [B, T, freq_dim]
        # vocab_waves is [V, freq_dim]
        # Result raw_resonance is [B, T, V]
        real_part = torch.matmul(valence_wave_seq.real, vocab_waves.real.t())
        imag_part = torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        raw_resonance = real_part + imag_part
        
        # Normalization: Divide by dictionary wave energy to penalize "white noise" words
        # Add epsilon to prevent division by zero
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4) # [B, T, V]
        
        # --- SYMMETRY BREAKING (The Thalamus Collapse) ---
        # Forces the continuous resonance manifold into a discrete probability particle
        collapsed_probs = self.thalamus(normalized_resonance, training=training) # [B, T, V]
        
        return {
            'probabilities': collapsed_probs,
            'audit': {
                'energy': global_energy / seq_len,
                'tau': self.thalamus.tau.item()
            }
        }
