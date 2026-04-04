"""
Exp97: V300 Master Audit - Step 15,000+
=======================================

Goal: Quick sanity check on the 'V300_FINAL_BRAIN.pth' 
after 15,000 steps of structured training.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
from pathlib import Path
import sys
import os

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_FINAL_BRAIN.pth")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def generate_text(model, prompt_ids, id_to_word, max_len=40, temperature=0.5):
    model.eval()
    # Initial words from prompt
    results = [id_to_word.get(id.item(), "[UNK]") for id in prompt_ids[0]]
    current_ids = prompt_ids
    
    # Track hidden states to see if they collapse
    with torch.no_grad():
        for _ in range(max_len):
            model.reset()
            out = model(current_ids)
            
            # Greedy search to see the 'most likely' path
            next_id = out['logits'].argmax(-1) # [1]
            
            word = id_to_word.get(next_id.item(), "[UNK]")
            results.append(word)
            current_ids = torch.cat([current_ids[:, 1:], next_id.unsqueeze(0)], dim=1)
    return " ".join(results)

def run_quick_audit():
    print("--- V300 MASTER QUICK AUDIT (Post-Step 15,000) ---")
    
    # 1. Load Foundation
    foundation = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = foundation['word_to_id']
    id_to_word = foundation['id_to_word']
    vocab_size = len(word_to_id)
    
    # 2. Initialize V300
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size, n_organs=32, n_nodes_per_organ=64, d_feature=32, device=DEVICE
    ).to(DEVICE)
    
    # 3. Load Checkpoint
    if CHECKPOINT_PATH.exists():
        model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=DEVICE))
        print(f"  [OK] Loaded checkpoint: {CHECKPOINT_PATH.name}")
    else:
        print("  [ERROR] Checkpoint not found!")
        return

    # 4. Tests
    prompts = [
        "frodo bolsón lleva el anillo único al",
        "en un lugar de la mancha de cuyo",
        "el principito vivía en el planeta"
    ]
    
    for p in prompts:
        p_words = clean_text(p)
        ids = torch.tensor([word_to_id.get(w, 0) for w in p_words]).unsqueeze(0).to(DEVICE)
        res = generate_text(model, ids, id_to_word)
        print(f"  Q: {p}\n  A: {res}\n")

if __name__ == "__main__":
    run_quick_audit()
