"""
Exp115: Structured Resonant Brain - Hebbian Seed & Iterative Thinking
=====================================================================

Goal: Solve the 'Compositionality' and 'Expression' problem using 
a combination of Hebbian initialization and Iterative Mental Simulation.

Mechanism:
1. Hebbian Seed: Initialize the model's latent weights with the 
   conditional probabilities found in Exp113 (P(word_i | word_j)).
2. Protocol Training: Context -> Instruction -> Answer pairs.
3. System 2 Iteration: Allow the wave to resonate for 10 internal steps 
   before the final readout to ensure logical 'snapping'.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import time
from pathlib import Path
import sys
import os

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION_PURE.pt")
PROTOCOL_DATA = Path("/home/daroch/documents/dataset_fine_tuning.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_RESONANT_FINAL.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    import re
    if not isinstance(text, str): return []
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_resonant_training():
    print("--- V300: STRUCTURED RESONANT TRAINING (HEBBIAN SEED) ---")
    
    # 1. Load Purified Foundation
    print("  Loading Foundation and Hebbian Map...")
    fd = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = fd['word_to_id']
    id_to_word = fd['id_to_word']
    skeleton = fd['hebbian_skeleton'] # [12000, 12000]
    vocab_size = len(word_to_id)
    
    # 2. Initialize V300 Core
    # We use 16 organs x 128 nodes = 1024 nodes (Higher res per organ)
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=16, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    # --- PHYSICAL INJECTION: Hebbian Weights ---
    # We prime the embeddings so that words that 'fire together' 
    # in Alicia books start closer in space.
    print("  Injecting Hebbian Skeleton into Embedding Latents...")
    with torch.no_grad():
        # Using SVD to compress the 12k words relationships into the embedding dim
        # But for this POC, we'll simply use the skeleton to scale the initial variance
        # based on co-occurrence density.
        importance = skeleton.sum(dim=0) # [12000]
        for i in range(min(12000, vocab_size)):
            model.text_embed.weight.data[i] *= (1.0 + importance[i] * 2.0)
        print("  [SUCCESS] Brain primed with Alice's common sense.")

    # 3. Load Protocol Data
    samples = []
    with open(PROTOCOL_DATA, 'r', encoding='utf-8') as f:
        for line in f:
            try: samples.append(json.loads(line))
            except: pass
    print(f"  Loaded {len(samples)} structured pairs.")

    # 4. Training Loop (Resonant Protocol)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    
    print("  Starting Phase 2: Expression Practice (2000 steps)...")
    start_time = time.time()
    
    for step in range(2000):
        sample = random.choice(samples)
        ctx = clean_text(sample.get('contexto', ''))[-15:]
        inst = clean_text(sample.get('instruccion', ''))[-10:]
        ans = clean_text(sample.get('respuesta', ''))
        
        if not ans: continue
        
        # Build Input Signal
        input_ids = [word_to_id[w] for w in ctx + inst if w in word_to_id]
        if len(input_ids) < 3: continue
        
        # Target Selection
        target_word = random.choice(ans)
        if target_word not in word_to_id: continue
        
        x_t = torch.tensor(input_ids).unsqueeze(0).to(DEVICE)
        y_t = torch.tensor([word_to_id[target_word]]).to(DEVICE)
        
        # --- THE RESONANT STEP ---
        model.reset()
        # We allow System 2 thinking steps internally (Iterative Simulation)
        out = model(x_t) # model.forward in V250 includes internal steps
        
        loss = F.cross_entropy(out['logits'], y_t)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if (step+1) % 500 == 0:
            print(f"    Step {step+1}/2000 | Loss: {loss.item():.4f} | Energy: {out['audit']['energy']:.4f}")

    # 5. The Expression Test (Dialogue)
    print("\n--- FINAL TEST: EXPRESSING KNOWLEDGE ---")
    model.eval()
    prompts = [
        "quien es rapunzel",
        "el gato de alicia tiene una",
        "la reina de corazones grito"
    ]
    
    for p in prompts:
        p_ids = torch.tensor([word_to_id.get(w, 0) for w in clean_text(p)]).unsqueeze(0).to(DEVICE)
        # Generate with temperature
        res_words = clean_text(p)
        curr = p_ids
        with torch.no_grad():
            for _ in range(10):
                model.reset()
                out = model(curr)
                probs = F.softmax(out['logits'] / 0.8, dim=-1)
                nxt = torch.multinomial(probs, 1).item()
                res_words.append(id_to_word[nxt])
                curr = torch.cat([curr[:, 1:], torch.tensor([[nxt]], device=DEVICE)], dim=1)
        print(f"  Q: {p} -> A: {' '.join(res_words[len(clean_text(p)):])}")

    # 6. Save State
    model.save_checkpoint(CHECKPOINT_PATH)
    return {"status": "SUCCESS", "checkpoint": str(CHECKPOINT_PATH)}

if __name__ == "__main__":
    run_resonant_training()
