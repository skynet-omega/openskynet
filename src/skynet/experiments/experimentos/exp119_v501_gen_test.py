"""
Exp119: V501 (RICCI PoC) General Test
=====================================

Goal: See if the V501 model (trained on only one sentence) 
can generalize to other prompts or if it's overfitted.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import sys
import os
from pathlib import Path

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V501_RICCI import SKYNET_CORE_V501_RICCI

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_test():
    print("--- OPEN SKYNET: V501 RICCI GENERAL TEST ---")
    
    # 1. Load Dictionary
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    # 2. Initialize V501
    model = SKYNET_CORE_V501_RICCI(
        vocab_size=vocab_size,
        n_organs=16, 
        pretrained_embeds=weights
    ).to(DEVICE)
    
    # V501 doesn't have a saved checkpoint on disk, it was trained 
    # and then the session ended. I'll re-train it for 200 steps 
    # (it only took a few seconds) and then test it.
    
    # --- RE-TRAIN V501 PoC ---
    message = "alicia bajó por la madriguera y encontró un mundo nuevo"
    words = clean_text(message)
    seq = [vocab_map[w] for w in words if w in vocab_map]
    x_train = torch.tensor([seq[:-1]]).to(DEVICE)
    y_train = torch.tensor([seq[1:]]).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    for _ in range(200):
        model.reset()
        out = model(x_train)
        loss = F.cross_entropy(out['logits'].view(-1, vocab_size), y_train.view(-1))
        optimizer.zero_grad(); loss.backward(); optimizer.step()
    
    # --- TEST V501 ---
    model.eval()
    prompts = [
        "alicia bajó por la",       # Target
        "el conejo blanco",         # Out of distribution
        "encontró un mundo"         # Mid-sequence
    ]

    for prompt in prompts:
        print(f"\n  Prompt: '{prompt}'")
        words = clean_text(prompt)
        p_ids = torch.tensor([vocab_map.get(w, 0) for w in words]).unsqueeze(0).to(DEVICE)
        
        res = words.copy()
        curr = p_ids
        
        with torch.no_grad():
            for _ in range(6):
                model.reset()
                out = model(curr, training=False)
                nxt = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
                word = id_to_word.get(nxt, "<?>")
                res.append(word)
                curr = torch.cat([curr, torch.tensor([[nxt]], device=DEVICE)], dim=1)
                
        print(f"  Result: {' '.join(res)}")

if __name__ == "__main__":
    run_test()
