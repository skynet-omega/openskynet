"""
SKYNET CORE V306: CLOSED LOOP HYBRID (Holographic Recurrent Cortex)
===================================================================

Upgrades from V305:
1. Closed Loop Feedback: The Transformer Cortex was an open-loop observer.
   In V306, we return to a Recurrent Architecture, but now the output of the 
   Resonant Colony (System 2) is fed BACK into the Cortex's hidden state for 
   the next time step.
2. The semantic wave mathematically steers the syntactic predictions in real-time,
   creating true "Causal Valence".
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

class SKYNET_CORE_V306_CLOSED_LOOP(nn.Module):
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
            print(f"  [V306] Inherited {vocab_size} embeddings for Semantic Anchoring.")
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- EXECUTIVE CORTEX (Closed-Loop GRU) ---
        # Using a GRU Cell to allow manual token-by-token stepping and injection of feedback
        self.cortex_cell = nn.GRUCell(d_model, d_model)
        
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY ---
        self.organs = nn.ModuleList([
            ResonantOrgan(n_nodes_per_organ, d_feature) for _ in range(n_organs)
        ])
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # --- SYSTEM 2 (Internal mixing & FEEDBACK) ---
        self.sys2_mixer = nn.Linear(self.n_res, self.n_res)
        
        # This projection brings the holographic memory back into the cortex dimension
        self.colony_feedback = nn.Sequential(
            nn.Linear(self.n_res, d_model),
            nn.GELU()
        )
        
        # --- DUAL GENERATIVE DECODER ---
        self.decoder_trunk = nn.Sequential(
            nn.Linear(d_model + self.n_res, d_model * 2),
            nn.GELU(),
            nn.LayerNorm(d_model * 2)
        )
        
        # Syntactic Head
        self.logits_head = nn.Linear(d_model * 2, vocab_size)
        
        # Semantic Head
        self.concept_head = nn.Linear(d_model * 2, d_model)
        
        self.n_internal_steps = 2
        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs
        self.cortex_state = None

    def detach_states(self):
        if self.cortex_state is not None:
            self.cortex_state = self.cortex_state.detach()
        for i in range(self.n_organs):
            if self.h_freq_states[i] is not None:
                self.h_freq_states[i] = self.h_freq_states[i].detach()

    def save_checkpoint(self, path):
        torch.save(self.state_dict(), path)

    def load_checkpoint(self, path):
        self.load_state_dict(torch.load(path, map_location=self.device))

    def forward(self, x_text=None, training=True):
        batch, seq_len = x_text.shape
        
        # 1. Perception
        h_in_seq = self.input_norm(self.text_embed(x_text))
        
        if self.cortex_state is None or self.cortex_state.shape[0] != batch:
            self.cortex_state = torch.zeros(batch, self.d_model, device=self.device)
            
        for i in range(self.n_organs):
            if self.h_freq_states[i] is None or self.h_freq_states[i].shape[0] != batch:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)

        all_fused = []
        global_energy = 0.0
        
        # Recurrent Loop with Feedback
        for t in range(seq_len):
            h_in_t = h_in_seq[:, t, :]
            
            # 2. Executive Cortex (Syntax processing)
            self.cortex_state = self.cortex_cell(h_in_t, self.cortex_state)
            
            # 3. Resonant Colony (Semantic processing)
            energy_weights = torch.softmax(self.router(self.cortex_state), dim=-1)
            
            global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
            for i, organ in enumerate(self.organs):
                drive_time_t = self.organ_projs[i](self.cortex_state) * energy_weights[:, i:i+1]
                drive_freq_t = torch.fft.rfft(drive_time_t, dim=-1, norm='ortho')
                self.h_freq_states[i] = organ(drive_freq_t, self.h_freq_states[i])
                global_wave = global_wave + self.h_freq_states[i]
                
            # 4. System 2 Internal Simulation
            h_workspace_time = torch.fft.irfft(global_wave, n=self.n_res, dim=-1, norm='ortho')
            for _ in range(self.n_internal_steps):
                h_workspace_time = h_workspace_time + F.gelu(self.sys2_mixer(h_workspace_time))
                
            global_energy += global_wave.abs().mean().item()
            
            # THE CLOSED LOOP: Inject semantic wave back into the cortex state for the NEXT token
            feedback = self.colony_feedback(h_workspace_time)
            self.cortex_state = self.cortex_state + feedback
            
            # Fusion for Decoder
            h_fused_t = torch.cat([self.cortex_state, h_workspace_time], dim=-1)
            all_fused.append(h_fused_t)
            
        h_fused = torch.stack(all_fused, dim=1)
        
        # 5. Dual Decoding
        h_trunk = self.decoder_trunk(h_fused)
        
        logits = self.logits_head(h_trunk)
        concept_vectors = self.concept_head(h_trunk)
        
        return {
            'logits': logits,
            'concept_vectors': concept_vectors,
            'audit': {'energy': global_energy / seq_len}
        }
