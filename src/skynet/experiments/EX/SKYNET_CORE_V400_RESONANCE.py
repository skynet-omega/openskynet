"""
SKYNET CORE V400: CAUSAL RESONANCE CORE (Interference-Based Decoding)
=====================================================================

A paradigm shift away from traditional LLM Softmax/Linear decoding.
The network generates a "Valence Wave" in the frequency domain. 
Every word in the vocabulary is also represented as a wave.
Decoding happens via Constructive Interference: the vocabulary wave that 
resonates most strongly (highest energy) with the Valence Wave is the 
predicted next word.

Training uses Energy-Based Loss:
Maximize the energy of the target word's interference.
Minimize the energy of other words' interference.
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
        # The organ learns to rotate frequencies (phase shift)
        self.phase_shift = nn.Parameter(torch.randn(self.freq_dim))
        
    def forward(self, x_in_freq, h_prev_freq):
        rotor = torch.exp(1j * self.phase_shift)
        # Advance state via rotation and add new input wave
        h_next = (h_prev_freq * rotor) + x_in_freq
        mag = torch.abs(h_next)
        # Thermodynamic Saturation
        scale = torch.tanh(mag) / (mag + 1e-6)
        return h_next * scale

class SKYNET_CORE_V400_RESONANCE(nn.Module):
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
            print(f"  [V400] Inherited {vocab_size} embeddings for Semantic Wave Generation.")
            
        self.input_norm = nn.LayerNorm(d_model)
        
        # --- CAUSAL SEQUENCE PROCESSING ---
        # We still need a way to process sequences over time. 
        # A causal transformer is efficient for building the historical context vector.
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=8, dim_feedforward=d_model*4, batch_first=True, norm_first=True)
        self.cortex = nn.TransformerEncoder(encoder_layer, num_layers=2)
        self.pos_encoder = nn.Parameter(torch.randn(1, 2048, d_model) * 0.02)
        
        # Maps context vector to organ excitation energies
        self.router = nn.Linear(d_model, n_organs)
        
        # --- RESONANT COLONY ---
        self.organs = nn.ModuleList([
            ResonantOrgan(n_nodes_per_organ, d_feature) for _ in range(n_organs)
        ])
        
        # Maps context vector into the time-domain resolution of the organs
        self.organ_projs = nn.ModuleList([
            nn.Linear(d_model, self.n_res) for _ in range(n_organs)
        ])
        
        # --- WAVE GENERATORS ---
        # Converts context into the final "Valence Wave"
        self.valence_projector = nn.Linear(self.n_res, self.n_res)
        
        # Converts vocab embeddings into "Dictionary Waves"
        self.vocab_wave_projector = nn.Linear(d_model, self.n_res)

        self.reset()

    def reset(self):
        self.h_freq_states = [None] * self.n_organs

    def save_checkpoint(self, path):
        torch.save(self.state_dict(), path)

    def load_checkpoint(self, path):
        self.load_state_dict(torch.load(path, map_location=self.device))

    def get_vocab_waves(self):
        """
        Converts the entire vocabulary embedding matrix into frequency waves.
        Returns: [vocab_size, freq_dim] complex tensor.
        """
        # [V, d_model] -> [V, n_res]
        vocab_time = self.vocab_wave_projector(self.text_embed.weight)
        # [V, freq_dim]
        vocab_freq = torch.fft.rfft(vocab_time, dim=-1, norm='ortho')
        return vocab_freq

    def get_target_waves(self, target_ids):
        """
        Gets the frequency waves for specific target IDs.
        Returns: [B, T, freq_dim] complex tensor.
        """
        target_embeds = self.text_embed(target_ids) # [B, T, d_model]
        target_time = self.vocab_wave_projector(target_embeds) # [B, T, n_res]
        target_freq = torch.fft.rfft(target_time, dim=-1, norm='ortho') # [B, T, freq_dim]
        return target_freq

    def forward(self, x_text=None, inference=False):
        batch, seq_len = x_text.shape
        
        # 1. Perception
        h_in = self.input_norm(self.text_embed(x_text)) + self.pos_encoder[:, :seq_len, :]
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seq_len).to(self.device)
        
        # 2. Sequence History (Causal)
        h_ctx_seq = self.cortex(h_in, mask=causal_mask, is_causal=True)
        
        # 3. Excite the Colony
        energy_weights = torch.softmax(self.router(h_ctx_seq), dim=-1)
        all_waves = []
        global_energy = 0.0
        
        # Initialize organ states
        for i in range(self.n_organs):
            if self.h_freq_states[i] is None or self.h_freq_states[i].shape[0] != batch:
                self.h_freq_states[i] = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
                
        # Pre-calculate organ drives
        drive_times = [self.organ_projs[i](h_ctx_seq) for i in range(self.n_organs)]
        
        # Process time steps
        for t in range(seq_len):
            global_wave = torch.zeros(batch, self.freq_dim, dtype=torch.complex64, device=self.device)
            for i, organ in enumerate(self.organs):
                drive_time_t = drive_times[i][:, t, :] * energy_weights[:, t, i:i+1]
                drive_freq_t = torch.fft.rfft(drive_time_t, dim=-1, norm='ortho')
                self.h_freq_states[i] = organ(drive_freq_t, self.h_freq_states[i])
                global_wave = global_wave + self.h_freq_states[i]
                
            # 4. Form the Valence Wave
            # Project back to time domain, apply non-linearity, then back to frequency
            h_workspace_time = torch.fft.irfft(global_wave, n=self.n_res, dim=-1, norm='ortho')
            valence_time = F.gelu(self.valence_projector(h_workspace_time))
            valence_wave_t = torch.fft.rfft(valence_time, dim=-1, norm='ortho')
            
            global_energy += valence_wave_t.abs().mean().item()
            all_waves.append(valence_wave_t)
            
        # [B, T, freq_dim] (Complex Tensor)
        valence_wave_seq = torch.stack(all_waves, dim=1) 
        
        result = {
            'valence_waves': valence_wave_seq,
            'audit': {'energy': global_energy / seq_len}
        }
        
        # If inference, perform interference with the whole dictionary
        if inference:
            # We only care about the last timestep's wave
            # [B, freq_dim]
            last_valence_wave = valence_wave_seq[:, -1, :]
            
            # [V, freq_dim]
            vocab_waves = self.get_vocab_waves()
            
            # INTERFERENCE CALCULATION
            # To simulate constructive interference, we calculate the dot product 
            # of the complex wave vectors (equivalent to overlapping their phases and amplitudes).
            # We use the conjugate transpose for complex dot product: <V_wave, Vocab_wave>
            # Real part represents the magnitude of constructive interference.
            
            # [B, 1, freq_dim]
            last_valence_wave = last_valence_wave.unsqueeze(1)
            # [1, V, freq_dim]
            vocab_waves = vocab_waves.unsqueeze(0)
            
            # Complex multiplication: Wave1 * Conj(Wave2)
            interference = last_valence_wave * torch.conj(vocab_waves)
            
            # Sum over frequencies to get total resonance energy
            # [B, V]
            resonance_energy = interference.sum(dim=-1).real
            
            result['resonance_energy'] = resonance_energy

        return result
