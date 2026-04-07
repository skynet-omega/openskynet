"""
SKYNET CORE V600: MINIMALIST RESONANT INTELLIGENCE (LTS - Optimized)
====================================================================

Philosophy: "Less is More". 
Unified Field Equation with Tensorized Operations for speed.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft

class ResonantField(nn.Module):
    def __init__(self, n_nodes, d_feature, device='cuda'):
        super().__init__()
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        self.freq_dim = d_feature // 2 + 1
        self.device = device
        
        # 1. THE METRIC (Ricci/Wolfram)
        self.metric = nn.Parameter(torch.randn(n_nodes, n_nodes) * 0.01)
        self.curvature = nn.Parameter(torch.ones(n_nodes)) # Ricci-like
        
        # 2. THE INTENTION (Potential Field)
        self.intent_potential = nn.Parameter(torch.randn(n_nodes, d_feature) * 0.1)
        
        # 3. PHASE ROTORS
        self.rotors = nn.Parameter(torch.randn(n_nodes, self.freq_dim))
        
        # 4. SALIENCY FILTER & PLASTICITY
        self.saliency_threshold = nn.Parameter(torch.ones(n_nodes))
        # Structural Memory: Learns which nodes are "Overwhelmed"
        self.node_fatigue = nn.Parameter(torch.zeros(n_nodes))

    def forward(self, h_freq_state, input_freq, intent_vector=None):
        # Intent modulates the potential field: Sintonía
        if intent_vector is not None:
            v_intent = self.intent_potential.unsqueeze(0) * intent_vector.unsqueeze(-1)
            # Soft Confinement: use intent to bias the flow, not block it completely
            dynamic_saliency = torch.sigmoid(self.saliency_threshold.unsqueeze(0) + intent_vector - self.node_fatigue)
        else:
            v_intent = self.intent_potential.unsqueeze(0)
            dynamic_saliency = torch.sigmoid(self.saliency_threshold.unsqueeze(0) - self.node_fatigue)
            
        v_intent_freq = torch.fft.rfft(v_intent, dim=-1, norm='ortho')
        
        # 1. Apply Causal Metric Flow
        # Convert to time domain for metric routing
        h_time = torch.fft.irfft(h_freq_state, n=self.d_feature, dim=-1, norm='ortho')
        
        # The metric is the "Roadmap" of the protocol
        # We add a skip connection (Identity) to ensure signal survival
        warped_metric = torch.tanh(self.metric) + torch.eye(self.n_nodes, device=self.device).unsqueeze(0)
        h_flow_time = torch.matmul(warped_metric, h_time)
        
        # Convert back to frequency domain
        h_flow_freq = torch.fft.rfft(h_flow_time, dim=-1, norm='ortho')

        # 2. Tensorized Time Dilation
        dt_prime = (1.0 + self.curvature.unsqueeze(0)) * dynamic_saliency
        rotor = torch.exp(1j * self.rotors.unsqueeze(0) * dt_prime.unsqueeze(-1))
        
        # 3. Field Interaction
        h_next = (h_flow_freq * rotor) + input_freq + v_intent_freq
        
        # Physical Dissipation
        mag = torch.abs(h_next)
        scale = torch.tanh(mag) / (mag + 1e-6)
        h_fused = h_next * scale
        
        return h_fused

class SKYNET_CORE_V600_RESONANT(nn.Module):
    def __init__(self, vocab_size, d_model=384, n_nodes=64, d_feature=32, device='cuda'):
        super().__init__()
        self.device = device
        self.n_nodes = n_nodes
        self.d_feature = d_feature
        self.vocab_size = vocab_size
        
        self.embed = nn.Embedding(vocab_size, d_model)
        self.force_proj = nn.Linear(d_model, n_nodes * d_feature)
        self.field = ResonantField(n_nodes, d_feature, device)
        self.intent_encoder = nn.Linear(d_model, n_nodes)
        self.output_proj = nn.Linear(n_nodes * d_feature, vocab_size)
        self.tau = nn.Parameter(torch.tensor([1.0]))

        self.reset()

    def reset(self):
        self.h_freq = None

    def forward(self, x_text, intent_text=None, training=True, use_dissipation=False):
        batch, seq_len = x_text.shape
        
        # Perception: Multi-layer for better feature extraction
        h_embed = self.embed(x_text)
        forces = self.force_proj(h_embed).view(batch, seq_len, self.n_nodes, self.d_feature)
        forces_freq = torch.fft.rfft(forces, dim=-1, norm='ortho')
        
        intent_reservoir = None
        if intent_text is not None:
            intent_embeds = self.embed(intent_text)
            intent_reservoir = intent_embeds.mean(dim=1)

        if self.h_freq is None or self.h_freq.shape[0] != batch:
            self.h_freq = torch.zeros(batch, self.n_nodes, self.d_feature // 2 + 1, dtype=torch.complex64, device=self.device)

        all_logits = []
        for t in range(seq_len):
            if intent_reservoir is not None:
                # Stronger steering for the intent
                intent_mod = torch.softmax(self.intent_encoder(intent_reservoir) * 2.0, dim=-1)
            else:
                intent_mod = None
                
            self.h_freq = self.field(self.h_freq, forces_freq[:, t, :, :], intent_mod)
            workspace = torch.fft.irfft(self.h_freq, n=self.d_feature, dim=-1, norm='ortho').reshape(batch, -1)
            
            # Use raw logits for training stability
            logits = self.output_proj(workspace)
            all_logits.append(logits)
            
        return torch.stack(all_logits, dim=1)

    def generate_dissipative(self, start_words, intent_text, max_len=15, state=None):
        self.eval()
        batch = start_words.shape[0]
        
        # Continuity: Use existing state or initialize fresh
        if state is None:
            self.reset()
            self.h_freq = torch.zeros(batch, self.n_nodes, self.d_feature // 2 + 1, dtype=torch.complex64, device=self.device)
        else:
            self.h_freq = state
            
        intent_reservoir = self.embed(intent_text).sum(dim=1) if intent_text is not None else None
        
        # 1. Burn-in context (if provided)
        if start_words.shape[1] > 0:
            for t in range(start_words.shape[1]):
                x_t = start_words[:, t:t+1]
                forces = self.force_proj(self.embed(x_t)).view(batch, 1, self.n_nodes, self.d_feature)
                forces_freq = torch.fft.rfft(forces, dim=-1, norm='ortho')
                
                if intent_reservoir is not None:
                    intent_mod = torch.softmax(self.intent_encoder(intent_reservoir), dim=-1)
                else:
                    intent_mod = None
                    
                self.h_freq = self.field(self.h_freq, forces_freq[:, 0, :, :], intent_mod)
            last_word = start_words[:, -1:]
        else:
            # If no start words, use a default/last word or handle error
            last_word = torch.tensor([[0]], device=self.device) # PAD or similar
        
        generated_ids = []
        
        # 2. Dissipative Generation
        with torch.no_grad():
            for _ in range(max_len):
                forces = self.force_proj(self.embed(last_word)).view(batch, 1, self.n_nodes, self.d_feature)
                forces_freq = torch.fft.rfft(forces, dim=-1, norm='ortho')
                
                if intent_reservoir is not None:
                    intent_mod = torch.softmax(self.intent_encoder(intent_reservoir), dim=-1)
                else:
                    intent_mod = None
                    
                self.h_freq = self.field(self.h_freq, forces_freq[:, 0, :, :], intent_mod)
                workspace = torch.fft.irfft(self.h_freq, n=self.d_feature, dim=-1, norm='ortho').reshape(batch, -1)
                logits = self.output_proj(workspace) / torch.clamp(self.tau, min=0.01)
                
                pred_id = torch.argmax(logits, dim=-1)
                generated_ids.append(pred_id.item())
                
                if intent_reservoir is not None:
                    word_spoken = self.embed(pred_id)
                    intent_reservoir = intent_reservoir - word_spoken
                    if torch.norm(intent_reservoir) < 0.5:
                        break
                        
                last_word = pred_id.unsqueeze(1)
                
        return generated_ids, self.h_freq

    def save_lts(self, path):
        torch.save(self.state_dict(), path)
