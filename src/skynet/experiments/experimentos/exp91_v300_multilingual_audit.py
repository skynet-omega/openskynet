"""
Exp91: V300 Multilingual Audit - 15k Steps
==========================================

Audit of the first checkpoint of the V300 marathon.
Inherited 250k multilingual embeddings + 5 Master Books.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
from pathlib import Path
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_MULTILINGUAL_BRAIN.pth")
EMBEDS_PATH = Path("/home/daroch/.openskynet/workspace/MULTILINGUAL_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def generate_text(model, prompt_ids, id_to_word, max_len=30, temperature=0.7):
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
    print("--- V300 MULTILINGUAL QUICK AUDIT ---")
    
    # 1. Load Multilingual Vocab
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    vocab_map = knowledge['vocab']
    id_to_word = {i: w for w, i in vocab_map.items()}
    
    # 2. Initialize V300 Core with the sizes found in the checkpoint
    # We use 250002 as the base for the decoder, 
    # but we'll manually fix the embed size if needed.
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=250002, n_organs=64, n_nodes_per_organ=64, d_feature=32, device=DEVICE
    ).to(DEVICE)
    
    # 3. Load Checkpoint
    if CHECKPOINT_PATH.exists():
        print(f"Loading checkpoint: {CHECKPOINT_PATH.name}")
        sd = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
        
        # Repair size mismatch manually
        if sd['text_embed.weight'].shape[0] != model.text_embed.weight.shape[0]:
            print(f"  Repairing text_embed size: {model.text_embed.weight.shape[0]} -> {sd['text_embed.weight'].shape[0]}")
            model.text_embed = nn.Embedding(sd['text_embed.weight'].shape[0], 512).to(DEVICE)
            
        model.load_state_dict(sd, strict=True)
        print("  [SUCCESS] State dict loaded and repaired.")
    else:
        print("Checkpoint not found!")
        return

    # 4. Dialogue Test
    prompts = [
        "hola como estas",
        "frodo tenia el anillo",
        "el principito vivia en"
    ]
    
    for p in prompts:
        p_words = clean_text(p)
        ids = torch.tensor([vocab_map.get(w, 0) for w in p_words]).unsqueeze(0).to(DEVICE)
        res = generate_text(model, ids, id_to_word)
        print(f"Q: {p}\nA: {res}\n")

if __name__ == "__main__":
    run_audit()
