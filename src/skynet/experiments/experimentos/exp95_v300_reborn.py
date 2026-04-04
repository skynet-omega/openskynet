"""
Exp95: V300 Singularity Reborn - Clean Slate Training
=====================================================

Goal: Start from zero using only 'Purified Data' to ensure 
each concept learned is fresh and not an artifact of 
previous experiments.

Data:
1. Master Library (5 Books).
2. Structured Reasoning (SKYNET_X + SKYNET_GD).
3. Pure Word Map (27k whole words).

Mechanism:
- System 2 Resonant Thinking.
- No Subwords.
- Persistent Checkpoint: V300_CLEAN_SLATE.pth
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
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

REPORT_PATH = Path("exp95_clean_training_status.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_CLEAN_SLATE.pth")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")
LIBRARY_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/library_full.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def load_all_structured_data():
    samples = []
    # SKYNET_X
    x_file = Path("/home/daroch/SKYNET_X/data_fine_tuning/dataset_fine_tuning.jsonl")
    if x_file.exists():
        with open(x_file, 'r', encoding='utf-8') as f:
            for line in f: samples.append(json.loads(line))
    # SKYNET_GD
    gd_file = Path("/home/daroch/SKYNET_GD/data_fine_tuning/data_fine_tuning_ollama.jsonl")
    if gd_file.exists():
        with open(gd_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    if "messages" in data and len(data["messages"]) >= 2:
                        samples.append({"contexto": "", "instruccion": data["messages"][0]["content"], "respuesta": data["messages"][1]["content"]})
                except: pass
    return samples

def run_reborn_training():
    print("--- OPEN SKYNET: V300 SINGULARITY REBORN (CLEAN SLATE) ---")
    
    # 1. Load Foundation
    foundation = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = foundation['word_to_id']
    id_to_word = foundation['id_to_word']
    vocab_size = len(word_to_id)
    print(f"  [FOUNDATION] Loaded {vocab_size} pure words.")

    # 2. Load Data
    lib_words = clean_text(LIBRARY_PATH.read_text(encoding='utf-8'))
    structured_samples = load_all_structured_data()
    print(f"  [DATA] Library: {len(lib_words)} words. Structured: {len(structured_samples)} samples.")

    # 3. Initialize Model (Fresh start)
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=3e-4)
    model.train()
    
    print("  Absorption phase (Starting from ZERO)...")
    
    start_time = time.time()
    steps = 3000
    
    for step in range(steps):
        # Mix: 40% Books, 60% Structured Reasoning
        if random.random() < 0.4:
            idx = random.randint(0, len(lib_words) - 11)
            chunk = lib_words[idx : idx + 10]
            target = lib_words[idx + 10]
        else:
            sample = random.choice(structured_samples)
            # Use Question + start of Answer
            full_txt = clean_text(sample.get('instruccion', '') + " " + sample.get('respuesta', ''))
            if len(full_txt) < 11: continue
            idx = random.randint(0, len(full_txt) - 11)
            chunk = full_txt[idx : idx + 10]
            target = full_txt[idx + 10]
            
        input_ids = [word_to_id[w] for w in chunk if w in word_to_id]
        if len(input_ids) < 5 or target not in word_to_id: continue
        
        x_t = torch.tensor(input_ids).unsqueeze(0).to(DEVICE)
        y_t = torch.tensor([word_to_id[target]]).to(DEVICE)
        
        model.reset()
        out = model(x_t)
        loss = F.cross_entropy(out['logits'], y_t)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if (step + 1) % 1000 == 0:
            print(f"    Step {step+1}/{steps} | Loss: {loss.item():.4f} | Energy: {out['audit']['energy']:.4f}")

    # 4. Save and Test
    model.save_checkpoint(CHECKPOINT_PATH)
    
    print("\n--- FIRST WORDS TEST (V300 REBORN) ---")
    model.eval()
    prompts = ["quien es frodo", "que es la inteligencia", "habia una vez"]
    results = []
    for p in prompts:
        p_words = clean_text(p)
        ids = torch.tensor([word_to_id.get(w, 0) for w in p_words]).unsqueeze(0).to(DEVICE)
        model.reset()
        out = model(ids)
        pred = id_to_word[out['logits'].argmax(-1).item()]
        print(f"  Q: {p} -> A: {pred}")
        results.append(pred)

    report = {
        "experiment": "exp95_v300_reborn",
        "steps": steps,
        "status": "FUNCTIONAL",
        "first_words": results
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_reborn_training()
