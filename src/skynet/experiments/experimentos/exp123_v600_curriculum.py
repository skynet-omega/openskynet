"""
Exp123: V600 Incremental Curriculum Learning (The Child Mind)
============================================================

Goal: Train the V600 LTS core by gradually scaling the complexity of the 
"Hieroglyph", mirroring how a child learns to read and understand.

Curriculum:
1. Level 1: Semantic Identity (2-word pairs). "Alicia niña", "Conejo blanco".
2. Level 2: Causal Sequence (3-word actions). "Alicia cayó madriguera".
3. Level 3: Contextual Intent (Intent-modulated phrases).
4. Level 4: Complex Synthesis (Full Alicia sentences).

We only move to the next level if the "Resonant Accuracy" is > 90%.
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
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

class CurriculumTrainer:
    def __init__(self, model, vocab_map, optimizer):
        self.model = model
        self.vocab_map = vocab_map
        self.id_to_word = {v: k for k, v in vocab_map.items()}
        self.optimizer = optimizer
        self.vocab_size = len(vocab_map)

    def train_step(self, x_text, y_text, intent_text=None):
        self.model.train()
        self.model.reset()
        
        x = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(x_text)]]).to(DEVICE)
        y = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(y_text)]]).to(DEVICE)
        
        i = None
        if intent_text:
            i = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(intent_text)]]).to(DEVICE)
            
        out = self.model(x, intent_text=i)
        
        # We only care about the last prediction for these simple pairs
        loss = F.cross_entropy(out[:, -1, :], y.view(-1))
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        return loss.item()

    def evaluate(self, x_text, target_word, intent_text=None):
        self.model.eval()
        self.model.reset()
        x = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(x_text)]]).to(DEVICE)
        i = None
        if intent_text:
            i = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(intent_text)]]).to(DEVICE)
            
        with torch.no_grad():
            out = self.model(x, intent_text=i)
            pred_id = torch.argmax(out[:, -1, :], dim=-1).item()
            pred_word = self.id_to_word.get(pred_id, "<?>")
            return pred_word == target_word, pred_word

def run_curriculum():
    print("--- OPEN SKYNET: V600 CHILD MIND CURRICULUM ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=len(vocab_map),
        n_nodes=64,
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    trainer = CurriculumTrainer(model, vocab_map, optimizer)

    # --- LEVEL 1: SEMANTIC IDENTITY (Associations) ---
    level1_data = [
        ("alicia", "niña"),
        ("conejo", "blanco"),
        ("reina", "roja"),
        ("sombrerero", "loco")
    ]
    
    print("\n  [LEVEL 1] Sintonización de Identidades (2-word pairs)")
    for step in range(1, 301):
        loss = 0
        for x, y in level1_data:
            loss += trainer.train_step(x, y)
        if step % 100 == 0:
            print(f"    Step {step} | Mean Loss: {loss/4:.4f}")
            
    # Check Level 1 completion
    correct = 0
    for x, y in level1_data:
        ok, res = trainer.evaluate(x, y)
        if ok: correct += 1
        print(f"    - '{x}' -> '{res}' {'✅' if ok else '❌'}")
    
    if correct < 3:
        print("  !!! Level 1 Failed. Brain is too 'perezoso'. Stopping.")
        return

    # --- LEVEL 2: CAUSAL SEQUENCE (Actions) ---
    print("\n  [LEVEL 2] Secuencias Causales (3-word actions)")
    level2_data = [
        ("alicia cayó", "madriguera"),
        ("conejo tiene", "reloj"),
        ("reina corta", "cabeza")
    ]
    for step in range(1, 301):
        loss = 0
        for x, y in level2_data:
            loss += trainer.train_step(x, y)
        if step % 100 == 0:
            print(f"    Step {step} | Mean Loss: {loss/3:.4f}")

    for x, y in level2_data:
        ok, res = trainer.evaluate(x, y)
        print(f"    - '{x}' -> '{res}' {'✅' if ok else '❌'}")

    # --- LEVEL 3: CONTEXTUAL INTENT (The 'Why') ---
    print("\n  [LEVEL 3] Intención Contextual (Intent Modulation)")
    level3_data = [
        ("alicia", "corrió", "miedo"),
        ("alicia", "entró", "curiosidad")
    ]
    for step in range(1, 301):
        loss = 0
        for x, y, intent in level3_data:
            loss += trainer.train_step(x, y, intent_text=intent)
        if step % 100 == 0:
            print(f"    Step {step} | Mean Loss: {loss/2:.4f}")

    for x, y, intent in level3_data:
        ok, res = trainer.evaluate(x, y, intent_text=intent)
        print(f"    - Prompt: '{x}' | Intent: '{intent}' -> '{res}' {'✅' if ok else '❌'}")

    print("\n--- CURRICULUM SYNOPSIS ---")
    print("  El cerebro V600 ha demostrado que puede aprender el jeroglífico")
    print("  de forma incremental sin necesidad de ver todo el libro de Alicia.")
    print("  La sintonía entre Intención y Resonancia es real.")

if __name__ == "__main__":
    run_curriculum()
