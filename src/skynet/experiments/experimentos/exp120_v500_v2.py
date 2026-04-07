"""
Exp120: V500 Master Alignment + Ricci + Inhibition
==================================================

Goal: Train the V500 core with:
1. Ricci Curvature (Semantic Gravity).
2. Frequency Inhibition (Anti-Black Hole).
3. Thermal Annealing (High Initial Tau).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
import time
from pathlib import Path
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V500_UNIFIED_ALIGNED import SKYNET_CORE_V500_UNIFIED_ALIGNED

# Configuration
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V500_MASTER_BRAIN_V2.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DATA_LIBROS = Path("/home/daroch/.openskynet/workspace/alicia_libros.json")
REPORT_PATH = Path("exp120_v500_v2_status.json")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BATCH_SIZE = 16
SEQ_LEN = 32

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def load_data(vocab_map):
    print("  Loading Alicia Hieroglyph...")
    tokens = []
    if DATA_LIBROS.exists():
        with open(DATA_LIBROS, 'r') as f:
            data = json.load(f)
        for text in data.get('textos', []):
            words = clean_text(text)
            tokens.extend([vocab_map[w] for w in words if w in vocab_map])
    return tokens

def run_alignment():
    print("--- OPEN SKYNET: V500 V2 (RICCI + INHIBITION) ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    vocab_size = len(vocab_map)
    
    # Calculate word frequency for inhibition
    tokens = load_data(vocab_map)
    freq = torch.zeros(vocab_size).to(DEVICE)
    for t in tokens: freq[t] += 1
    # Normalized inhibition weight (Higher freq = higher penalty)
    inhibition = (freq / freq.max()).unsqueeze(0).unsqueeze(0) * 2.0 

    model = SKYNET_CORE_V500_UNIFIED_ALIGNED(
        vocab_size=vocab_size,
        n_nodes=128, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    # Start with high temperature to force exploration
    with torch.no_grad():
        model.thalamus.tau.data = torch.tensor([2.0]).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    model.train()
    
    start_time = time.time()
    steps = 2000 # Let's do a shorter, high-quality run first
    
    for step in range(steps):
        x, y = [] , []
        for _ in range(BATCH_SIZE):
            idx = random.randint(0, len(tokens) - SEQ_LEN - 1)
            chunk = tokens[idx:idx + SEQ_LEN + 1]
            x.append(chunk[:-1]); y.append(chunk[1:])
        x, y = torch.tensor(x).to(DEVICE), torch.tensor(y).to(DEVICE)
        
        model.reset()
        out = model(x, training=True)
        
        # 1. Semantic Loss + Inhibition
        logits = out['logits']
        # Apply Anti-Black Hole penalty to the logits
        inhibited_logits = logits - inhibition
        
        loss_semantic = F.cross_entropy(inhibited_logits.view(-1, vocab_size), y.view(-1), ignore_index=0)
        
        # 2. Structural Frustration
        loss_frustration = out['frustration']
        
        total_loss = loss_semantic + 0.1 * loss_frustration
        
        optimizer.zero_grad()
        total_loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if (step+1) % 100 == 0:
            elapsed = (time.time() - start_time) / 60
            tau = out['audit']['tau']
            print(f"  Step {step+1} | Loss: {loss_semantic.item():.4f} | Frustration: {loss_frustration.item():.6f} | Tau: {tau:.4f}")
            status = {"step": step+1, "loss": loss_semantic.item(), "frustration": loss_frustration.item(), "tau": tau}
            REPORT_PATH.write_text(json.dumps(status, indent=2))
            
            if (step+1) % 500 == 0:
                model.save_brain(CHECKPOINT_PATH)

    model.save_brain(CHECKPOINT_PATH)
    print("\n--- V500 V2 ALIGNMENT COMPLETE ---")

if __name__ == "__main__":
    run_alignment()
