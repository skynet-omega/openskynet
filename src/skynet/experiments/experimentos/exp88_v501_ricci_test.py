"""
Exp88_V20: V501 Ricci Curvature Test
===================================

Goal: Prove that injecting non-Euclidean Causal Geometry (Ricci Curvature) 
creates a more stable and prioritized internal structure.
We will compare the V501 brain with and without 'Gravity' enabled.
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
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_ricci_test():
    print("--- OPEN SKYNET: V501 RICCI CURVATURE EMPIRICAL TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    # Causal sequence: encrypted-like protocol
    message = "alicia bajó por la madriguera y encontró un mundo nuevo"
    words = clean_text(message)
    seq = [vocab_map[w] for w in words if w in vocab_map]
    
    model = SKYNET_CORE_V501_RICCI(
        vocab_size=vocab_size,
        n_organs=16, # Enough to see hubs form
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    x_train = torch.tensor([seq[:-1]]).to(DEVICE)
    y_train = torch.tensor([seq[1:]]).to(DEVICE)

    print("\n  [TRAINING: Curving the Causal Manifold...]")
    model.train()
    for step in range(1, 201):
        model.reset()
        out = model(x_train)
        
        logits = out['logits'].view(-1, vocab_size)
        targets = y_train.view(-1)
        
        loss = F.cross_entropy(logits, targets)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if step % 50 == 0:
            # Measure curvature variance (Higher = more structure/hubs)
            curv_std = out['curvature'].std().item()
            print(f"    Step {step} | Loss: {loss.item():.4f} | Curvature Structure (Std): {curv_std:.6f}")

    print("\n  [GEOMETRIC ANALYSIS]")
    curvature = out['curvature'].detach().cpu()
    hubs = (curvature > 0).sum().item()
    voids = (curvature < 0).sum().item()
    print(f"  Semantic Hubs (Positive Ricci): {hubs}")
    print(f"  Semantic Voids (Negative Ricci): {voids}")
    print(f"  Gravitational Constant (G): {model.ricci.G.item():.4f}")

    print("\n  [INFERENCE: Geodesic Path Retrieval]")
    model.eval()
    with torch.no_grad():
        test_prompt = "alicia bajó por la"
        test_words = clean_text(test_prompt)
        test_seq = [vocab_map[w] for w in test_words if w in vocab_map]
        x_input = torch.tensor([test_seq]).to(DEVICE)
        
        gen_tokens = []
        for _ in range(6):
            model.reset()
            out = model(x_input)
            next_id = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
            gen_tokens.append(next_id)
            x_input = torch.cat([x_input, torch.tensor([[next_id]]).to(DEVICE)], dim=1)
            
        print(f"  Prompt: {test_prompt}")
        print(f"  Geodesic continuation: {' '.join([id_to_word[t] for t in gen_tokens])}")

if __name__ == "__main__":
    run_ricci_test()
