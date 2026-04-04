"""
Exp84: Multilingual Chat Protocol & Catastrophic Forgetting Audit
=================================================================

Goal: Train V250 on a bilingual chat protocol (Spanish & English) 
and verify if it suffers from Catastrophic Forgetting of its 
literary foundation (Alicia).

Mechanism:
1. Vocabulary: Pre-allocate a unified vocabulary for Book + Chat.
2. Phase 1 (Foundation): Train on Spanish Literature (Alicia).
3. Phase 2 (New Skill): Train on Bilingual Chat Protocol.
4. Audit: Re-evaluate Spanish Literature to measure forgetting.
5. Capacity Check: Determine if the Hypergraph topology saturated.
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

REPORT_PATH = Path("exp84_multilingual_chat_results.json")
BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def generate_bilingual_chat():
    """
    Simulates high-quality instruction datasets like OpenHermes/Ultrachat.
    Includes Spanish and English structural dialogues.
    """
    chat_pairs = [
        # Spanish Chat
        ("hola como estas", "soy openskynet estoy listo para ayudarte"),
        ("cual es tu proposito", "mi proposito es aprender y razonar"),
        ("dime un chiste", "por que las matematicas son tristes porque tienen muchos problemas"),
        ("traduce esto al ingles el cerebro es liquido", "the brain is liquid"),
        # English Chat
        ("hello how are you", "i am openskynet i am ready to help"),
        ("what is your purpose", "my purpose is to learn and reason"),
        ("tell me a joke", "why was the math book sad because it had too many problems"),
        ("translate this to spanish the brain is liquid", "el cerebro es liquido")
    ]
    data = []
    for _ in range(500): # Generate 500 samples
        q, a = random.choice(chat_pairs)
        data.append(q + " " + a)
    return data

def run_multilingual_chat_audit():
    print("--- V250 MULTILINGUAL CHAT & FORGETTING AUDIT ---")
    
    # 1. Load Datasets
    raw_alicia = BOOK_PATH.read_text(encoding='utf-8')
    alicia_words = clean_text(raw_alicia)[:5000] # Use a 5k slice for fast auditing
    
    chat_texts = generate_bilingual_chat()
    chat_words = []
    for t in chat_texts:
        chat_words.extend(clean_text(t))
        
    # 2. Unified Vocabulary
    all_words = alicia_words + chat_words
    vocab = sorted(list(set(all_words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    
    print(f"  Unified Vocab Size: {vocab_size} words (Bilingual + Lit).")

    # 3. Initialize V250
    # We use 16 organs x 64 nodes = 1024 nodes
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=16, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    # Helper function for evaluation
    def evaluate_text(model, words_list, seq_len=5, n_tests=100):
        model.eval()
        correct = 0
        with torch.no_grad():
            for _ in range(n_tests):
                idx = random.randint(0, len(words_list) - seq_len - 1)
                chunk = words_list[idx : idx + seq_len]
                target = words_list[idx + seq_len]
                ids = torch.tensor([word_to_id[w] for w in chunk]).unsqueeze(0).to(DEVICE)
                
                model.reset()
                out = model(x_text=ids)
                pred = out['logits'].argmax(-1).item()
                if pred == word_to_id[target]:
                    correct += 1
        return correct / n_tests

    # --- PHASE 1: Foundation (Alicia) ---
    print("\n  Phase 1: Training Foundation (Alicia - Spanish)...")
    model.train()
    for step in range(500):
        idx = random.randint(0, len(alicia_words) - 6)
        chunk = alicia_words[idx : idx + 5]
        target = alicia_words[idx + 5]
        
        ids = torch.tensor([word_to_id[w] for w in chunk]).unsqueeze(0).to(DEVICE)
        tgt = torch.tensor([word_to_id[target]]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], tgt)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
    acc_alicia_initial = evaluate_text(model, alicia_words)
    print(f"    Alicia Initial Accuracy: {acc_alicia_initial:.4f}")

    # --- PHASE 2: New Skill (Bilingual Chat) ---
    print("\n  Phase 2: Training New Skill (Bilingual Chat Protocol)...")
    model.train()
    for step in range(500):
        idx = random.randint(0, len(chat_words) - 6)
        chunk = chat_words[idx : idx + 5]
        target = chat_words[idx + 5]
        
        ids = torch.tensor([word_to_id[w] for w in chunk]).unsqueeze(0).to(DEVICE)
        tgt = torch.tensor([word_to_id[target]]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], tgt)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
    acc_chat_final = evaluate_text(model, chat_words)
    print(f"    Chat Protocol Accuracy: {acc_chat_final:.4f}")

    # --- PHASE 3: Forgetting Audit ---
    print("\n  Phase 3: Catastrophic Forgetting Audit...")
    acc_alicia_final = evaluate_text(model, alicia_words)
    print(f"    Alicia Final Accuracy: {acc_alicia_final:.4f}")
    
    forgetting = acc_alicia_initial - acc_alicia_final
    print(f"    Forgetting Magnitude: {forgetting:.4f}")
    
    # Capacity Audit
    topology_density = model.A_phys.mean().item() if model.A_phys is not None else 0.0
    
    status = "STABLE"
    recommendation = "Capacity is sufficient."
    if forgetting > 0.15:
        status = "FORGETTING_DETECTED"
        recommendation = "Network size is too small. Increase n_organs to 64 or d_feature to 64."
    elif topology_density > 0.8:
        status = "CAPACITY_SATURATED"
        recommendation = "Graph is too dense. Enhance Dirichlet Gating or increase n_nodes."

    report = {
        "experiment": "exp84_multilingual_chat_audit",
        "unified_vocab_size": vocab_size,
        "metrics": {
            "alicia_initial_acc": acc_alicia_initial,
            "chat_learned_acc": acc_chat_final,
            "alicia_retained_acc": acc_alicia_final,
            "forgetting_magnitude": forgetting,
            "topology_density_final": topology_density
        },
        "status": status,
        "recommendation": recommendation
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_multilingual_chat_audit()
