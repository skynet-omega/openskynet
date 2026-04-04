"""
Exp90: V300 Singularity Marathon - 8 Hours (Full Context Reading)
=================================================================

Goal: Train the V300 Core on a high-density curated Spanish dataset.
Datasets:
1. 5 Books (Alicia, LOTR, 20k Leagues, Little Prince, Frankenstein).
2. OpenHermes-Spanish (1M lines).

Mechanics:
- Multilingual Embedding (250k words) from MiniLM.
- Sequential Text Feeding: To preserve narrative context, the books 
  are read sequentially, passing the hidden state forward without reset 
  until the end of a chapter/block.
- Checkpointing every 30 mins.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
import time
import subprocess
from pathlib import Path
import sys
import os

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

REPORT_PATH = Path("exp90_v300_marathon_status.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_MULTILINGUAL_BRAIN.pth")
EMBEDS_PATH = Path("/home/daroch/.openskynet/workspace/MULTILINGUAL_EMBEDS.pth")
LIBRARY_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/library_full.txt")
HERMES_ARROW = Path("/home/daroch/.cache/huggingface/datasets/Iker___open_hermes-2.5-spanish/default/0.0.0/b671e8e0335eb90087088df06d360e3dff59eab7/open_hermes-2.5-spanish-train-00000-of-00004.arrow")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_marathon():
    print("--- OPEN SKYNET: V300 SINGULARITY MARATHON (8 HOURS) ---")
    
    # 1. Load Multilingual Knowledge
    print(f"  Loading Multilingual Embedding from {EMBEDS_PATH.name}...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights']
    vocab_map = knowledge['vocab']
    vocab_size = len(vocab_map)
    print(f"  Vocab Size: {vocab_size} words.")

    # 2. Load Library into RAM
    print("  Loading 5 Master Books into RAM...")
    lib_text = LIBRARY_PATH.read_text(encoding='utf-8')
    lib_words = clean_text(lib_text)
    print(f"  Library Fuel: {len(lib_words)} words (Full Context mode).")

    # 3. Initialize Model
    # 64 organs x 64 nodes = 4096 physical neurons
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size,
        n_organs=64, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print("  Resuming from existing Singularity...")
        model.load_checkpoint(CHECKPOINT_PATH)

    # 4. Training Parameters
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    model.train()
    
    start_time = time.time()
    target_duration = 8 * 3600 
    last_checkpoint_time = time.time()
    
    # Hermes Loader (Subprocess strings)
    cmd = f"strings {HERMES_ARROW} | grep -E '^.{{40,500}}$' | head -n 500000"
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, text=True)
    
    step = 0
    lib_idx = 0
    seq_len = 12
    
    print(f"  Marathon started. Target finish: {time.ctime(start_time + target_duration)}")

    # We do NOT reset the model state between book batches to preserve deep context
    model.reset()

    try:
        while (time.time() - start_time) < target_duration:
            # MIXED SAMPLING
            # 50% Books (Sequential), 50% Hermes (Random-ish streams)
            
            is_book = random.random() < 0.5
            
            if is_book:
                # SEQUENTIAL READING (No truncation, keeping context)
                if lib_idx + seq_len + 1 >= len(lib_words):
                    lib_idx = 0 # Loop back to start
                    model.reset() # Only reset when book ends
                
                chunk = [vocab_map.get(w, 0) for w in lib_words[lib_idx : lib_idx+seq_len]]
                target = vocab_map.get(lib_words[lib_idx+seq_len], 0)
                lib_idx += seq_len # Advance pointer sequentially
            else:
                # Sample from Hermes (Streaming)
                line = proc.stdout.readline()
                if not line: # Loop if reached end
                    proc.terminate()
                    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, text=True)
                    line = proc.stdout.readline()
                
                words = clean_text(line)
                if len(words) < seq_len + 1: continue
                # For isolated chat lines, we reset state to avoid confusing it with the book
                model.reset()
                
                chunk = [vocab_map.get(w, 0) for w in words[:seq_len]]
                target = vocab_map.get(words[seq_len], 0)

            # Train
            ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
            target_id = torch.tensor([target]).to(DEVICE)
            
            # Forward (State is preserved automatically by V300 class unless model.reset() is called)
            out = model(ids)
            loss = F.cross_entropy(out['logits'], target_id)
            
            optimizer.zero_grad()
            loss.backward(retain_graph=False)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            
            # Detach states to prevent infinite BPTT history
            model.detach_states()
            
            step += 1
            
            # Periodic Save and Log
            if time.time() - last_checkpoint_time > 1800:
                model.save_checkpoint(CHECKPOINT_PATH)
                last_checkpoint_time = time.time()
                
                elapsed = (time.time() - start_time) / 3600
                status = {
                    "step": step,
                    "elapsed_hours": elapsed,
                    "last_loss": loss.item(),
                    "energy": out['audit']['energy']
                }
                REPORT_PATH.write_text(json.dumps(status, indent=2))
                print(f"  [Auto-Save] Step {step} | Hours: {elapsed:.2f} | Loss: {loss.item():.4f}")

    except Exception as e:
        print(f"  [CRITICAL] {e}")
    finally:
        model.save_checkpoint(CHECKPOINT_PATH)
        proc.terminate()

    print("--- MARATHON FINISHED ---")
    return {"status": "FINISHED", "steps": step}

if __name__ == "__main__":
    run_marathon()
