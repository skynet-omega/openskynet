"""
Exp106: Mathematical Audit of Text Learning (The Mode Collapse Proof)
=====================================================================

Goal: Demonstrate the mathematical difference between training a 
plain Resonant Organ (V300) and one with the 'Diversity Antidote' 
(Entropy Cost) when learning human language.

Language follows Zipf's Law: "de", "que", "el" are astronomically 
more frequent than "Alicia". Without a physical force to prevent it, 
the network's lowest energy state (minimum Cross Entropy) is to 
collapse into predicting only those 3 words.
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

def audit_learning_physics(apply_antidote=False):
    print(f"\n--- PHYSICS AUDIT: Diversity Antidote = {apply_antidote} ---")
    
    words = clean_text(BOOK_PATH.read_text(encoding='utf-8'))
    vocab = sorted(list(set(words)))
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    # We use a tiny brain to force the collapse quickly for observation
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=len(vocab), n_organs=4, n_nodes_per_organ=16, d_feature=16, device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    
    # Metrics
    diversity_over_time = []
    
    for step in range(2000):
        idx = random.randint(0, len(words) - 6)
        chunk = [word_to_id[w] for w in words[idx:idx+5]]
        target = word_to_id[words[idx+5]]
        
        ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([target]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        logits = out['logits']
        
        loss_ce = F.cross_entropy(logits, target_id)
        
        # Calculate output distribution entropy (Diversity)
        probs = F.softmax(logits, dim=-1)
        entropy = -torch.sum(probs * torch.log(probs + 1e-9))
        
        if apply_antidote:
            # The 'Antidote': Penalize low entropy (force the model to consider other words)
            total_loss = loss_ce - (0.5 * entropy)
        else:
            total_loss = loss_ce
            
        optimizer.zero_grad()
        total_loss.backward()
        optimizer.step()
        
        if (step+1) % 500 == 0:
            diversity_over_time.append(entropy.item())
            print(f"  Step {step+1} | CE Loss: {loss_ce.item():.4f} | Output Entropy: {entropy.item():.4f}")

    # Inference test
    model.eval()
    prompt = "alicia"
    p_ids = torch.tensor([word_to_id.get(prompt, 0)]).unsqueeze(0).to(DEVICE)
    
    res = [prompt]
    curr = p_ids
    with torch.no_grad():
        for _ in range(10):
            model.reset()
            out = model(curr)
            # We use argmax to see the true 'Mode' of the distribution
            nxt = out['logits'].argmax(-1).item()
            res.append(id_to_word[nxt])
            curr = torch.cat([curr[:, 1:], torch.tensor([[nxt]], device=DEVICE)], dim=1)
            
    print(f"  Final Sentence (Greedy): {' '.join(res)}")
    return diversity_over_time

if __name__ == "__main__":
    print("ANALYSIS: ZIPF'S LAW COLLAPSE IN V300")
    torch.manual_seed(99)
    random.seed(99)
    
    print("\n--- TEST A: PLAIN LEARNING (Tabula Rasa) ---")
    audit_learning_physics(apply_antidote=False)
    
    print("\n--- TEST B: THE ANTIDOTE (Diversity Injection) ---")
    audit_learning_physics(apply_antidote=True)
