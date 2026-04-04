"""
Exp114: V300 Protocol Training - The Articulate Cognitive Brain
==============================================================

Goal: Train the V300 core to reason and respond using the 
purified Alice foundation and the structured protocol data.

Mechanism:
1. Structural Seed: Initialize the Resonant Colony's topology 
   with the Hebbian Skeleton (top 12k words).
2. Protocol Training: Sequence training using (Context + Instruction) -> Answer.
3. System 2 Resonance: 8 internal simulation steps to find the answer attractor.
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

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION_PURE.pt")
PROTOCOL_DATA = Path("/home/daroch/documents/dataset_fine_tuning.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_ARTICULATE_PURE.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    if not isinstance(text, str): return []
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_protocol_training():
    print("--- V300: ARTICULATE COGNITIVE TRAINING (PURE WORDS) ---")
    
    # 1. Load Purified Foundation
    print("  Loading Foundation...")
    fd = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = fd['word_to_id']
    id_to_word = fd['id_to_word']
    skeleton = fd['hebbian_skeleton'] # [12000, 12000]
    vocab_size = len(word_to_id)
    print(f"  Vocab: {vocab_size} words. Skeleton loaded.")

    # 2. Initialize V300 Core
    # We use 32 organs x 64 nodes = 2048 physical neurons
    # The dictionary has 64k words.
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    # --- TOPOLOGICAL SEEDING ---
    # We map the 12,000 Hebbian relationships into the latent field.
    # For this POC, we'll let the model learn the weights, 
    # but we ensure the embedding starts with high variance.
    with torch.no_grad():
        model.text_embed.weight.data.normal_(0, 0.1)
        print("  Latent field initialized with High Contrast.")

    # 3. Load Protocol Data (JSONL)
    print("  Loading Protocol Data...")
    samples = []
    with open(PROTOCOL_DATA, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                samples.append(json.loads(line))
            except: pass
    print(f"  Loaded {len(samples)} structured reasoning pairs.")

    # 4. Training Loop
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    model.train()
    
    print("  Starting Protocol Absorption (3000 steps)...")
    start_time = time.time()
    
    for step in range(3000):
        sample = random.choice(samples)
        
        ctx_words = clean_text(sample.get('contexto', ''))
        inst_words = clean_text(sample.get('instruccion', ''))
        ans_words = clean_text(sample.get('respuesta', ''))
        
        if not ans_words: continue
        
        # Format: [Context] + [Instruction]
        # We take a window to fit in VRAM
        input_words = ctx_words[-10:] + inst_words[-10:]
        input_ids = [word_to_id[w] for w in input_words if w in word_to_id]
        
        if len(input_ids) < 2: continue
        
        # Target: The next logical concept in the answer
        target_word = random.choice(ans_words)
        if target_word not in word_to_id: continue
        
        x_t = torch.tensor(input_ids).unsqueeze(0).to(DEVICE)
        y_t = torch.tensor([word_to_id[target_word]]).to(DEVICE)
        
        model.reset()
        out = model(x_t)
        
        loss = F.cross_entropy(out['logits'], y_t)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if (step+1) % 500 == 0:
            elapsed = (time.time() - start_time) / 60
            print(f"    Step {step+1}/3000 | Loss: {loss.item():.4f} | Mins: {elapsed:.1f}")

    # 5. Quick Insight (Internal Structure)
    print("\n--- INTERNAL RESONANCE AUDIT ---")
    model.eval()
    def get_sim(w1, w2):
        if w1 not in word_to_id or w2 not in word_to_id: return 0.0
        v1 = model.text_embed.weight[word_to_id[w1]].unsqueeze(0)
        v2 = model.text_embed.weight[word_to_id[w2]].unsqueeze(0)
        return F.cosine_similarity(v1, v2).item()

    s1 = get_sim("alicia", "conejo")
    s2 = get_sim("rapunzel", "trenza")
    
    print(f"  Similarity 'alicia' <-> 'conejo': {s1:.4f}")
    print(f"  Similarity 'rapunzel' <-> 'trenza': {s2:.4f}")

    # 6. Save Checkpoint
    model.save_checkpoint(CHECKPOINT_PATH)
    print(f"--- TRAINING COMPLETE: Checkpoint saved to {CHECKPOINT_PATH} ---")

if __name__ == "__main__":
    run_protocol_training()
