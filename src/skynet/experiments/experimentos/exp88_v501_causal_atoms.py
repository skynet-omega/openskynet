"""
Exp88_V22: V501 Causal Atoms (Stage 1: The Child's Curriculum)
=============================================================

Goal: Prove that V501 understands the "Causal Protocol" instead of just 
statistical adjacency.
We train on a few atoms of logic and test on a zero-shot causal transition.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
import re
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V501_RICCI import SKYNET_CORE_V501_RICCI

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return text.lower().split()

def run_causal_atoms_test():
    print("--- OPEN SKYNET: V501 CAUSAL ATOMS (UNDERSTANDING TEST) ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # --- 1. CURRICULUM: THE CAUSAL ATOMS ---
    # We teach the relationship [Condition] -> [Action]
    training_data = [
        "alicia tiene hambre alicia come",
        "alicia tiene sed alicia beber",
        "conejo tiene hambre conejo come",
        "conejo tiene sed conejo beber"
    ]
    
    # Verify all words exist in our whole-word dict
    for sentence in training_data:
        for w in sentence.split():
            if w not in vocab_map:
                print(f"  [ERROR] Word '{w}' not in dictionary. Please run build_dict again.")
                return

    model = SKYNET_CORE_V501_RICCI(
        vocab_size=len(vocab_map),
        n_organs=8, # Small brain for a child
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=2e-3)
    
    print("\n  [TRAINING: Stage 1 - Learning Causal Relations]")
    model.train()
    for step in range(1, 401):
        total_loss = 0
        for sentence in training_data:
            words = sentence.split()
            seq = [vocab_map[w] for w in words]
            x_train = torch.tensor([seq[:-1]]).to(DEVICE)
            y_train = torch.tensor([seq[1:]]).to(DEVICE)
            
            model.reset()
            out = model(x_train)
            loss = F.cross_entropy(out['logits'].view(-1, len(vocab_map)), y_train.view(-1))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if step % 100 == 0:
            print(f"    Step {step} | Total Logic Entropy: {total_loss/4:.4f}")

    # --- 2. ZERO-SHOT CAUSAL INFERENCE ---
    # We test with a subject the brain has never seen in this causal context
    print("\n  [TEST: Zero-Shot Causal Logic]")
    test_subject = "reina"
    if test_subject not in vocab_map:
        # Fallback to another word if 'reina' isn't there
        test_subject = "niña" 
        
    test_prompt = f"{test_subject} tiene sed"
    print(f"  Prompt: '{test_prompt}'")
    print(f"  Expected logic: '{test_subject} beber'")

    model.eval()
    with torch.no_grad():
        words = test_prompt.split()
        seq = [vocab_map[w] for w in words]
        x_input = torch.tensor([seq]).to(DEVICE)
        
        # Generation
        gen_tokens = []
        for _ in range(2):
            model.reset()
            out = model(x_input)
            next_id = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
            gen_tokens.append(next_id)
            x_input = torch.cat([x_input, torch.tensor([[next_id]]).to(DEVICE)], dim=1)
            
        print(f"  V501 Response: {' '.join([id_to_word[t] for t in gen_tokens])}")

    # --- 3. THE GEOMETRIC INSIGHT (Causal Curvature) ---
    print("\n  [AUTOPSY: Understanding the Protocol]")
    with torch.no_grad():
        # Compare internal states for 'hambre' vs 'sed'
        model.reset()
        h_hambre = model.cortex(model.input_norm(model.text_embed(torch.tensor([[vocab_map['hambre']]]).to(DEVICE))))
        model.reset()
        h_sed = model.cortex(model.input_norm(model.text_embed(torch.tensor([[vocab_map['sed']]]).to(DEVICE))))
        
        # How much does the Ricci Curvature shift between these two concepts?
        # (This represents the brain physically reconfiguring for a different law)
        dist = torch.norm(h_hambre - h_sed).item()
        print(f"  Causal State Distance (Hambre vs Sed): {dist:.4f}")
        
        # Check organ specialization for 'tiene'
        weights_tiene = torch.softmax(model.router(h_hambre), dim=-1)
        print(f"  Organ Routing for Causal Bridge ('tiene'): {[f'{w:.2f}' for w in weights_tiene[0,0].cpu().numpy()]}")

if __name__ == "__main__":
    run_causal_atoms_test()
