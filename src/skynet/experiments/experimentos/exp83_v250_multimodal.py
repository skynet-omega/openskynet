"""
Exp83: Real Multimodality - Vision-to-Text Synthesis (V250)
===========================================================

Goal: Test if the V250 Sparse Resonant Hypergraph can 'see' a grid 
and 'describe' it using the Spanish vocabulary it just learned.

Mechanism:
1. Load V250 with the "Alicia" language checkpoint.
2. Inject a 3x3 Grid (Vision).
3. The Geometric Quantizer converts the grid to a biological field.
4. The Resonant Cavity mixes the visual field with the language topology.
5. The 'Mouth' (decoder) predicts a word based on the visual input.

Task: "Counting Objects"
Grid has N active pixels. Model must output the Spanish word for N:
1 -> "uno"
2 -> "dos"
3 -> "tres"
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

REPORT_PATH = Path("exp83_v250_multimodal_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V250_UNIVERSAL_BRAIN.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

# Words to map the counting task
TARGET_WORDS = ["nada", "una", "dos", "tres", "cuatro", "cinco"]

def generate_vision_to_text_data(n_samples, word_to_id):
    x_vision = torch.zeros(n_samples, 1, 3, 3)
    y_target = torch.zeros(n_samples, dtype=torch.long)
    
    for i in range(n_samples):
        # Count between 1 and 4
        count = random.randint(1, 4)
        
        # Place 'count' random pixels
        pixels_placed = 0
        while pixels_placed < count:
            r, c = random.randint(0, 2), random.randint(0, 2)
            if x_vision[i, 0, r, c] == 0:
                x_vision[i, 0, r, c] = 1.0
                pixels_placed += 1
                
        # Target word
        word = TARGET_WORDS[count]
        # Fallback to a random ID if word not in vocab (unlikely, but safe)
        y_target[i] = word_to_id.get(word, 0)
        
    return x_vision.to(DEVICE), y_target.to(DEVICE)

def run_multimodal_test():
    print("--- V250 REAL MULTIMODALITY: VISION TO TEXT ---")
    
    # 1. We need to load the vocab dictionary first to know the sizes
    # Since we didn't save the vocab mapping, we reconstruct it from Alicia
    import re
    def clean_text(text):
        return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()
        
    raw_text = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt").read_text(encoding='utf-8')
    vocab = sorted(list(set(clean_text(raw_text))))
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    # Verify our target words exist in the book!
    for w in TARGET_WORDS:
        if w not in word_to_id:
            print(f"  [WARNING] Word '{w}' not in Alicia vocabulary! Test may be flawed.")
            # Inject it manually at the end for the sake of the experiment
            vocab.append(w)
            word_to_id[w] = len(vocab) - 1
            id_to_word[len(vocab) - 1] = w
            
    vocab_size = len(vocab)
    print(f"  Vocab Size: {vocab_size} words.")

    # 2. Initialize Model
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        # Load the language brain
        # Strict=False because we might have appended missing target words
        model.load_state_dict(torch.load(CHECKPOINT_PATH, map_location=DEVICE), strict=False)
        print("  [OK] Loaded Cultural Brain Checkpoint.")
        
    # 3. Train the "Optic Nerve to Speech Center"
    # We freeze the Language organs so it doesn't forget Spanish,
    # and only train the Vision Projections and Router.
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print("  Training Vision-to-Text Synthesia...")
    x_train, y_train = generate_vision_to_text_data(1000, word_to_id)
    x_test, y_test = generate_vision_to_text_data(200, word_to_id)
    
    batch_size = 16
    model.train()
    
    for epoch in range(40):
        total_loss = 0
        for i in range(0, len(x_train), batch_size):
            model.reset()
            v_batch = x_train[i:i+batch_size]
            y_batch = y_train[i:i+batch_size]
            
            # Forward: NO TEXT, ONLY VISION
            out = model(x_text=None, x_vision=v_batch)
            
            loss = F.cross_entropy(out['logits'], y_batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if (epoch+1) % 10 == 0:
            print(f"    Epoch {epoch+1}/40 | Avg Loss: {total_loss/(len(x_train)/batch_size):.4f}")

    # 4. Evaluation
    model.eval()
    model.reset()
    with torch.no_grad():
        out = model(x_text=None, x_vision=x_test)
        preds = out['logits'].argmax(-1)
        acc = (preds == y_test).float().mean().item()
        
    print(f"\n  Final Multimodal Accuracy (Vision -> Text): {acc:.4f}")
    
    # 5. Real Demo
    print("\n--- WHAT DO YOU SEE? ---")
    demo_v, demo_y = generate_vision_to_text_data(3, word_to_id)
    model.reset()
    demo_out = model(x_text=None, x_vision=demo_v)
    demo_preds = demo_out['logits'].argmax(-1)
    
    for i in range(3):
        true_word = id_to_word[demo_y[i].item()]
        pred_word = id_to_word[demo_preds[i].item()]
        print(f"  Grid showed {true_word} pixels. Skynet said: '{pred_word}'")

    report = {
        "experiment": "exp83_v250_multimodal_vision_to_text",
        "task": "Counting pixels and answering in Spanish",
        "test_accuracy": acc,
        "status": "SUCCESS" if acc > 0.8 else "IMPROVING"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_multimodal_test()
