"""
Exp87: Quick Intelligence Audit - V250 Post-Absorption
======================================================

Goal: Test the current state of V250 after the initial 
Great Training steps.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V250_SINGULARITY_4B_SEED.pth")
BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def generate_text(model, prompt_ids, id_to_word, max_len=25, temperature=0.7):
    model.eval()
    results = [id_to_word.get(id.item(), "[UNK]") for id in prompt_ids[0]]
    current_ids = prompt_ids
    with torch.no_grad():
        for _ in range(max_len):
            model.reset()
            out = model(current_ids)
            probs = F.softmax(out['logits'] / temperature, dim=-1)
            next_id = torch.multinomial(probs, 1)
            results.append(id_to_word.get(next_id.item(), "[UNK]"))
            current_ids = torch.cat([current_ids[:, 1:], next_id], dim=1)
    return " ".join(results)

def run_audit():
    print("--- V250 QUICK AUDIT SESSION ---")
    
    # 1. Build Vocab from the same source as exp86 (first 20k lines of fast_data.txt)
    DATA_FILE = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/fast_data.txt")
    all_words = []
    if DATA_FILE.exists():
        with open(DATA_FILE, 'r') as f:
            for i, line in enumerate(f):
                if i >= 20000: break
                all_words.extend(clean_text(line))
    
    vocab = sorted(list(set(all_words)))
    vocab.append("[UNK]")
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    print(f"  Audit Vocab Size: {vocab_size} words.")
    
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size, n_organs=64, n_nodes_per_organ=64, d_feature=32, device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print(f"Loading checkpoint: {CHECKPOINT_PATH.name}")
        # Use strict=False because vocab might differ slightly if we didn't save word_to_id
        model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=DEVICE), strict=False)
    else:
        print("Checkpoint not found!")
        return

    prompts = [
        "hola como estas",
        "que es la inteligencia",
        "alicia estaba muy"
    ]
    
    for p in prompts:
        p_words = clean_text(p)
        ids = torch.tensor([word_to_id.get(w, word_to_id["[UNK]"]) for w in p_words]).unsqueeze(0).to(DEVICE)
        res = generate_text(model, ids, id_to_word)
        print(f"Q: {p}\nA: {res}\n")

if __name__ == "__main__":
    run_audit()
