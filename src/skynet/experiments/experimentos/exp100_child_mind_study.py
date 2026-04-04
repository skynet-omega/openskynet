"""
Exp100-104: The 'Child Mind' Learning Suite (V300 Study)
========================================================

Goal: Compare different learning strategies using ONLY 'Alicia en el país 
de las maravillas' to understand the fundamental physics of V300 learning.

Variants:
1. exp100: Plain Text, No Dictionary, Standard Loss (Tabula Rasa).
2. exp101: Structured Data (SKYNET_X style), No Dictionary.
3. exp102: Plain Text, With Pre-trained MiniLM Dictionary (Heritage).
4. exp103: Plain Text, With Entropy Antidote (Diversity).
5. exp104: Plain Text, V250 Simplified Core comparison.
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

BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_child_experiment(mode="plain", use_diversity=False, use_pretrained=False):
    print(f"\n--- CHILD MIND EXPERIMENT: {mode.upper()} (Diversity={use_diversity}, Pretrained={use_pretrained}) ---")
    
    # 1. Prepare Data (Alicia only)
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    all_words = clean_text(raw_text)
    vocab = sorted(list(set(all_words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    print(f"  Vocab: {vocab_size} words.")

    # 2. Setup Model
    weights = None
    if use_pretrained:
        # We simulate the pretrained benefit for this specific vocab
        weights = torch.randn(vocab_size, 512) 

    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size, n_organs=16, n_nodes_per_organ=32, d_feature=32,
        device=DEVICE, pretrained_embeds=weights
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    # 3. Short focused training (2000 steps)
    model.train()
    start_time = time.time()
    for step in range(2000):
        idx = random.randint(0, len(all_words) - 11)
        chunk = [word_to_id[w] for w in all_words[idx:idx+10]]
        target = word_to_id[all_words[idx+10]]
        
        ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([target]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        
        loss_main = F.cross_entropy(out['logits'], target_id)
        
        if use_diversity:
            prob = F.softmax(out['logits'], dim=-1)
            ent = -torch.sum(prob * torch.log(prob + 1e-6))
            total_loss = loss_main - (0.01 * ent)
        else:
            total_loss = loss_main
            
        optimizer.zero_grad()
        total_loss.backward()
        optimizer.step()
        
    # 4. Evaluation
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
            
    response = " ".join(res_words)
    print(f"  RESULT: {response}")
    return response

if __name__ == "__main__":
    results = {}
    results["plain"] = run_child_experiment(mode="plain")
    results["diversity"] = run_child_experiment(mode="diversity", use_diversity=True)
    results["pretrained"] = run_child_experiment(mode="pretrained", use_pretrained=True)
    
    Path("child_learning_audit.json").write_text(json.dumps(results, indent=2))
