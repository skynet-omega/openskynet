"""
Exp96: V300 Master Training - The Resonant Learning Protocol
============================================================

Goal: Train the V300 using the 'Field Stabilization' method rather 
than simple next-word prediction. 

Data: Curated structured JSONL from SKYNET_GD, SKYNET_X, and SKYNET_X2.
Total samples: ~30,000 high-quality reasoning examples.

Mechanism:
1. Pure Word Vocab: Derived from books and structured samples.
2. Context Injection: Priming the physical field with 'Contexto'.
3. Perturbation: Injecting 'Instruccion'.
4. Resonance: 10 internal steps of wave interference.
5. Target: Predicting 'Respuesta' tokens.
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
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

REPORT_PATH = Path("exp96_master_training_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_FINAL_BRAIN.pth")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def load_master_dataset():
    print("  [Data] Consolidating structured datasets...")
    paths = [
        "/home/daroch/SKYNET_GD/data_fine_tuning/data_fine_tuning.jsonl",
        "/home/daroch/SKYNET_X/data_fine_tuning/dataset_fine_tuning.jsonl",
        "/home/daroch/SKYNET_X2/data_fine_tuning/dataset_fine_tuning.jsonl"
    ]
    samples = []
    for p in paths:
        path = Path(p)
        if path.exists():
            with open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    try:
                        data = json.loads(line)
                        if 'contexto' in data and 'instruccion' in data:
                            samples.append(data)
                    except: pass
    print(f"  [Data] Master dataset ready: {len(samples)} reasoning pairs.")
    return samples

def run_master_training():
    print("--- OPEN SKYNET: V300 MASTER RESONANT TRAINING ---")
    
    # 1. Load Foundation
    if not FOUNDATION_PATH.exists():
        print("  [ERROR] V300_FOUNDATION.pt missing. Run exp92 first.")
        return
    
    foundation = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = foundation['word_to_id']
    id_to_word = foundation['id_to_word']
    vocab_size = len(word_to_id)
    
    # 2. Load Data
    samples = load_master_dataset()
    if not samples:
        print("  [ERROR] No data found.")
        return

    # 3. Initialize fresh V300 (Clean Slate as requested)
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    # Optional: Load the newly purified checkpoint if it exists
    if CHECKPOINT_PATH.exists():
        print("  Resuming from V300_FINAL_BRAIN.pth...")
        model.load_checkpoint(CHECKPOINT_PATH)

    optimizer = torch.optim.Adam(model.parameters(), lr=2e-4)
    model.train()
    
    # 4. Resonant Training Protocol
    print("  Absorption starting (Target: 8 Hours / Parallel Streams)...")
    start_time = time.time()
    target_duration = 8 * 3600
    step = 0
    
    try:
        while (time.time() - start_time) < target_duration:
            sample = random.choice(samples)
            
            # --- THE SIGNAL PROTOCOL ---
            # 1. Build the 'Thought Field'
            ctx = clean_text(sample['contexto'])[-20:] # Last 20 words
            qst = clean_text(sample['instruccion'])[-15:] # Last 15 words
            ans = clean_text(sample['respuesta'])
            
            if not ans: continue
            
            # Map to IDs
            ctx_ids = [word_to_id[w] for w in ctx if w in word_to_id]
            qst_ids = [word_to_id[w] for w in qst if w in word_to_id]
            
            # 2. Sequential Injection (System 1)
            model.reset()
            # Feed Context
            if ctx_ids:
                model(torch.tensor(ctx_ids).unsqueeze(0).to(DEVICE))
            # Feed Question
            if qst_ids:
                model(torch.tensor(qst_ids).unsqueeze(0).to(DEVICE))
                
            # 3. Predict Answer (Step by Step)
            # We train on a random word from the answer to ensure sparse learning
            target_word = random.choice(ans)
            if target_word not in word_to_id: continue
            target_id = torch.tensor([word_to_id[target_word]]).to(DEVICE)
            
            # Forward pass (System 2 simulation happens inside model.forward)
            out = model(torch.tensor([word_to_id.get(ans[0], 0)]).unsqueeze(0).to(DEVICE))
            
            loss = F.cross_entropy(out['logits'], target_id)
            
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            
            step += 1
            if step % 500 == 0:
                elapsed = (time.time() - start_time) / 3600
                print(f"    Step {step} | Hours: {elapsed:.2f} | Loss: {loss.item():.4f}")
                
            if step % 2000 == 0:
                model.save_checkpoint(CHECKPOINT_PATH)

    except KeyboardInterrupt:
        print("  Interrupted. Saving...")
    finally:
        model.save_checkpoint(CHECKPOINT_PATH)

    return {"status": "SUCCESS", "steps": step}

if __name__ == "__main__":
    run_master_training()
