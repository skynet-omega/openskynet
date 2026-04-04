"""
Exp105: The Physics of Language (V300 Learning Dynamics)
========================================================

Goal: Understand WHY the V300 falls into the "de" (Mode Collapse) trap
when learning from a single book (Alicia), while earlier versions didn't.

Hypotheses to test:
1. System 2 Overthinking: V300 has `n_internal_steps=5`. Does letting the 
   wave 'ring' without input wash out the signal into the most common token?
2. Sequence Length: Does a longer BPTT window (seq=10 vs seq=5) cause 
   phase destruction?
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

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def test_learning_dynamics(internal_steps, seq_len):
    print(f"\n--- Testing: Internal Steps={internal_steps}, Seq_Len={seq_len} ---")
    
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    all_words = clean_text(raw_text)
    vocab = sorted(list(set(all_words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size, n_organs=8, n_nodes_per_organ=16, d_feature=16, device=DEVICE
    ).to(DEVICE)
    
    # Apply hypothesis
    model.n_internal_steps = internal_steps
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    
    for step in range(1500):
        idx = random.randint(0, len(all_words) - seq_len - 1)
        chunk = [word_to_id[w] for w in all_words[idx:idx+seq_len]]
        target = word_to_id[all_words[idx+seq_len]]
        
        ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([target]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], target_id)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    # Test
    model.eval()
    prompt = "alicia estaba muy"
    p_words = clean_text(prompt)
    p_ids = torch.tensor([word_to_id.get(w, 0) for w in p_words]).unsqueeze(0).to(DEVICE)
    
    res = p_words.copy()
    curr = p_ids
    with torch.no_grad():
        for _ in range(8):
            model.reset()
            out = model(curr)
            nxt = out['logits'].argmax(-1).item()
            res.append(id_to_word[nxt])
            curr = torch.cat([curr[:, 1:], torch.tensor([[nxt]], device=DEVICE)], dim=1)
            
    print(f"  Result: {' '.join(res)}")

if __name__ == "__main__":
    torch.manual_seed(42)
    random.seed(42)
    test_learning_dynamics(internal_steps=5, seq_len=10) # The V300 default (Fails)
    test_learning_dynamics(internal_steps=0, seq_len=10) # No overthinking
    test_learning_dynamics(internal_steps=5, seq_len=5)  # Short sequence
    test_learning_dynamics(internal_steps=0, seq_len=5)  # V250 equivalent
