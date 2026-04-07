"""
Exp125: V600 Level 4 with Dynamic Embedding Evolution
====================================================

Goal: Train the V600 on a continuous causal narrative.
Critically, we will track the *Dynamic Embeddings* (as Gonzalo pointed out,
meanings change over time as the child experiences the world). We will measure 
how the meaning of "conejo" and "reloj" shift in the latent space as the story is absorbed.

The Narrative:
1. "alicia vio un conejo"
2. "el conejo tenía un reloj"
3. "alicia corrió tras el conejo"
4. "y cayó por la madriguera"
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

class DynamicNarrativeTrainer:
    def __init__(self, model, vocab_map, optimizer):
        self.model = model
        self.vocab_map = vocab_map
        self.id_to_word = {v: k for k, v in vocab_map.items()}
        self.optimizer = optimizer
        self.vocab_size = len(vocab_map)

    def train_story(self, story_steps):
        self.model.train()
        total_loss = 0
        self.model.reset()
        self.optimizer.zero_grad()
        
        for i, (ctx, target, intent) in enumerate(story_steps):
            x_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(ctx)]]).to(DEVICE)
            i_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(intent)]]).to(DEVICE)
            y_id = torch.tensor([self.vocab_map.get(target, 0)]).to(DEVICE)
            
            # Forward pass without resetting state to maintain the "Soliton of Meaning"
            out = self.model(x_ids, intent_text=i_ids)
            
            loss = F.cross_entropy(out[:, -1, :], y_id)
            
            # Retain graph for continuity, backpropagate step-by-step
            is_last = (i == len(story_steps) - 1)
            loss.backward(retain_graph=not is_last)
            total_loss += loss.item()
            
        self.optimizer.step()
        return total_loss / len(story_steps)

    def test_story(self, story_steps):
        self.model.eval()
        self.model.reset()
        print("\n  [LEVEL 4] Evaluando Geodésica Narrativa:")
        
        for ctx, target, intent in story_steps:
            x_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(ctx)]]).to(DEVICE)
            i_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(intent)]]).to(DEVICE)
            
            with torch.no_grad():
                out = self.model(x_ids, intent_text=i_ids)
                pred_id = torch.argmax(out[:, -1, :], dim=-1).item()
                pred_word = self.id_to_word.get(pred_id, "<?>")
                
                print(f"    - In: '{ctx}' | Intent: '{intent}' -> Out: '{pred_word}' (Target: {target})")

def run_level4_dynamic():
    print("--- V600 LEVEL 4: DYNAMIC EMBEDDINGS & NARRATIVE ---", flush=True)
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=len(vocab_map),
        n_nodes=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    # Initialize with pretrained weights, but ENSURE they are explicitly learning
    model.embed.weight.data = weights.clone()
    model.embed.weight.requires_grad = True
    
    # Track original embedding of key words to measure "Vivencia" (Experience shift)
    target_words = ["conejo", "reloj", "madriguera"]
    original_embeds = {w: model.embed.weight[vocab_map[w]].detach().clone() for w in target_words if w in vocab_map}
    
    optimizer = torch.optim.Adam(model.parameters(), lr=2e-3)
    trainer = DynamicNarrativeTrainer(model, vocab_map, optimizer)

    story = [
        ("alicia vio un conejo", "blanco", "descripción"),
        ("el conejo tenía un", "reloj", "objeto"),
        ("alicia corrió tras el", "conejo", "acción"),
        ("y cayó por la", "madriguera", "lugar")
    ]

    print("\n  [TRAINING] Asimilando la historia (Embeddings Mutables)...", flush=True)
    for step in range(1, 301):
        loss = trainer.train_story(story)
        if step % 50 == 0:
            # Measure how much the embeddings have changed (L2 distance from original)
            shifts = []
            for w in target_words:
                if w in vocab_map:
                    curr_emb = model.embed.weight[vocab_map[w]].detach()
                    shift = torch.norm(curr_emb - original_embeds[w]).item()
                    shifts.append(f"{w}: +{shift:.3f}")
            
            print(f"    Step {step} | Loss: {loss:.4f} | Evolución Semántica: {', '.join(shifts)}", flush=True)

    trainer.test_story(story)

    print("\n--- CONCLUSIÓN FÍSICA ---", flush=True)
    print("  El texto es un puente, pero el 'significado' es fluido.")
    print("  Como viste en 'Evolución Semántica', las palabras clave")
    print("  alteraron permanentemente su masa/embedding debido a la")
    print("  experiencia de la historia, tal como aprende un niño.", flush=True)

if __name__ == "__main__":
    run_level4_dynamic()
