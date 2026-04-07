"""
Exp88_V14: V402 Whole-Word Training & Inference (Empirical Test)
================================================================

Goal: Train the V402 Thermodynamic Brain (The Boltzmann Brain) using 
the new WHOLE-WORD dictionary on a single complex causal sentence, 
and then perform autoregressive inference to see if it generates 
coherent words or just noise.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import re
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V402_THERMODYNAMIC import SKYNET_CORE_V402_THERMODYNAMIC

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_test():
    print("--- OPEN SKYNET: V402 WHOLE-WORD EMPIRICAL TEST ---")
    
    print(f"  Loading Whole-Word Dictionary...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    # A causal sentence from Alice
    contexto = "alicia pensó que como el conejo tenía un reloj debía tener mucha prisa"
    instruccion = "quién tenía prisa"
    respuesta = "el conejo blanco"
    
    prompt_text = f"{contexto} {instruccion} {respuesta}"
    words = clean_text(prompt_text)
    seq = [vocab_map[w] for w in words if w in vocab_map]
    
    surviving_words = [id_to_word[tid] for tid in seq]
    print(f"  Training Sequence ({len(seq)} words): {surviving_words}")

    # Build the Brain
    model = SKYNET_CORE_V402_THERMODYNAMIC(
        vocab_size=vocab_size,
        n_organs=16, 
        n_nodes_per_organ=32, 
        d_feature=16,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    x_train = torch.tensor([seq[:-1]]).to(DEVICE)
    y_train = torch.tensor([seq[1:]]).to(DEVICE)

    print("\n  [TRAINING: 300 Steps on Single Causal Sample]")
    model.train()
    for step in range(1, 301):
        model.reset()
        out = model(x_train)
        
        logits = out['logits'].view(-1, vocab_size)
        targets = y_train.view(-1)
        
        # CrossEntropy over Boltzmann distributions forces thermodynamic cooling
        loss = F.cross_entropy(logits, targets)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 50 == 0:
            tau = out['audit']['tau']
            energy = out['audit']['energy']
            print(f"    Step {step} | Loss: {loss.item():.4f} | Temp(Tau): {tau:.4f} | Avg Wave Energy: {energy:.4f}")

    print("\n  [INFERENCE: Autoregressive Retrieval]")
    model.eval()
    with torch.no_grad():
        test_prompt = f"{contexto} {instruccion}"
        test_words = clean_text(test_prompt)
        test_seq = [vocab_map[w] for w in test_words if w in vocab_map]
        
        x_input = torch.tensor([test_seq]).to(DEVICE)
        generated_tokens = []
        
        # We expect 3 words for the answer
        for _ in range(3):
            model.reset()
            # We don't get logits during inference, we get the probabilities 
            # from the normalized resonance
            out = model(x_input, get_logits=True)
            
            last_logits = out['logits'][:, -1, :] 
            
            # The token is simply the one with highest resonance / lowest temperature
            next_token_id = torch.argmax(last_logits, dim=-1).item()
            
            generated_tokens.append(next_token_id)
            
            next_token_tensor = torch.tensor([[next_token_id]]).to(DEVICE)
            x_input = torch.cat([x_input, next_token_tensor], dim=1)
            
        generated_words = [id_to_word.get(tid, "<UNK>") for tid in generated_tokens]
        print(f"  Expected: {clean_text(respuesta)}")
        print(f"  V402 Gen: {generated_words}")

if __name__ == "__main__":
    run_test()
