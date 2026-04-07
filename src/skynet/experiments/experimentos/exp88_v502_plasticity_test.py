"""
Exp88_V24: V502 Plasticity & Anti-Babbling Test
==============================================

Goal: Prove that V502 can avoid the 'de de de' trap through Homeostatic 
Inhibition and learn concepts through Plastic Embeddings.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
import re
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V502_PLASTIC import SKYNET_CORE_V502_PLASTIC

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return text.lower().split()

def run_plasticity_test():
    print("--- OPEN SKYNET: V502 PLASTICITY & ANTI-BABBLING TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # We teach a very repetitive structure to force the 'babbling' trap
    training_data = [
        "el rey el rey el rey come",
        "la reina la reina la reina beber",
        "el conejo el conejo el conejo corre"
    ]
    
    model = SKYNET_CORE_V502_PLASTIC(
        vocab_size=len(vocab_map),
        n_organs=8, 
        pretrained_embeds=weights
    ).to(DEVICE)

    # Note: We use a higher learning rate for the manifold to see it move
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    initial_norm = model.concept_manifold.weight.norm().item()
    
    print(f"\n  [TRAINING: Carving the Plastic Manifold]")
    model.train()
    for step in range(1, 301):
        total_loss = 0
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
            print(f"    Step {step} | Logic Entropy: {total_loss/3:.4f} | Manifold Norm: {out['manifold_norm']:.2f}")

    final_norm = model.concept_manifold.weight.norm().item()
    print(f"\n  Manifold Evolution: {initial_norm:.2f} -> {final_norm:.2f} (Space has been carved)")

    # --- INFERENCE: Testing the Anti-Babbling (Fatigue) ---
    print("\n  [INFERENCE: Testing Homeostatic Inhibition]")
    test_prompt = "el rey"
    print(f"  Prompt: '{test_prompt}'")

    model.eval()
    with torch.no_grad():
        words = test_prompt.split()
        seq = [vocab_map[w] for w in words]
        x_input = torch.tensor([seq]).to(DEVICE)
        
        # We simulate autoregressive generation with FATIGUE update
        gen_tokens = []
        for _ in range(10):
            model.reset() # This resets temporary wave states
            # Important: Fatigue is NOT reset inside the loop, it accumulates
            out = model(x_input, training=False)
            
            next_id = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
            gen_tokens.append(next_id)
            
            # UPDATE FATIGUE: Tell the brain it just used this word
            model.update_fatigue([next_id])
            
            x_input = torch.cat([x_input, torch.tensor([[next_id]]).to(DEVICE)], dim=1)
            
        print(f"  V502 Response (With Fatigue): {' '.join([id_to_word[t] for t in gen_tokens])}")

if __name__ == "__main__":
    run_plasticity_test()
