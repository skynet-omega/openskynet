"""
Exp101: Child Mind Study - Structured vs Plain (Alicia)
======================================================

Goal: Compare if learning from 'Structured Protocols' (Context-Question-Answer)
is superior to 'Plain Text' for the V300 architecture.

Mechanism:
1. Generate synthetic Q&A from Alicia text.
2. Train V300 on structured pairs.
3. Measure if it responds better to prompts.
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
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def generate_structured_alicia(words, n_samples=1000):
    samples = []
    for _ in range(n_samples):
        # Pick a random window
        idx = random.randint(0, len(words) - 30)
        context = words[idx : idx + 15]
        target = words[idx + 15 : idx + 25]
        samples.append({
            "ctx": context,
            "target": target
        })
    return samples

def run_structured_study():
    print("\n--- CHILD MIND STUDY: STRUCTURED PROTOCOL ---")
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    all_words = clean_text(raw_text)
    vocab = sorted(list(set(all_words)))
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    samples = generate_structured_alicia(all_words, 2000)
    
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=len(vocab), n_organs=16, n_nodes_per_organ=32, d_feature=32, device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    model.train()
    for step in range(3000):
        sample = random.choice(samples)
        # We train the model to output the TARGET sequence word by word 
        # after seeing the CTX.
        ctx_ids = torch.tensor([word_to_id[w] for w in sample['ctx']]).unsqueeze(0).to(DEVICE)
        
        # 1. Prime the field with context
        model.reset()
        model(ctx_ids)
        
        # 2. Predict first word of target
        target_id = torch.tensor([word_to_id[sample['target'][0]]]).to(DEVICE)
        
        # Current logic of forward() only takes one batch of ids.
        # To simulate "Answer prediction", we feed the first word of target.
        out = model(torch.tensor([[word_to_id[sample['ctx'][-1]]]], device=DEVICE))
        
        loss = F.cross_entropy(out['logits'], target_id)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
    # Evaluation
    model.eval()
    prompt = "alicia estaba muy"
    p_words = clean_text(prompt)
    p_ids = torch.tensor([word_to_id.get(w, 0) for w in p_words]).unsqueeze(0).to(DEVICE)
    
    res_words = p_words.copy()
    curr = p_ids
    with torch.no_grad():
        for _ in range(10):
            model.reset()
            out = model(curr)
            next_id = out['logits'].argmax(-1).item()
            res_words.append(id_to_word[next_id])
            curr = torch.cat([curr[:, 1:], torch.tensor([[next_id]], device=DEVICE)], dim=1)
            
    print(f"  STRUCTURED RESULT: {' '.join(res_words)}")

if __name__ == "__main__":
    run_structured_study()
