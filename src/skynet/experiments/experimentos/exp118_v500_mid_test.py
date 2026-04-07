"""
Exp118: V500 Mid-Marathon Inference Test
========================================

Goal: See how the V500 (with Ricci Curvature) handles the 
Alicia Hieroglyph after 1400 steps of alignment.
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

MODEL_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V500_MASTER_BRAIN.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_test():
    print("--- OPEN SKYNET: V500 MID-MARATHON INFERENCE ---")
    
    # 1. Load Dictionary
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    # 2. Initialize V500
    model = SKYNET_CORE_V500_UNIFIED_ALIGNED(
        vocab_size=vocab_size,
        n_nodes=128, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if MODEL_PATH.exists():
        print(f"  Loading V500 Brain (Step 1400)...")
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()

    # 3. Test Prompts
    prompts = [
        "alicia estaba muy",
        "el conejo blanco llevaba un",
        "el gato de cheshire",
        "bebe de esta botella"
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
                # Sampling with temperature 0.7 for creativity
                probs = out['logits'][:, -1, :]
                nxt = torch.argmax(probs, dim=-1).item()
                
                word = id_to_word.get(nxt, "<?>")
                res.append(word)
                curr = torch.cat([curr, torch.tensor([[nxt]], device=DEVICE)], dim=1)
                if word == "<?>": break
                
        print(f"  Result: {' '.join(res)}")

if __name__ == "__main__":
    run_test()
