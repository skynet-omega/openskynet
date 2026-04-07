"""
Exp88_V10: V402 Thermodynamic Resonance Empirical Overfit
=========================================================

Goal: To prove that the pure physics-based Thermodynamic Resonance (V402) 
can successfully memorize a single causal sequence. This proves that the 
architecture has the fundamental capacity to learn and map the holographic 
wave space without representation collapse.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
import time
from pathlib import Path
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V402_THERMODYNAMIC import SKYNET_CORE_V402_THERMODYNAMIC

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_overfit_test():
    print("--- OPEN SKYNET: V402 THERMODYNAMIC OVERFIT TEST ---")
    
    print(f"  Loading MiniLM Embeddings...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)

    # We use a single exact sentence to test memorization capacity
    # These words are confirmed to be whole tokens in the MiniLM vocab
    contexto = "el rey de la casa"
    instruccion = "alicia"
    respuesta = "que es una persona"
    
    prompt_text = f"{contexto} {instruccion} {respuesta}"
    words = clean_text(prompt_text)
    seq = [vocab_map[w] for w in words if w in vocab_map]
    
    surviving_words = [id_to_word[tid] for tid in seq]
    print(f"  Surviving Words (Target Sequence): {surviving_words}")
    print(f"  Target Sequence Length: {len(seq)} words.")

    model = SKYNET_CORE_V402_THERMODYNAMIC(
        vocab_size=vocab_size,
        n_organs=16, # Smaller model for rapid test
        n_nodes_per_organ=32, 
        d_feature=16,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    
    x_train = torch.tensor([seq[:-1]]).to(DEVICE)
    y_train = torch.tensor([seq[1:]]).to(DEVICE)

    print("\n  [TRAINING: 300 Steps on Single Sample]")
    model.train()
    for step in range(1, 301):
        model.reset()
        out = model(x_train)
        
        # CrossEntropy on Boltzmann Logits
        logits = out['logits'].view(-1, vocab_size)
        targets = y_train.view(-1)
        
        loss = F.cross_entropy(logits, targets)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 50 == 0:
            tau = out['audit']['tau']
            energy = out['audit']['energy']
            print(f"    Step {step} | Loss: {loss.item():.4f} | Temp(Tau): {tau:.4f} | Wave Energy: {energy:.4f}")

    print("\n  [INFERENCE: Autoregressive Memory Retrieval]")
    model.eval()
    with torch.no_grad():
        test_prompt = f"{contexto} {instruccion}"
        test_words = clean_text(test_prompt)
        test_seq = [vocab_map[w] for w in test_words if w in vocab_map]
        
        x_input = torch.tensor([test_seq]).to(DEVICE)
        generated_tokens = []
        
        # The expected answer has 4 words
        for _ in range(4):
            model.reset()
            out = model(x_input)
            
            # Greedy decode from Boltzmann logits
            last_logits = out['logits'][:, -1, :] 
            next_token_id = torch.argmax(last_logits, dim=-1).item()
            
            generated_tokens.append(next_token_id)
            next_token_tensor = torch.tensor([[next_token_id]]).to(DEVICE)
            x_input = torch.cat([x_input, next_token_tensor], dim=1)
            
        generated_words = [id_to_word.get(tid, "<UNK>") for tid in generated_tokens]
        print(f"  Expected: {clean_text(respuesta)}")
        print(f"  V402 Gen: {generated_words}")

if __name__ == "__main__":
    run_overfit_test()
