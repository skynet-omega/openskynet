"""
SKYNET CORE V500: UNIFIED ALIGNED FIELD (The Protocol Aligner)
==============================================================

Goal: Stop the architectural "jumps" and UNIFY the previous successful paradigms
into a single physical system for "decrypting" the data-hieroglyph.

The Unified Architecture:
1. SUSTRATE (Wolfram): A Sparse Hypergraph (Adjacency) where nodes are oscillators.
2. FIELD (Lenia): Information propagates as Waves of Valence through the graph.
3. ALIGNMENT (Active Inference): Training minimizes 'Frustration' (Surprise Energy)
   between the input "pressure" and the internal resonant state.
4. COLLAPSE (SSB): The Thalamus breaks the symmetry of the wave to select 
   the most resonant "Concept Particle" (Word).

Mathematical Alignment:
- The input text is a 'Force' F(t) acting on the Hypergraph.
- Understanding = Reaching a Stationary Wave state (Soliton).
- Output = The most physically stable state of the field under the input pressure.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math

class HypergraphSubstrate(nn.Module):
    """
    The Wolfram-inspired substrate. Nodes are connected via a learnable 
    sparse-like adjacency matrix (Protocol Map) that evolves to form the 
    'World Model' by discovering causal symmetries.
    """
    def __init__(self, n_nodes, d_feature):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        # The Protocol Map: Hidden causal links between conceptual nodes
        self.adjacency = nn.Parameter(torch.randn(n_nodes, n_nodes) * 0.01)
        self.node_potential = nn.Parameter(torch.ones(n_nodes))
        # Curvature of Ricci: Learns the "weight" or "importance" of information
        self.ricci_curvature = nn.Parameter(torch.ones(n_nodes))

    def forward(self, wave_state):
        # wave_state: [B, n_nodes, d_feature]
        # 1. Spatially-weighted redistribution (Ricci Flow)
        curved_state = wave_state * self.ricci_curvature.view(1, -1, 1)
        # 2. Propagate energy through the Protocol Map
        energy_flow = torch.matmul(torch.tanh(self.adjacency), curved_state)
        return energy_flow * self.node_potential.unsqueeze(0).unsqueeze(-1)

class ResonantWaveEngine(nn.Module):
    """
    The Lenia-inspired dynamic field. Information travels as complex phases.
    """
    def __init__(self, d_res):
        super().__init__()
        self.d_res = d_res
        self.freq_dim = d_res // 2 + 1
        # Rotors: Conservation of information through rotation
        self.rotors = nn.Parameter(torch.randn(self.freq_dim))
        
    def forward(self, current_freq, input_freq):
        # Unitary rotation: e^(i * phi)
        phase_rotor = torch.exp(1j * self.rotors)
        # Interaction: Internal wave + External pressure
        next_freq = (current_freq * phase_rotor) + input_freq
        # Physical Dissipation (Tanh on magnitude) to prevent explosion
        mag = torch.abs(next_freq)
        scale = torch.tanh(mag) / (mag + 1e-6)
        return next_freq * scale

class SSBThalamus(nn.Module):
    """
    Spontaneous Symmetry Breaking. Collapses the wave into a decision.
    """
    def __init__(self, initial_tau=1.0):
        super().__init__()
        self.tau = nn.Parameter(torch.tensor([initial_tau]))

    def forward(self, energy, training=True):
        t = torch.clamp(self.tau, min=0.01)
        # Boltzmann Collapse: forced symmetry breaking
        if training:
            return F.gumbel_softmax(energy / t, tau=1.0, hard=False, dim=-1)
        else:
            return F.gumbel_softmax(energy / t, tau=1.0, hard=True, dim=-1)

class SKYNET_CORE_V500_UNIFIED_ALIGNED(nn.Module):
    def __init__(self, vocab_size, d_model=512, n_nodes=256, d_feature=32, device='cuda', pretrained_embeds=None):
        super().__init__()
        self.device = device
        self.vocab_size = vocab_size
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        self.total_res = n_nodes * d_feature
        
        # --- PERCEPTION (The Sensors) ---
        self.text_embed = nn.Embedding(vocab_size, d_model)
        if pretrained_embeds is not None:
            if pretrained_embeds.shape[1] != d_model:
                proj = nn.Linear(pretrained_embeds.shape[1], d_model).to(device)
                with torch.no_grad():
                    self.text_embed.weight.data = proj(pretrained_embeds.to(device))
            else:
                self.text_embed.weight.data = pretrained_embeds.to(device)
            
        self.input_to_field = nn.Linear(d_model, self.total_res)
        
        # --- THE CORE (Unified Substrate + Field) ---
        self.substrate = HypergraphSubstrate(n_nodes, d_feature)
        self.wave_engines = nn.ModuleList([
            ResonantWaveEngine(d_feature) for _ in range(n_nodes)
        ])
        
        # --- THE DECODER (Projecting back to Hieroglyphs) ---
        self.field_to_vocab = nn.Linear(self.total_res, d_model)
        self.thalamus = SSBThalamus()
        
        self.reset()

    def reset(self):
        # Initial vacuum state: No energy in the field
        self.h_freq_field = [
            torch.zeros(1, self.d_feature // 2 + 1, dtype=torch.complex64, device=self.device)
            for _ in range(self.n_nodes)
        ]

    def forward(self, x_text, training=True):
        batch, seq_len = x_text.shape
        # Initialize field for batch
        if self.h_freq_field[0].shape[0] != batch:
            self.h_freq_field = [
                torch.zeros(batch, self.d_feature // 2 + 1, dtype=torch.complex64, device=self.device)
                for _ in range(self.n_nodes)
            ]

        # 1. Perception: Convert text to Force/Pressure
        embeds = self.text_embed(x_text) # [B, T, D]
        force_field = self.input_to_field(embeds).view(batch, seq_len, self.n_nodes, self.d_feature)
        
        all_logits = []
        global_frustration = 0.0 # Total energy mismatch
        
        # 2. Sequential Alignment (Propagating through the hierarchies)
        for t in range(seq_len):
            current_wave_time = []
            
            # Step A: Dynamics (Wave Propagation)
            for i in range(self.n_nodes):
                input_freq_t = torch.fft.rfft(force_field[:, t, i, :], dim=-1, norm='ortho')
                self.h_freq_field[i] = self.wave_engines[i](self.h_freq_field[i], input_freq_t)
                current_wave_time.append(torch.fft.irfft(self.h_freq_field[i], n=self.d_feature, dim=-1, norm='ortho'))
            
            # Step B: Substrate Interaction (Hypergraph Flow)
            wave_tensor = torch.stack(current_wave_time, dim=1) # [B, n_nodes, d_feature]
            aligned_wave = self.substrate(wave_tensor) # Energy redistribution
            
            # Step C: Alignment Measure (Frustration)
            # Mismatch between the raw wave and the substrate-aligned wave
            frustration = F.mse_loss(wave_tensor, aligned_wave.detach())
            global_frustration += frustration
            
            # 3. Collapse: Decoding the Resonant Concept
            flattened_field = aligned_wave.view(batch, -1)
            concept_vector = self.field_to_vocab(flattened_field) # Project to Embedding space
            
            # Interference against entire Dictionary
            # Energy = Dot Product (Resonance)
            resonance_energies = torch.matmul(concept_vector, self.text_embed.weight.t())
            
            # Thalamic Symmetry Breaking
            probs = self.thalamus(resonance_energies, training=training)
            all_logits.append(probs)

        return {
            'logits': torch.stack(all_logits, dim=1),
            'frustration': global_frustration / seq_len,
            'audit': {
                'tau': self.thalamus.tau.item()
            }
        }

    def save_brain(self, path):
        torch.save(self.state_dict(), path)
