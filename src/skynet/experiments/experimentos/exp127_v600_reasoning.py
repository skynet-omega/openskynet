"""
Exp127: V600 LTS - Intersubjective Reasoning Test
================================================

Goal: Test if the V600 can switch between "Story Mode" and "QA Mode" 
using only the 'Intention' force. 
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import sys
import os
import time
import random
from pathlib import Path

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

LONG_STORY = """
Había una vez un viejo faro que vivía en una isla de roca fría. 
El guardián del faro se llamaba Tomás y tenía una barba blanca muy larga. 
Un martes una estrella pequeña cayó del cielo y aterrizó suavemente sobre la arena de la playa. 
La estrella estaba triste porque había perdido su luz.
"""

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_reasoning_test():
    print("--- V600 LTS: INTERSUBJECTIVE REASONING ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)
    
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=vocab_size,
        n_nodes=128, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    model.embed.weight.data = weights.clone()
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    sentences = [clean_text(s) for s in LONG_STORY.strip().split('.') if s.strip()]
    
    # 1. Training with Two Intents
    print("\n  [TRAINING] Sintonizando Historia y Diálogo...")
    for step in range(1, 401):
        model.train()
        total_loss = 0
        
        # Intent A: Narrative
        intent_n = torch.tensor([[vocab_map.get("historia", 0)]]).to(DEVICE)
        for seq in sentences:
            if len(seq) < 2: continue
            model.reset()
            x = torch.tensor([[vocab_map.get(w, 0) for w in seq[:-1]]]).to(DEVICE)
            y = torch.tensor([[vocab_map.get(w, 0) for w in seq[1:]]]).to(DEVICE)
            out = model(x, intent_text=intent_n)
            loss = F.cross_entropy(out.view(-1, vocab_size), y.view(-1))
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            total_loss += loss.item()
            
        # Intent B: Dialogue (Explicit associations)
        intent_d = torch.tensor([[vocab_map.get("diálogo", 0)]]).to(DEVICE)
        # Using words that are DEFINITELY in the vocab (based on Alicia books)
        qa_pairs = [
            ("quién es alicia", "niña"), 
            ("qué vio alicia", "conejo"),
            ("dónde cayó alicia", "madriguera")
        ]
        for q, a in qa_pairs:
            model.reset()
            x = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(q)]]).to(DEVICE)
            y = torch.tensor([vocab_map.get(a, 0)]).to(DEVICE)
            out = model(x, intent_text=intent_d)
            loss = F.cross_entropy(out[:, -1, :], y)
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            total_loss += loss.item()

        if step % 100 == 0:
            print(f"    Paso {step} | Loss: {total_loss:.4f}")

    # 2. Reasoning Test
    print("\n--- TEST DE SINTONÍA ---")
    model.eval()
    
    test_queries = [
        "quién es alicia",
        "qué vio alicia",
        "dónde cayó alicia"
    ]
    
    for test_q in test_queries:
        x = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(test_q)]]).to(DEVICE)
        for intent_name in ["historia", "diálogo"]:
            model.reset()
            i_id = torch.tensor([[vocab_map.get(intent_name, 0)]]).to(DEVICE)
            with torch.no_grad():
                out = model(x, intent_text=i_id)
                pred = id_to_word.get(torch.argmax(out[0, -1, :]).item())
                print(f"  P: '{test_q:20}' | Intento: '{intent_name:8}' -> R: '{pred}'")

if __name__ == "__main__":
    run_reasoning_test()
