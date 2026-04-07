"""
Exp88_V25: V503 Catalytic Resonance Test
========================================

Goal: Prove that V503 can distinguish between different context catalysts
(Addition vs Subtraction) and avoid the frequency-based babbling trap.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
import re
import random
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V503_CATALYTIC import SKYNET_CORE_V503_CATALYTIC

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def run_catalytic_test():
    print("--- OPEN SKYNET: V503 CATALYTIC RESONANCE TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # --- 1. THE CURRICULUM: TWO COMPETING PROTOCOLS ---
    # Addition protocol: X más uno -> Y
    # Subtraction protocol: X mas uno -> Z (We use 'mas' without accent as a different operator)
    # Actually, let's use 'menos' if it exists.
    has_menos = 'menos' in vocab_map
    op_sum = 'más'
    op_sub = 'menos' if has_menos else 'mas'
    
    training_data = [
        f"uno {op_sum} uno dos",
        f"dos {op_sum} uno tres",
        f"tres {op_sum} uno cuatro",
        f"cuatro {op_sum} uno cinco",
        f"cuatro {op_sub} uno tres",
        f"tres {op_sub} uno dos",
        f"dos {op_sub} uno uno"
    ]
    
    model = SKYNET_CORE_V503_CATALYTIC(
        vocab_size=len(vocab_map),
        n_organs=16, 
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print(f"\n  [TRAINING: Learning with Catalysts ({op_sum} vs {op_sub})]")
    model.train()
    for step in range(1, 501):
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
            print(f"    Step {step} | Loss: {total_loss/len(training_data):.4f} | Avg Catalyst Valence: {avg_valence:.4f}")

    # --- 2. THE CATALYTIC SHIFT TEST ---
    print("\n  [TEST: Zero-Shot Catalytic Context Switching]")
    # We ask for "tres [OP] uno". 
    # If the catalyst works, the operator will 'warp' the organs to predict differently.
    
    for op in [op_sum, op_sub]:
        test_prompt = f"tres {op} uno"
        print(f"  Prompt: '{test_prompt}'")
        
        model.eval()
        with torch.no_grad():
            words = test_prompt.split()
            seq = [vocab_map[w] for w in words]
            x_input = torch.tensor([seq]).to(DEVICE)
            
            model.reset()
            out = model(x_input, training=False)
            
            probs = F.softmax(out['logits'][0, -1, :], dim=-1)
            top_word = id_to_word[torch.argmax(probs).item()]
            
            # Extract valence of the operator
            # Words: ['tres', 'op', 'uno'] -> Indices: [0, 1, 2]
            op_valence = out['valence_map'][0, 1, 0].item()
            
            print(f"    V503 Result: {top_word} | Operator Valence: {op_valence:.4f}")

if __name__ == "__main__":
    run_catalytic_test()
