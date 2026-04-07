"""
Exp88_V18: V500 Protocol Discovery (Empirical Test)
==================================================

Goal: Prove that the V500 can "decrypt" the causal protocol of a message.
We will measure the "Protocol Map" (Causal Links) that form between organs 
as it learns.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import re
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V500_DECRYPTER import SKYNET_CORE_V500_DECRYPTER

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_protocol_test():
    print("--- OPEN SKYNET: V500 PROTOCOL DISCOVERY TEST ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    # The "Encrypted" message (Causal sequence)
    message = "alicia vio un conejo blanco con un reloj y corrió tras el conejo"
    words = clean_text(message)
    seq = [vocab_map[w] for w in words if w in vocab_map]
    
    model = SKYNET_CORE_V500_DECRYPTER(
        vocab_size=vocab_size,
        n_organs=8, # Small number of organs to see the protocol map clearly
        d_model=weights.shape[1],
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    x_train = torch.tensor([seq[:-1]]).to(DEVICE)
    y_train = torch.tensor([seq[1:]]).to(DEVICE)

    print("\n  [DECRYPTING PROTOCOL...]")
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
            print(f"    Step {step} | Protocol Entropy (Loss): {loss.item():.4f}")

    print("\n  [RECONSTRUCTING CAUSAL LINKS]")
    # The Protocol Map shows which organs learned to 'trigger' others 
    # to maintain the causal flow.
    protocol_map = out['protocol_map'].detach().cpu()
    
    # Analyze the strength of the hidden protocol
    strength = protocol_map.abs().mean().item()
    print(f"  Hidden Protocol Strength: {strength:.6f}")
    
    print("\n  [INFERENCE: Decrypted Message]")
    model.eval()
    with torch.no_grad():
        test_prompt = "alicia vio un conejo"
        test_words = clean_text(test_prompt)
        test_seq = [vocab_map[w] for w in test_words if w in vocab_map]
        x_input = torch.tensor([test_seq]).to(DEVICE)
        
        gen_tokens = []
        for _ in range(8):
            model.reset()
            out = model(x_input)
            next_id = torch.argmax(out['logits'][:, -1, :], dim=-1).item()
            gen_tokens.append(next_id)
            x_input = torch.cat([x_input, torch.tensor([[next_id]]).to(DEVICE)], dim=1)
            
        print(f"  Prompt: {test_prompt}")
        print(f"  Decrypted continuation: {[id_to_word[t] for t in gen_tokens]}")

if __name__ == "__main__":
    run_protocol_test()
