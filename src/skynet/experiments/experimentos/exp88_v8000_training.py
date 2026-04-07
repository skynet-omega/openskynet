"""
Exp88_V28: V8000 True Physical Cyborg Test
==========================================

Goal: Test the refactored V8000 SINGULARITY architecture that returns to the 
roots of the Physical Cyborg (Discrete Cortex + Continuous Biphasic Organ) 
using Whole-Word concepts.

We test if the true physical crystallization of states allows zero-shot 
relational logic (generalization) instead of just statistical pattern matching.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
import random
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V8000_SINGULARITY import SKYNET_CORE_V8000_SINGULARITY

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return text.lower().split()

def run_v8000_test():
    print("--- OPEN SKYNET: V8000 TRUE PHYSICAL CYBORG TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # We teach the relationship [Condition] -> [Action]
    training_data = [
        "alicia tiene hambre alicia come",
        "alicia tiene sed alicia beber",
        "conejo tiene hambre conejo come",
        "conejo tiene sed conejo beber"
    ]
    
    model = SKYNET_CORE_V8000_SINGULARITY(
        vocab_size=len(vocab_map),
        d_model=384,
        cortex_dim=128,
        organ_dim=256,
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print("\n  [TRAINING: Physical Crystallization]")
    model.train()
    
    import time
    start_time = time.time()
    
    for step in range(1, 401):
        total_loss = 0
        random.shuffle(training_data)
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
            
        if step % 50 == 0:
            temp = out['temperature']
            print(f"    Step {step:3} | Total Logic Entropy: {total_loss/4:.4f} | Temp(T): {temp:.4f}")

    elapsed = time.time() - start_time
    print(f"\n  [PERFORMANCE] Training 400 steps took {elapsed:.2f} seconds.")

    print("\n  [TEST: Zero-Shot Causal Logic]")
    test_subject = "reina"
    if test_subject not in vocab_map: test_subject = "niña"
        
    test_prompt = f"{test_subject} tiene sed"
    print(f"  Prompt: '{test_prompt}'")
    print(f"  Expected logic: '{test_subject} beber'")

    model.eval()
    with torch.no_grad():
        words = test_prompt.split()
        seq = [vocab_map[w] for w in words]
        x_input = torch.tensor([seq]).to(DEVICE)
        
        gen_tokens = []
        model.reset()
        
        # Feed prompt sequentially to build physical state
        for t in range(x_input.shape[1]):
            out = model(x_input[:, t:t+1])
            
        # Autoregressive generation
        next_id = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
        gen_tokens.append(next_id)
        
        out = model(torch.tensor([[next_id]]).to(DEVICE))
        next_id2 = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
        gen_tokens.append(next_id2)
            
        print(f"  V8000 Response: {' '.join([id_to_word[t] for t in gen_tokens])}")

if __name__ == "__main__":
    run_v8000_test()
