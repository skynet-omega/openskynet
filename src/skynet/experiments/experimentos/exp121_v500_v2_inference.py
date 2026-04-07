"""
Exp121: V500 V2 Final Inference Test (Master Brain)
==================================================

Testing the V500 Brain after 2000 steps of Master Alignment 
with Ricci Curvature and Anti-Black Hole Inhibition.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import sys
import os
from pathlib import Path

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V500_UNIFIED_ALIGNED import SKYNET_CORE_V500_UNIFIED_ALIGNED

MODEL_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V500_MASTER_BRAIN_V2.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_test():
    print("--- OPEN SKYNET: V500 V2 FINAL INFERENCE ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    model = SKYNET_CORE_V500_UNIFIED_ALIGNED(
        vocab_size=vocab_size,
        n_nodes=128, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if MODEL_PATH.exists():
        print(f"  Loading V500 V2 Master Brain...")
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()

    prompts = [
        "alicia estaba muy",
        "el conejo blanco",
        "qué hora es",
        "el sombrerero loco"
    ]

    for prompt in prompts:
        print(f"\n  Prompt: '{prompt}'")
        words = clean_text(prompt)
        p_ids = torch.tensor([vocab_map.get(w, 0) for w in words]).unsqueeze(0).to(DEVICE)
        
        res = words.copy()
        curr = p_ids
        
        with torch.no_grad():
            for _ in range(8):
                model.reset()
                out = model(curr, training=False)
                # Greedy search for the "Geodesic Path"
                nxt = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
                word = id_to_word.get(nxt, "<?>")
                res.append(word)
                curr = torch.cat([curr, torch.tensor([[nxt]], device=DEVICE)], dim=1)
                
        print(f"  Result: {' '.join(res)}")

if __name__ == "__main__":
    run_test()
