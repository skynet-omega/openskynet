"""
Exp124: V600 Level 4 - Causal Narrative Continuity
=================================================

Goal: Test if the V600 can maintain a "Soliton of Meaning" across 
multiple sentences filled with common "Black Hole" words (el, un, de, la).

The Narrative:
1. "alicia vio un conejo blanco"
2. "el conejo tenía un reloj"
3. "alicia corrió tras el conejo"
4. "y cayó por la madriguera"

Challenge: Can the model predict "reloj" after "el conejo tenía un" 
without getting stuck in a "un un un" loop?
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

class NarrativeTrainer:
    def __init__(self, model, vocab_map, optimizer):
        self.model = model
        self.vocab_map = vocab_map
        self.id_to_word = {v: k for k, v in vocab_map.items()}
        self.optimizer = optimizer
        self.vocab_size = len(vocab_map)

    def train_story(self, story_steps):
        """
        Trains a sequence of transitions that form a story.
        story_steps: List of (context_phrase, target_word, intent)
        """
        self.model.train()
        total_loss = 0
        
        # Reset the "Brain" state at the start of the story
        self.model.reset()
        self.optimizer.zero_grad()
        
        for i, (ctx, target, intent) in enumerate(story_steps):
            x_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(ctx)]]).to(DEVICE)
            i_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(intent)]]).to(DEVICE)
            y_id = torch.tensor([self.vocab_map.get(target, 0)]).to(DEVICE)
            
            # Note: We do NOT reset state between sentences to keep the Soliton alive!
            out = self.model(x_ids, intent_text=i_ids)
            
            # Predict the next word after the full phrase
            loss = F.cross_entropy(out[:, -1, :], y_id)
            
            # Use retain_graph=True to allow state continuity between sentences
            # except for the last step
            is_last = (i == len(story_steps) - 1)
            loss.backward(retain_graph=not is_last)
            
            total_loss += loss.item()
            
        self.optimizer.step()
        return total_loss / len(story_steps)

    def test_story(self, story_steps):
        self.model.eval()
        self.model.reset()
        print("\n  [LEVEL 4] Testing Narrative Geodesic:")
        
        for ctx, target, intent in story_steps:
            x_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(ctx)]]).to(DEVICE)
            i_ids = torch.tensor([[self.vocab_map.get(w, 0) for w in clean_text(intent)]]).to(DEVICE)
            
            with torch.no_grad():
                out = self.model(x_ids, intent_text=i_ids)
                pred_id = torch.argmax(out[:, -1, :], dim=-1).item()
                pred_word = self.id_to_word.get(pred_id, "<?>")
                
                print(f"    - Input: '{ctx}' | Intent: '{intent}'")
                print(f"      Result: '{pred_word}' {'✅' if pred_word == target else '❌ (expected: ' + target + ')'}")

def run_level4():
    print("--- OPEN SKYNET: V600 LEVEL 4 - NARRATIVE CONTINUITY ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=len(vocab_map),
        n_nodes=128, # Larger brain for narrative
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    trainer = NarrativeTrainer(model, vocab_map, optimizer)

    # The "Hieroglyph" of the story
    story = [
        ("alicia vio un conejo", "blanco", "descripción"),
        ("el conejo tenía un", "reloj", "objeto"),
        ("alicia corrió tras el", "conejo", "acción"),
        ("y cayó por la", "madriguera", "lugar")
    ]

    print(f"\n  [TRAINING] Absorbing the Causal Soliton (500 steps)...")
    for step in range(1, 501):
        loss = trainer.train_story(story)
        if step % 100 == 0:
            print(f"    Step {step} | Narrative Frustration (Loss): {loss:.4f}")

    trainer.test_story(story)

    print("\n--- LEVEL 4 SUMMARY ---")
    print("  Si el modelo respondió 'reloj' y 'madriguera' correctamente,")
    print("  significa que la 'Sintonía de Intención' logró vencer la")
    print("  gravedad de las palabras comunes ('el', 'un', 'y').")

if __name__ == "__main__":
    run_level4()
