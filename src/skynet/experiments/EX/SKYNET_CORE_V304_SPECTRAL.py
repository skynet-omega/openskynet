"""
SKYNET CORE V304: SPECTRAL HOLOGRAPHIC (Energy-Based Frequency Training)
========================================================================

Upgrades from V303:
1. Spectral Contrastive Loss: Instead of decoding the wave into the time domain 
   and calculating loss on the continuous vector space, we calculate the loss 
   DIRECTLY IN THE FREQUENCY DOMAIN (Phase and Amplitude).
2. The target semantic vector (MiniLM) is projected and transformed via FFT into 
   a "Target Hologram". The Resonant Colony is trained to match the amplitude 
   and phase of this Target Hologram.
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

class SKYNET_CORE_V304_SPECTRAL(nn.Module):
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
            print(f"  [V304] Inherited {vocab_size} embeddings.")
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- EXECUTIVE CORTEX ---
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.cortex = nn.TransformerEncoder(encoder_layer, num_layers=4)
        self.pos_encoder = nn.Parameter(torch.randn(1, 2048, d_model) * 0.02)
        
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY ---
        self.organs = nn.ModuleList([
            ResonantOrgan(n_nodes_per_organ, d_feature) for _ in range(n_organs)
        ])
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # --- SPECTRAL TARGET PROJECTOR ---
        # Projects semantic vectors (d_model) into the resonant resolution (n_res)
        self.semantic_to_resonance = nn.Sequential(
            nn.Linear(d_model, self.n_res),
            nn.GELU(),
            nn.Linear(self.n_res, self.n_res)
        )
        
        # --- GENERATIVE DECODER (For Inference) ---
        self.resonance_to_semantic = nn.Sequential(
            nn.Linear(self.n_res, d_model * 2),
            nn.GELU(),
            nn.Linear(d_model * 2, d_model)
        )

        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs

    def save_checkpoint(self, path):
        torch.save(self.state_dict(), path)

    def load_checkpoint(self, path):
        self.load_state_dict(torch.load(path, map_location=self.device))

    def generate_target_hologram(self, target_ids):
        """Converts actual word IDs into a Target Hologram in the frequency domain"""
        # [B, T, d_model]
        target_semantics = self.text_embed(target_ids)
        # [B, T, n_res]
        target_time = self.semantic_to_resonance(target_semantics)
        # [B, T, freq_dim] (Complex)
        target_freq = torch.fft.rfft(target_time, dim=-1, norm='ortho')
        return target_freq

    def forward(self, x_text=None):
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
                
            global_energy += global_wave.abs().mean().item()
            all_waves.append(global_wave)
            
        h_fused_wave = torch.stack(all_waves, dim=1) # [B, T, freq_dim]
        
        # Decode for inference
        h_workspace_time = torch.fft.irfft(h_fused_wave, n=self.n_res, dim=-1, norm='ortho')
        pred_concepts = self.resonance_to_semantic(h_workspace_time)
        
        return {
            'predicted_hologram': h_fused_wave,
            'concept_vectors': pred_concepts,
            'audit': {'energy': global_energy / seq_len}
        }
