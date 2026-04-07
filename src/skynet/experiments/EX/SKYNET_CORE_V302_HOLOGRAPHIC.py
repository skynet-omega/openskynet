"""
SKYNET CORE V302: CAUSAL HOLOGRAPHIC (Concept-Space Training)
=============================================================

Upgrades from V301:
1. Concept Output: The decoder no longer outputs vocab logits. It outputs a 
   continuous vector in the embedding space (d_model).
2. Holographic Loss: The network is trained using MSE/Cosine loss against the 
   target word's semantic embedding, forcing it to predict "meaning" rather 
   than exact "syntax".
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

class SKYNET_CORE_V302_HOLOGRAPHIC(nn.Module):
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
            print(f"  [V302] Inherited {vocab_size} embeddings for Semantic Anchoring.")
        
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- EXECUTIVE CORTEX (Causal Transformer) ---
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
        
        # --- SYSTEM 2 (Internal mixing) ---
        self.sys2_mixer = nn.Linear(self.n_res, self.n_res)
        
        # --- GENERATIVE DECODER (Semantic Mouth) ---
        # Instead of projecting to vocab_size, we project back to d_model (semantic space)
        self.decoder = nn.Sequential(
            nn.Linear(d_model + self.n_res, d_model * 2),
            nn.GELU(),
            nn.Linear(d_model * 2, d_model) # Output is a CONCEPT VECTOR
        )
        
        self.n_internal_steps = 2
        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs

    def detach_states(self):
        for i in range(self.n_organs):
            if self.h_freq_states[i] is not None:
                self.h_freq_states[i] = self.h_freq_states[i].detach()

    def save_checkpoint(self, path):
        torch.save(self.state_dict(), path)

    def load_checkpoint(self, path):
        self.load_state_dict(torch.load(path, map_location=self.device))

    def forward(self, x_text=None, training=True):
        batch, seq_len = x_text.shape
        
        h_in = self.input_norm(self.text_embed(x_text)) + self.pos_encoder[:, :seq_len, :]
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seq_len).to(self.device)
        h_ctx_seq = self.cortex(h_in, mask=causal_mask, is_causal=True)
        
        energy_weights = torch.softmax(self.router(h_ctx_seq), dim=-1)
        all_fused = []
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
            for _ in range(self.n_internal_steps):
                h_workspace_time = h_workspace_time + F.gelu(self.sys2_mixer(h_workspace_time))
                
            global_energy += global_wave.abs().mean().item()
            h_fused_t = torch.cat([h_ctx_seq[:, t, :], h_workspace_time], dim=-1)
            all_fused.append(h_fused_t)
            
        h_fused = torch.stack(all_fused, dim=1)
        
        # [B, T, d_model] - Predicting the semantic vector of the next word
        concept_vectors = self.decoder(h_fused) 
        
        return {
            'concept_vectors': concept_vectors,
            'audit': {'energy': global_energy / seq_len}
        }
