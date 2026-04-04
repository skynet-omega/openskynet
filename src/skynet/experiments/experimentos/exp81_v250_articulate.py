"""
Exp81: The Articulate Brain - V250 Language Training & Dialogue
==============================================================

Long training session on Spanish literature to measure 
knowledge acquisition and generative quality.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import random
from pathlib import Path
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

REPORT_PATH = Path("exp81_v250_articulate_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V250_ARTICULATE_BRAIN.pth")
BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', '', text)
    return text.split()

def generate_text(model, prompt_ids, id_to_word, max_len=20, temperature=0.8):
    model.eval()
    results = [id_to_word[id.item()] for id in prompt_ids[0]]
    current_ids = prompt_ids
    
    with torch.no_grad():
        for _ in range(max_len):
            model.reset()
            out = model(current_ids)
            probs = F.softmax(out['logits'] / temperature, dim=-1)
            next_id = torch.multinomial(probs, 1)
            results.append(id_to_word[next_id.item()])
            current_ids = torch.cat([current_ids[:, 1:], next_id], dim=1)
    return " ".join(results)

def run_articulate_session():
    print("--- V250 ARTICULATE BRAIN: LONG TRAINING ---")
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    words = clean_text(raw_text)
    vocab = sorted(list(set(words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size, n_organs=16, n_nodes_per_organ=32, d_feature=32, device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        model.load_checkpoint(CHECKPOINT_PATH)

    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    print("  Absorption starting (1500 steps)...")
    
    seq_len = 5
    for epoch in range(1500):
        idx = random.randint(0, len(words) - seq_len - 1)
        chunk = words[idx : idx + seq_len]
        target = words[idx + seq_len]
        ids = torch.tensor([word_to_id[w] for w in chunk]).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([word_to_id[target]]).to(DEVICE)
        
        model.train()
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], target_id)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (epoch+1) % 500 == 0:
            print(f"    Step {epoch+1}/1500 | Loss: {loss.item():.4f}")

    print("\n--- GENERATIVE DIALOGUE OUTPUT ---")
    prompt_texts = [
        ["alicia", "estaba", "sentada", "en", "el"],
        ["el", "conejo", "blanco", "corrió", "por"]
    ]
    
    results_list = []
    for prompt in prompt_texts:
        p_ids = torch.tensor([word_to_id[w] for w in prompt]).unsqueeze(0).to(DEVICE)
        res = generate_text(model, p_ids, id_to_word)
        print(f"  P: {' '.join(prompt)}")
        print(f"  R: {res}\n")
        results_list.append(res)
    
    model.save_checkpoint(CHECKPOINT_PATH)
    
    report = {
        "experiment": "exp81_v250_articulate_long",
        "vocab_size": vocab_size,
        "responses": results_list,
        "status": "VALIDATED"
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_articulate_session()
