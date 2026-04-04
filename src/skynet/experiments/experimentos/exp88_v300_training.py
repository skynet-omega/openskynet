"""
Exp88: V300 Singularity - Massive Embedding Training
====================================================

Goal: Train the V300 (V250 with inherited MiniLM embeddings) 
on 1,000,000 lines of OpenHermes-Spanish for 8 hours.

Key Implementation:
1. Knowledge Transfer: Inherits 30,522 word meanings from MiniLM.
2. Efficiency: 1M lines pre-loaded into RAM.
3. Scale: 64 organs, d=32 features.
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

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

REPORT_PATH = Path("exp88_v300_training_status.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_SINGULARITY_FINAL.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")
DATA_FILE = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/fast_data.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_v300_marathon():
    print("--- OPEN SKYNET: V300 SINGULARITY MARATHON ---")
    
    # 1. Load Pre-trained Knowledge
    print(f"  Loading MiniLM Embeddings from {EMBEDS_PATH.name}...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights']
    vocab_map = knowledge['vocab'] # dict: word -> id
    id_to_word = {i: w for w, i in vocab_map.items()}
    vocab_size = len(vocab_map)
    print(f"  Inherited Vocab Size: {vocab_size} words.")

    # 2. Load Training Data into RAM
    print(f"  Loading 1M lines from {DATA_FILE.name} into RAM...")
    with open(DATA_FILE, 'r') as f:
        all_lines = f.readlines()
    print(f"  Fuel Tank Ready: {len(all_lines)} lines.")

    # 3. Initialize V300 Core
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=64, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print(f"  Resuming from existing V300 brain...")
        model.load_checkpoint(CHECKPOINT_PATH)

    # 4. Training Loop (8 Hour Turbo Marathon)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    model.train()
    
    start_time = time.time()
    target_duration = 8 * 3600 
    last_checkpoint_time = time.time()
    
    step = 0
    print(f"  V300 Marathon started at {time.ctime()}.")
    
    try:
        while (time.time() - start_time) < target_duration:
            # Batch Training
            line = random.choice(all_lines)
            # Tokenization must match MiniLM (this is a simple approximation)
            words = clean_text(line)
            if len(words) < 12: continue
            
            seq_len = 8
            idx_start = random.randint(0, len(words) - seq_len - 1)
            chunk = [vocab_map.get(w, 0) for w in words[idx_start : idx_start + seq_len]]
            target_word = words[idx_start + seq_len]
            if target_word not in vocab_map: continue
            
            ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
            target_id = torch.tensor([vocab_map[target_word]]).to(DEVICE)
            
            model.reset()
            out = model(ids)
            loss = F.cross_entropy(out['logits'], target_id)
            
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            
            step += 1
            
            # Monitoring log (every 1000 steps)
            if step % 1000 == 0:
                elapsed = (time.time() - start_time) / 3600
                status = {
                    "step": step,
                    "elapsed_hours": elapsed,
                    "last_loss": loss.item(),
                    "energy": out['audit']['energy'],
                    "timestamp": time.ctime(),
                    "mode": "V300_SINGULARITY"
                }
                REPORT_PATH.write_text(json.dumps(status, indent=2))
                print(f"  Step {step} | Hours: {elapsed:.2f} | Loss: {loss.item():.4f}")

            # Periodic Checkpoint (every 30 mins)
            if time.time() - last_checkpoint_time > 1800:
                model.save_checkpoint(CHECKPOINT_PATH)
                last_checkpoint_time = time.time()

    except Exception as e:
        print(f"  [CRITICAL ERROR] {e}")
        model.save_checkpoint(CHECKPOINT_PATH)

    print("--- V300 MARATHON FINISHED ---")
    model.save_checkpoint(CHECKPOINT_PATH)

if __name__ == "__main__":
    run_v300_marathon()
