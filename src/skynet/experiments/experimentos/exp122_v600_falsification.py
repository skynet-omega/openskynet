"""
Exp122: V600 Intention-Resonace Falsification Test
=================================================

Goal: Prove that the 'Intention' vector is a real physical force 
that can steer the brain's decryption of a protocol.

The Falsification Test:
1. Load a neutral prompt: "Alicia es una..."
2. Input Intent A: "Niña" (Should bias the field towards child-like concepts).
3. Input Intent B: "Reina" (Should bias the field towards royalty/power).
4. Measure the Resonance Shift: If the output changes predictably, 
   the 'Intention' is a falsifiable physical mechanism, not a collage.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
import re
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_falsification_test():
    print("--- OPEN SKYNET: V600 INTENTION FALSIFICATION TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=vocab_size,
        n_nodes=32, # Minimalist
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    # Minimal training to see if Intention has "Agency"
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    # Training Data: Just basic associations
    training_data = [
        ("alicia niña", "pequeña"),
        ("alicia reina", "poderosa")
    ]
    
    print("\n  [Sintonizando Intenciones...]")
    for step in range(1, 101):
        for intent, target in training_data:
            x = torch.tensor([[vocab_map.get(w, 0) for w in clean_text("alicia")]]).to(DEVICE)
            i = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(intent)]]).to(DEVICE)
            y = torch.tensor([[vocab_map.get(target, 0)]]).to(DEVICE)
            
            model.reset()
            out = model(x, intent_text=i)
            loss = F.cross_entropy(out.view(-1, vocab_size), y.view(-1))
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            
        if step % 50 == 0:
            print(f"    Step {step} | Sintonía (Loss): {loss.item():.4f}")

    print("\n  [FALSIFICATION: Divergent Intentions]")
    model.eval()
    prompt = "alicia"
    test_ids = torch.tensor([[vocab_map.get(prompt, 0)]]).to(DEVICE)
    
    intents = ["niña", "reina"]
    
    with torch.no_grad():
        for intent in intents:
            i_ids = torch.tensor([[vocab_map.get(intent, 0)]]).to(DEVICE)
            model.reset()
            out = model(test_ids, intent_text=i_ids)
            
            # See top predictions
            top_vals, top_ids = torch.topk(out[:, -1, :], 5)
            print(f"  Intent: '{intent}' -> Predictions: {[id_to_word[t.item()] for t in top_ids[0]]}")

if __name__ == "__main__":
    run_falsification_test()
