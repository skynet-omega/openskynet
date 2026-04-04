"""
Exp86: V300 Hyperdimensional Marathon - 1M lines (Heritage Mode)
================================================================

Mechanism:
1. Heritage: Loading 30,522 word embeddings from MiniLM.
2. Data: 1,000,000 lines from OpenHermes-Spanish.
3. Architecture: V300 Resonant Hypergraph.
4. Scale: 64 organs, d=32 features.
5. Performance: Loads entire dataset into RAM.
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
from SKYNET_CORE_V300_HYPERDIMENSIONAL import SKYNET_CORE_V300_HYPERDIMENSIONAL

REPORT_PATH = Path("exp86_great_training_status.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_GENERALIST_BRAIN.pth")
HERITAGE_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")
DATA_FILE = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/fast_data.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_v300_training():
    print("--- OPEN SKYNET: V300 HYPERDIMENSIONAL MARATHON ---")
    
    # 1. Initialize V300
    model = SKYNET_CORE_V300_HYPERDIMENSIONAL(
        vocab_size=30522,
        n_organs=64, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    # 2. Load Heritage (Brain Transplant)
    word_to_id = model.load_heritage(HERITAGE_PATH)
    id_to_word = {i: w for w, i in word_to_id.items()}

    if CHECKPOINT_PATH.exists():
        print(f"  Resuming from: {CHECKPOINT_PATH.name}")
        model.load_checkpoint(CHECKPOINT_PATH)

    # 3. Load Data
    print(f"  Loading {DATA_FILE.name} into RAM...")
    with open(DATA_FILE, 'r') as f:
        all_lines = f.readlines()
    print(f"  Loaded {len(all_lines)} lines.")

    # 4. Training Loop
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    model.train()
    
    start_time = time.time()
    target_duration = 8 * 3600 
    last_checkpoint_time = time.time()
    step = 0
    
    print(f"  V300 Marathon started at {time.ctime()}.")
    
    try:
        while (time.time() - start_time) < target_duration:
            line = random.choice(all_lines)
            words = clean_text(line)
            if len(words) < 12: continue
            
            # Map words to IDs
            chunk_ids = [word_to_id[w] for w in words if w in word_to_id]
            if len(chunk_ids) <= 8: continue
            
            idx_start = random.randint(0, len(chunk_ids) - 9)
            chunk = chunk_ids[idx_start : idx_start + 8]
            target = chunk_ids[idx_start + 8]
            
            ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
            target_id = torch.tensor([target]).to(DEVICE)
            
            model.reset()
            out = model(ids)
            loss = F.cross_entropy(out['logits'], target_id)
            
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            
            step += 1
            
            if step % 1000 == 0:
                elapsed = (time.time() - start_time) / 3600
                status = {
                    "step": step,
                    "elapsed_hours": elapsed,
                    "last_loss": loss.item(),
                    "energy": out['audit']['energy'],
                    "mode": "V300_HERITAGE"
                }
                REPORT_PATH.write_text(json.dumps(status, indent=2))
                
            if time.time() - last_checkpoint_time > 1800:
                model.save_checkpoint(CHECKPOINT_PATH)
                last_checkpoint_time = time.time()
                print(f"  [Save] Step {step} | Hours: {(time.time()-start_time)/3600:.2f} | Loss: {loss.item():.4f}")

    except Exception as e:
        print(f"  [CRITICAL ERROR] {e}")
        model.save_checkpoint(CHECKPOINT_PATH)

    print("--- V300 MARATHON FINISHED ---")
    model.save_checkpoint(CHECKPOINT_PATH)

if __name__ == "__main__":
    run_v300_training()
