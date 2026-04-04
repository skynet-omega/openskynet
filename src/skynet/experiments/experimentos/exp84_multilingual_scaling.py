"""
Exp84: Multilingual Scaling & Catastrophic Forgetting Audit (V250+)
==================================================================

Goal: Verify if scaling the V250 core to 64/128 organs prevents 
forgetting when learning a second language (English) and a 
chat protocol.

Mechanism:
1. Baseline: Evaluate V250 on Alicia (Spanish).
2. Training: Train on English synthetic instructions.
3. Forgetting Test: Re-evaluate on Alicia (Spanish).
4. Scaling Fix: Increase Organs from 32 to 128 and repeat.
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

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

REPORT_PATH = Path("exp84_v250_multilingual_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V250_UNIVERSAL_BRAIN.pth")
BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def generate_english_chat_data(n_samples=500):
    samples = [
        ("hello how are you", "i am openskynet"),
        ("what is your name", "my name is openskynet"),
        ("who created you", "i was created by human research"),
        ("can you think", "i am a resonant hypergraph")
    ]
    data = []
    for _ in range(n_samples):
        q, a = random.choice(samples)
        data.append(q + " " + a)
    return data

def run_multilingual_audit():
    print("--- V250 MULTILINGUAL FORGETTING AUDIT ---")
    
    # 1. Load Spanish Vocab & Model
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    spanish_words = clean_text(raw_text)
    vocab = sorted(list(set(spanish_words)))
    
    # Add English tokens to vocab
    english_texts = generate_english_chat_data(100)
    for t in english_texts:
        vocab.extend(t.split())
    vocab = sorted(list(set(vocab)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    
    print(f"  Unified Multilingual Vocab: {vocab_size} words.")

    # 2. Test Phase 1: Spanish Baseline
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=32, # Current size
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        # Handle vocab mismatch for audit
        st = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
        model.load_state_dict(st, strict=False)
        print("  Checkpoint loaded (Partial match for Multilingual Vocab).")
    
    # Baseline accuracy on Spanish sequence prediction
    def get_acc(model, words, n=100):
        model.eval()
        correct = 0
        for _ in range(n):
            idx = random.randint(0, len(words) - 6)
            chunk = words[idx : idx + 5]
            target = words[idx + 5]
            ids = torch.tensor([word_to_id[w] for w in chunk]).unsqueeze(0).to(DEVICE)
            with torch.no_grad():
                model.reset()
                out = model(ids)
                if out['logits'].argmax(-1).item() == word_to_id[target]:
                    correct += 1
        return correct / n

    acc_es_initial = get_acc(model, spanish_words)
    print(f"  Initial Spanish Accuracy: {acc_es_initial:.4f}")

    # 3. Test Phase 2: Learning English
    print("  Learning English Chat Protocol (300 steps)...")
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    for _ in range(300):
        text = random.choice(english_texts)
        words = text.split()
        if len(words) < 6: continue
        idx = random.randint(0, len(words) - 6)
        ids = torch.tensor([word_to_id[w] for w in words[idx:idx+5]]).unsqueeze(0).to(DEVICE)
        target = torch.tensor([word_to_id[words[idx+5]]]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], target)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

    # 4. Test Phase 3: Forgetting Check
    acc_es_final = get_acc(model, spanish_words)
    print(f"  Final Spanish Accuracy: {acc_es_final:.4f}")
    
    forgetting = acc_es_initial - acc_es_final
    
    # 5. Scaling Recommendation
    needs_scaling = forgetting > 0.1
    
    report = {
        "experiment": "exp84_multilingual_forgetting",
        "spanish_initial": acc_es_initial,
        "spanish_after_english": acc_es_final,
        "forgetting_magnitude": forgetting,
        "status": "SCALING_REQUIRED" if needs_scaling else "STABLE",
        "recommendation": "Increase organs to 128" if needs_scaling else "Keep current size"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_multilingual_audit()
