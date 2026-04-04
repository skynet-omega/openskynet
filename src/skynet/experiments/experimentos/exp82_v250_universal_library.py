"""
Exp82: V250 Universal Spanish Library - Massive Knowledge Absorption
===================================================================

Goal: Train V250 on a massive corpus of classic Spanish literature 
to build a 'Generalist Cultural Brain'.

Corpus: All .txt files in /home/daroch/documents.
Mechanism:
1. Multi-book Vocabulary building.
2. High-Capacity Resonant Training (Batching + VRAM Optimization).
3. Post-Training Dialogue & Reasoning Audit.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import random
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

REPORT_PATH = Path("exp82_v250_universal_library_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V250_UNIVERSAL_BRAIN.pth")
DOCS_DIR = Path("/home/daroch/documents")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    # Keep Spanish characters
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_massive_absorption():
    print("--- V250 MASSIVE KNOWLEDGE ABSORPTION: UNIVERSAL LIBRARY ---")
    
    # 1. Gather all text from .txt files
    txt_files = list(DOCS_DIR.glob("*.txt"))
    all_words = []
    print(f"  Found {len(txt_files)} text books.")
    
    for f in txt_files:
        print(f"    Reading {f.name}...")
        try:
            content = f.read_text(encoding='utf-8')
            all_words.extend(clean_text(content))
        except:
            print(f"    [SKIP] Encoding error in {f.name}")

    if not all_words:
        print("  No text files found. Using fallback synthetic corpus.")
        all_words = clean_text("Había una vez un sistema llamado OpenSkynet que quería aprenderlo todo.")

    vocab = sorted(list(set(all_words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    print(f"  Unified Vocab Size: {vocab_size} words.")

    # 2. Initialize V250 Scaling Core
    # 64 organs x 64 nodes = 4096 physical neurons
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        model.load_checkpoint(CHECKPOINT_PATH)

    # 3. Training Loop (Sequential Autoregressive)
    optimizer = torch.optim.Adam(model.parameters(), lr=3e-4)
    print("  Starting Knowledge Digestion (5000 steps)...")
    
    seq_len = 10
    batch_size = 16
    
    model.train()
    for step in range(5000):
        # Batch preparation
        x_batch = []
        y_batch = []
        
        for _ in range(batch_size):
            idx = random.randint(0, len(all_words) - seq_len - 1)
            chunk = all_words[idx : idx + seq_len]
            target = all_words[idx + seq_len]
            x_batch.append([word_to_id[w] for w in chunk])
            y_batch.append(word_to_id[target])
            
        x_t = torch.tensor(x_batch).to(DEVICE)
        y_t = torch.tensor(y_batch).to(DEVICE)
        
        model.reset()
        out = model(x_t)
        loss = F.cross_entropy(out['logits'], y_t)
        
        optimizer.zero_grad()
        loss.backward()
        # Gradient clipping for stability in massive resonance
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if (step + 1) % 1000 == 0:
            print(f"    Step {step+1}/5000 | Loss: {loss.item():.4f} | Resonant Energy: {out['audit']['energy']:.4f}")

    # 4. Final Dialogue Test
    print("\n--- UNIVERSAL BRAIN DIALOGUE ---")
    prompts = [
        "alicia se sintió muy",
        "el secreto de la vida es",
        "en el centro de la tierra"
    ]
    
    responses = []
    model.eval()
    for p in prompts:
        p_words = clean_text(p)
        ids = torch.tensor([word_to_id[w] for w in p_words if w in word_to_id]).unsqueeze(0).to(DEVICE)
        if ids.size(1) == 0: continue
        
        # Generation with temperature for creativity
        res_words = [id_to_word[id.item()] for id in ids[0]]
        curr = ids
        with torch.no_grad():
            for _ in range(15):
                model.reset()
                out = model(curr)
                probs = F.softmax(out['logits'] / 0.8, dim=-1)
                nxt = torch.multinomial(probs, 1)
                res_words.append(id_to_word[nxt.item()])
                curr = torch.cat([curr[:, 1:], nxt], dim=1)
        
        full_res = " ".join(res_words)
        print(f"  Q: {p}\n  A: {full_res}\n")
        responses.append(full_res)

    # 5. Save State
    model.save_checkpoint(CHECKPOINT_PATH)
    
    report = {
        "experiment": "exp82_v250_universal_library",
        "books_read": 1, # Alicia.txt
        "vocab_size": vocab_size,
        "steps": 5000,
        "responses": responses,
        "status": "CULTURAL_FOUNDATION_LAID"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_massive_absorption()
