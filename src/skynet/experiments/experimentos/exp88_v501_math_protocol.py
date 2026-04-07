"""
Exp88_V23: V501 Mathematical Protocol Discovery (Successor Test)
================================================================

Goal: Prove that V501 is a generalist relational engine.
Instead of Alicia's story, we teach it a mathematical protocol: Increment (+1).
We test if the brain can generalize the 'Logic of Succession' to a new 
number pair it hasn't seen during the training phase.
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

def run_math_protocol_test():
    print("--- OPEN SKYNET: V501 MATHEMATICAL PROTOCOL DISCOVERY ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # --- 1. THE PROTOCOL: INCREMENT (+1) ---
    # We teach the operation: [Number] más uno -> [Successor]
    # Training set stops at 'ocho'
    training_data = [
        "uno más uno dos",
        "dos más uno tres",
        "tres más uno cuatro",
        "cuatro más uno cinco",
        "cinco más uno seis",
        "seis más uno siete",
        "siete más uno ocho"
    ]
    
    model = SKYNET_CORE_V501_RICCI(
        vocab_size=len(vocab_map),
        n_organs=8, 
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=2e-3)
    
    print("\n  [TRAINING: Decrypting the Mathematical Successor Protocol]")
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
            out = model(x_train)
            loss = F.cross_entropy(out['logits'].view(-1, len(vocab_map)), y_train.view(-1))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if step % 100 == 0:
            print(f"    Step {step} | Protocol Entropy: {total_loss/len(training_data):.4f}")

    # --- 2. ZERO-SHOT GENERALIZATION TEST ---
    print("\n  [TEST: Zero-Shot Mathematical Generalization]")
    # We ask for the successor of 'ocho', which it never saw in an addition context
    test_prompt = "ocho más uno"
    print(f"  Prompt: '{test_prompt}'")
    print(f"  Expected Result: 'nueve'")

    model.eval()
    with torch.no_grad():
        words = test_prompt.split()
        seq = [vocab_map[w] for w in words]
        x_input = torch.tensor([seq]).to(DEVICE)
        
        model.reset()
        out = model(x_input)
        
        # Get probabilities for the next word
        last_logits = out['logits'][0, -1, :]
        probs = F.softmax(last_logits, dim=-1)
        
        top_k = 5
        top_v, top_i = torch.topk(probs, top_k)
        
        print(f"  V501 Top Candidates for the Result:")
        for i in range(top_k):
            word = id_to_word[top_i[i].item()]
            val = top_v[i].item()
            print(f"    {i+1}. {word:10} | Confidence: {val:.4f}")

    # --- 3. GEOMETRIC ANALYSIS OF THE OPERATOR ---
    print("\n  [INSIGHT: The 'Gravity' of the Operator 'más']")
    with torch.no_grad():
        # Let's see how the internal state changes when 'más' enters the scene
        h_uno = model.input_norm(model.text_embed(torch.tensor([[vocab_map['uno']]]).to(DEVICE)))
        h_mas = model.input_norm(model.text_embed(torch.tensor([[vocab_map['más']]]).to(DEVICE)))
        
        # Does the word 'más' trigger a specific organ to curve the space?
        routing_uno = torch.softmax(model.router(h_uno), dim=-1)[0,0]
        routing_mas = torch.softmax(model.router(h_mas), dim=-1)[0,0]
        
        print(f"  Organ activation for 'uno' : {[f'{w:.2f}' for w in routing_uno.cpu().numpy()]}")
        print(f"  Organ activation for 'más' : {[f'{w:.2f}' for w in routing_mas.cpu().numpy()]}")
        
        # A successful mathematical brain should shift organs when the operator is detected
        shift = torch.norm(routing_uno - routing_mas).item()
        print(f"  Relational Shift (Operator detection): {shift:.4f}")

if __name__ == "__main__":
    import random
    run_math_protocol_test()
