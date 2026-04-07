"""
Exp88_V27: V504 Pondering Test (Transitivity & Composition)
===========================================================

Goal: Prove that Latent Pondering (Internal Simulation Time) allows the 
model to solve logical composition and transitivity.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
import random
import re
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V504_PONDERING import SKYNET_CORE_V504_PONDERING

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def run_pondering_test():
    print("--- OPEN SKYNET: V504 LATENT PONDERING TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    def safe_word(w, fallback="alicia"):
        return w if w in vocab_map else fallback

    # --- 1. THE COMPLEX CURRICULUM ---
    math_data = [
        "uno más uno dos",
        "dos más uno tres",
        "tres más uno cuatro",
        "cuatro más uno cinco",
        "uno más dos tres",
        "dos más dos cuatro",
        "tres menos uno dos",
        "cuatro menos uno tres",
        "cinco menos uno cuatro",
        "cuatro menos dos dos"
    ]
    
    w_gato = safe_word("gato")
    w_perro = safe_word("perro")
    w_raton = safe_word("ratón")
    w_grande = safe_word("grande")
    w_pequeno = safe_word("pequeño", "menor")
    w_es = safe_word("es")
    w_que = safe_word("que")
    
    text_data = [
        f"{w_gato} {w_es} más {w_grande} {w_que} {w_raton}",
        f"{w_perro} {w_es} más {w_grande} {w_que} {w_gato}",
        f"{w_raton} {w_es} más {w_pequeno} {w_que} {w_gato}",
        f"{w_gato} {w_es} más {w_pequeno} {w_que} {w_perro}"
    ]
    
    training_data = math_data + text_data

    model = SKYNET_CORE_V504_PONDERING(
        vocab_size=len(vocab_map),
        n_organs=24, 
        ponder_steps=3, # 3 steps of internal thought
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print(f"\n  [TRAINING: Pondering Causal Domains (3 internal steps)]")
    model.train()
    for step in range(1, 201):
        total_loss = 0
        random.shuffle(training_data)
        for sentence in training_data:
            words = sentence.split()
            seq = [vocab_map[w] for w in words]
            x_train = torch.tensor([seq[:-1]]).to(DEVICE)
            y_train = torch.tensor([seq[1:]]).to(DEVICE)
            
            model.reset()
            out = model(x_train, training=True)
            loss = F.cross_entropy(out['logits'].view(-1, len(vocab_map)), y_train.view(-1))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if step % 100 == 0:
            print(f"    Step {step:3} | Loss: {total_loss/len(training_data):.4f}")

    # --- 2. COMPLEXITY TESTS ---
    model.eval()
    print("\n  [TEST 1: Mathematical Composition (Chaining)]")
    test_prompts_math = [
        "tres más dos",
        "cinco menos dos"
    ]
    
    with torch.no_grad():
        for prompt in test_prompts_math:
            words = prompt.split()
            seq = [vocab_map.get(w, 0) for w in words]
            x_input = torch.tensor([seq]).to(DEVICE)
            model.reset()
            out = model(x_input, training=False)
            
            probs = F.softmax(out['logits'][0, -1, :], dim=-1)
            top_v, top_i = torch.topk(probs, 3)
            
            print(f"  Prompt: '{prompt}'")
            for i in range(3):
                print(f"    {i+1}. {id_to_word[top_i[i].item()]:10} ({top_v[i].item():.4f})")

    print("\n  [TEST 2: Relational Transitivity]")
    test_prompts_text = [
        f"{w_perro} {w_es} más {w_grande} {w_que}",
        f"{w_raton} {w_es} más {w_pequeno} {w_que}"
    ]
    
    with torch.no_grad():
        for prompt in test_prompts_text:
            words = prompt.split()
            seq = [vocab_map.get(w, 0) for w in words]
            x_input = torch.tensor([seq]).to(DEVICE)
            model.reset()
            out = model(x_input, training=False)
            
            probs = F.softmax(out['logits'][0, -1, :], dim=-1)
            top_v, top_i = torch.topk(probs, 3)
            
            print(f"  Prompt: '{prompt}'")
            for i in range(3):
                print(f"    {i+1}. {id_to_word[top_i[i].item()]:10} ({top_v[i].item():.4f})")

if __name__ == "__main__":
    run_pondering_test()
