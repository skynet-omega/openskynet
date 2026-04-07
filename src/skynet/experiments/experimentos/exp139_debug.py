"""
Exp139: V600 Brain Debug - Seeing the Nodes
==========================================
"""
import torch
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../EX'))
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def debug():
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    model = SKYNET_CORE_V600_RESONANT(len(vocab_map)).to(DEVICE)
    
    test_word = "alicia"
    x = torch.tensor([[vocab_map[test_word]]]).to(DEVICE)
    
    model.reset()
    out = model(x)
    
    print(f"Output shape: {out.shape}")
    print(f"Output mean: {out.mean().item():.4f}")
    print(f"Output std: {out.std().item():.4f}")
    
    top_v, top_i = torch.topk(out[0, -1, :], 5)
    print(f"Top predictions for '{test_word}': {[id_to_word[i.item()] for i in top_i]}")

if __name__ == "__main__":
    debug()
