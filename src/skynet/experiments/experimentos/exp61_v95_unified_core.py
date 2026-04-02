"""
Exp61: Unified Multimodal Hypergraph (V95)
==========================================

Goal: Integrate Geometric Quantizer (Vision) and Large-Scale Embedding (Text)
into the V90 System 2 Hypergraph.

The V95 Core implements:
1. Multimodal Projection: Vision (ARC grids) and Text (Large Dictionary) 
   projected into the same latent field.
2. Geometric Quantizer: Resolves aliasing for vision inputs.
3. High-Capacity Scaling: 10,000 word vocabulary support.
4. System 2 Thinking: Internal simulation for cross-modal reasoning.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V85_SCALING_HYPERGRAPH import ScalingHypergraphOrgan
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp61_multimodal_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

class GeometricQuantizer(nn.Module):
    def __init__(self, beta=10.0):
        super().__init__()
        self.beta = beta
        kernel = torch.tensor([[[[1, 2, 1], [2, 4, 2], [1, 2, 1]]]], dtype=torch.float32) / 16.0
        self.register_buffer('blur_kernel', kernel)

    def forward(self, x):
        # x expected as [B, 1, H, W]
        # Smooth upscaling
        x_smooth = F.interpolate(x, size=(30, 30), mode='bilinear', align_corners=False)
        x_padded = F.pad(x_smooth, (1, 1, 1, 1), mode='replicate')
        x_blurred = F.conv2d(x_padded, self.blur_kernel)
        return torch.sigmoid(self.beta * (x_blurred - 0.5))

class SKYNET_CORE_V95_UNIFIED(nn.Module):
    def __init__(self, vocab_size=10000, n_actions=2, d_model=256, n_nodes=64, d_feature=16, device='cuda'):
        super().__init__()
        self.device = device
        self.vocab_size = vocab_size
        self.d_model = d_model
        
        # --- Modality A: TEXT ---
        self.text_embed = nn.Embedding(vocab_size, d_model)
        
        # --- Modality B: VISION ---
        self.quantizer = GeometricQuantizer()
        self.vision_proj = nn.Linear(30 * 30, d_model) # Project quantized grid to d_model
        
        # --- UNIFIED CORE ---
        self.input_norm = nn.LayerNorm(d_model)
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        
        self.phys_proj = nn.Linear(d_model, n_nodes * d_feature)
        self.organ = ScalingHypergraphOrgan(n_nodes, d_feature, max_nodes=512)
        
        self.readout = nn.Linear(d_model + (512 * d_feature), n_actions)
        
        self.n_internal_steps = 5
        self.reset()

    def reset(self):
        self.cortex_state = None
        self.h_phys = None
        self.A_phys = None

    def forward(self, text_ids=None, vision_grids=None, training=True):
        batch = text_ids.shape[0] if text_ids is not None else vision_grids.shape[0]
        
        # 1. ENCODING
        embeddings = []
        if text_ids is not None:
            embeddings.append(self.text_embed(text_ids))
        if vision_grids is not None:
            # vision_grids: [B, 1, H, W]
            q_grid = self.quantizer(vision_grids)
            embeddings.append(self.vision_proj(q_grid.view(batch, -1)))
            
        # Fusion (Mean of available modalities)
        h_in = torch.stack(embeddings).mean(dim=0)
        h_in = self.input_norm(h_in)
        
        # 2. CORTEX
        if self.cortex_state is None or self.cortex_state.shape[1] != batch:
            self.cortex_state = torch.zeros(1, batch, self.d_model, device=self.device)
        h_ctx, self.cortex_state = self.cortex(h_in.unsqueeze(1), self.cortex_state)
        h_ctx = h_ctx.squeeze(1)
        
        # 3. PHYSICAL ORGAN (System 1 + Thinking Time)
        if self.h_phys is None:
            self.h_phys = torch.zeros(batch, self.organ.n_nodes, self.organ.d_feature, device=self.device)
            self.A_phys = torch.eye(self.organ.n_nodes, device=self.device).unsqueeze(0).repeat(batch, 1, 1)
            
        full_drive = self.phys_proj(h_ctx).view(batch, -1, self.organ.d_feature)
        x_drive = full_drive[:, :self.organ.n_nodes, :]
        
        # Input step
        self.h_phys, self.A_phys, _ = self.organ(x_drive, self.h_phys, self.A_phys, training)
        
        # Thinking steps (System 2)
        for _ in range(self.n_internal_steps):
            zero_drive = torch.zeros_like(x_drive)
            self.h_phys, self.A_phys, _ = self.organ(zero_drive, self.h_phys, self.A_phys, training)
            
        # 4. READOUT
        h_full = torch.zeros(batch, 512, self.organ.d_feature, device=self.device)
        h_full[:, :self.organ.n_nodes, :] = self.h_phys
        h_fused = torch.cat([h_ctx, h_full.view(batch, -1)], dim=-1)
        logits = self.readout(h_fused)
        
        return {'logits': logits}

def run_v95_benchmark():
    random.seed(42)
    torch.manual_seed(42)
    
    vocab_size = 10000
    model = SKYNET_CORE_V95_UNIFIED(vocab_size=vocab_size, device=DEVICE).to(DEVICE)
    
    print(f"V95 Online: Unified Multimodal Hypergraph")
    print(f"Vocab size: {vocab_size} words")
    
    # Simulate Multimodal Task: 
    # Input a concept (Text) and a Grid (Vision) -> Are they related?
    batch_size = 8
    dummy_text = torch.randint(0, vocab_size, (batch_size,)).to(DEVICE)
    dummy_vision = torch.randn(batch_size, 1, 10, 10).to(DEVICE) # Small ARC grid
    
    out = model(text_ids=dummy_text, vision_grids=dummy_vision)
    
    print(f"Forward Pass Successful. Output Logits: {out['logits'].shape}")
    
    report = {
        "experiment": "exp61_v95_unification",
        "multimodal_status": "INTEGRATED",
        "vocab_capacity": vocab_size,
        "vision_quantizer": "ACTIVE",
        "system2_steps": 5
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_v95_benchmark()
