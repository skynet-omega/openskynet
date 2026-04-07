"""
Exp88_V26: V503 Scalability & Complexity Test
=============================================

Goal: Test the scalability of the V503 Catalytic Resonance architecture.
We move beyond simple "atoms" of knowledge to complex, chained causal logic 
in both Mathematics and Textual Relational Logic (Kinship/Properties).

Curriculum:
1. Complex Math: Chained operations (X más Y menos Z)
2. Relational Text: Transitive properties (A es mayor que B, B es mayor que C -> A es mayor que C)
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
from SKYNET_CORE_V503_CATALYTIC import SKYNET_CORE_V503_CATALYTIC

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def run_scalability_test():
    print("--- OPEN SKYNET: V503 SCALABILITY & COMPLEXITY TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # We need to ensure words exist in the dictionary.
    # If a word is missing, we substitute with an existing one to keep testing the architecture logic.
    def safe_word(w, fallback="alicia"):
        return w if w in vocab_map else fallback

    # --- 1. THE COMPLEX CURRICULUM ---
    # We mix Math and Text Logic to see if the brain can handle diverse causal domains simultaneously.
    
    # Math: We teach basic sums and subs, and expect it to handle a chain or a new combination
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
    
    # Relational Text: Transitive logic and property binding
    # Let's use words we know are in Alice's dictionary: 'gato', 'perro', 'ratón', 'grande', 'pequeño'
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
    
    # Verify words
    for sentence in training_data:
        for w in sentence.split():
            if w not in vocab_map:
                print(f"  [ERROR] Word '{w}' not in dictionary.")
                return

    # Increase brain size slightly for complex data
    model = SKYNET_CORE_V503_CATALYTIC(
        vocab_size=len(vocab_map),
        n_organs=24, # More organs for parallel processing of math and text
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print(f"\n  [TRAINING: Complex Causal Domains (Math & Relational Logic)]")
    model.train()
    for step in range(1, 801):
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
            avg_valence = out['valence_map'].mean().item()
            print(f"    Step {step:3} | Loss: {total_loss/len(training_data):.4f} | Avg Catalyst Valence: {avg_valence:.4f}")

    # --- 2. COMPLEXITY TESTS ---
    model.eval()
    print("\n  [TEST 1: Mathematical Composition (Chaining)]")
    # It has seen "tres más uno" and "cuatro menos dos". 
    # Can it do "tres más dos"? (Requires combining concepts of 3, +, 2 -> 5)
    test_prompts_math = [
        "tres más dos",
        "cinco menos dos"
    ]
    
    with torch.no_grad():
        for prompt in test_prompts_math:
            words = prompt.split()
            seq = [vocab_map.get(w, 0) for w in words]
            if 0 in seq: continue
            
            x_input = torch.tensor([seq]).to(DEVICE)
            model.reset()
            out = model(x_input, training=False)
            
            probs = F.softmax(out['logits'][0, -1, :], dim=-1)
            top_v, top_i = torch.topk(probs, 3)
            
            print(f"  Prompt: '{prompt}'")
            for i in range(3):
                print(f"    {i+1}. {id_to_word[top_i[i].item()]:10} ({top_v[i].item():.4f})")


    print("\n  [TEST 2: Relational Transitivity]")
    # It learned: Perro > Gato, Gato > Raton.
    # Let's ask: "perro es más grande que..." (Expected: gato or raton)
    # Let's ask: "ratón es más pequeño que..." (Expected: gato or perro)
    test_prompts_text = [
        f"{w_perro} {w_es} más {w_grande} {w_que}",
        f"{w_raton} {w_es} más {w_pequeno} {w_que}"
    ]
    
    with torch.no_grad():
        for prompt in test_prompts_text:
            words = prompt.split()
            seq = [vocab_map.get(w, 0) for w in words]
            if 0 in seq: continue
            
            x_input = torch.tensor([seq]).to(DEVICE)
            model.reset()
            out = model(x_input, training=False)
            
            probs = F.softmax(out['logits'][0, -1, :], dim=-1)
            top_v, top_i = torch.topk(probs, 3)
            
            print(f"  Prompt: '{prompt}'")
            for i in range(3):
                print(f"    {i+1}. {id_to_word[top_i[i].item()]:10} ({top_v[i].item():.4f})")

if __name__ == "__main__":
    run_scalability_test()
