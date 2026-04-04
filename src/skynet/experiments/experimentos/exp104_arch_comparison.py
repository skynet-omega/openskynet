"""
Exp104: Child Mind Study - V250 vs V300 (Alicia)
==============================================

Goal: Compare the learning efficiency of V250 (Simple Resonant) 
vs V300 (System 2 Rotation) on small scale data.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
from pathlib import Path
import sys
import os

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_comparison():
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    all_words = clean_text(raw_text)
    vocab = sorted(list(set(all_words)))
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    models = {
        "V250": SKYNET_CORE_V250_SPARSE_RESONANT(vocab_size=len(vocab), n_organs=16, device=DEVICE),
        "V300": SKYNET_CORE_V300_SINGULARITY(vocab_size=len(vocab), n_organs=16, device=DEVICE)
    }
    
    for name, model in models.items():
        print(f"\n--- TESTING {name} ---")
        model.to(DEVICE)
        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        
        model.train()
        for step in range(3000):
            idx = random.randint(0, len(all_words) - 11)
            chunk = [word_to_id[w] for w in all_words[idx:idx+10]]
            target = word_to_id[all_words[idx+10]]
            ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
            target_id = torch.tensor([target]).to(DEVICE)
            
            model.reset()
            out = model(ids)
            loss = F.cross_entropy(out['logits'], target_id)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
        model.eval()
        prompt = "alicia estaba muy"
        p_ids = torch.tensor([word_to_id.get(w, 0) for w in clean_text(prompt)]).unsqueeze(0).to(DEVICE)
        res = [clean_text(prompt)[i] for i in range(len(clean_text(prompt)))]
        curr = p_ids
        with torch.no_grad():
            for _ in range(10):
                model.reset()
                out = model(curr)
                nxt = out['logits'].argmax(-1).item()
                res.append(id_to_word[nxt])
                curr = torch.cat([curr[:, 1:], torch.tensor([[nxt]], device=DEVICE)], dim=1)
        print(f"  {name} Result: {' '.join(res)}")

if __name__ == "__main__":
    run_comparison()
