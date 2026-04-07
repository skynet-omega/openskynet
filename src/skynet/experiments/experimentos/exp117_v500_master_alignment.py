"""
Exp117: V500 Master Alignment (The Final Unification)
====================================================

Goal: Train the V500 core using the 'Minimization of Frustration' protocol.
We treat the Alice dataset as an encrypted 'Hieroglyph' and the 
SKYNET CORE V500 as the physical aligner.

Physics:
1. Input Pressure: The text 'pushes' against the Hypergraph nodes.
2. Wave Resonance: The Lenia-engines find the resonant frequencies.
3. Substrate Alignment: The Wolfram-substrate redistributes energy.
4. Loss = CrossEntropy (Accuracy) + Frustration (Physical Coherence).
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
from SKYNET_CORE_V500_UNIFIED_ALIGNED import SKYNET_CORE_V500_UNIFIED_ALIGNED

# Configuration
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V500_MASTER_BRAIN.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DATA_LIBROS = Path("/home/daroch/.openskynet/workspace/alicia_libros.json")
REPORT_PATH = Path("exp117_v500_alignment_status.json")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BATCH_SIZE = 16
SEQ_LEN = 32

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def load_data(vocab_map):
    print("  Loading Alicia Hieroglyph...")
    tokens = []
    if DATA_LIBROS.exists():
        with open(DATA_LIBROS, 'r') as f:
            data = json.load(f)
        for text in data.get('textos', []):
            words = clean_text(text)
            tokens.extend([vocab_map[w] for w in words if w in vocab_map])
    print(f"  Data loaded: {len(tokens)} words of encrypted history.")
    return tokens

def get_batch(tokens):
    x_batch = []
    y_batch = []
    for _ in range(BATCH_SIZE):
        idx = random.randint(0, len(tokens) - SEQ_LEN - 1)
        chunk = tokens[idx:idx + SEQ_LEN + 1]
        x_batch.append(chunk[:-1])
        y_batch.append(chunk[1:])
    return torch.tensor(x_batch).to(DEVICE), torch.tensor(y_batch).to(DEVICE)

def run_alignment():
    print("--- OPEN SKYNET: V500 MASTER ALIGNMENT ---")
    
    # 1. Load Whole-Word Map
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)
    print(f"  Vocab Size: {vocab_size} concepts to align.")

    tokens = load_data(vocab_map)

    # 2. Initialize V500
    model = SKYNET_CORE_V500_UNIFIED_ALIGNED(
        vocab_size=vocab_size,
        n_nodes=128, # Compact but efficient
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print("  Resuming from V500 checkpoint...")
        model.load_state_dict(torch.load(CHECKPOINT_PATH))

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    model.train()
    
    start_time = time.time()
    steps = 5000
    
    print("\n  Starting Physical Alignment Protocol...")
    for step in range(steps):
        x, y = get_batch(tokens)
        
        model.reset()
        out = model(x, training=True)
        
        # Physics-Informed Loss
        # 1. Semantic Error (CrossEntropy)
        logits = out['logits'].view(-1, vocab_size)
        targets = y.view(-1)
        loss_semantic = F.cross_entropy(logits, targets, ignore_index=0)
        
        # 2. Structural Frustration (Wave mismatch)
        loss_frustration = out['frustration']
        
        # The Aligner's Objective: Minimize semantic error while keeping 
        # the internal physics coherent (low frustration).
        total_loss = loss_semantic + 0.1 * loss_frustration
        
        optimizer.zero_grad()
        total_loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if (step+1) % 100 == 0:
            elapsed = (time.time() - start_time) / 60
            tau = out['audit']['tau']
            print(f"  Step {step+1} | {elapsed:.1f}m | Loss: {loss_semantic.item():.4f} | Frustration: {loss_frustration.item():.6f} | Tau: {tau:.4f}")
            
            status = {
                "step": step+1,
                "elapsed_minutes": elapsed,
                "loss": loss_semantic.item(),
                "frustration": loss_frustration.item(),
                "tau": tau
            }
            REPORT_PATH.write_text(json.dumps(status, indent=2))
            
            if (step+1) % 500 == 0:
                model.save_brain(CHECKPOINT_PATH)

    print(f"\n--- V500 ALIGNMENT COMPLETE ---")
    model.save_brain(CHECKPOINT_PATH)

if __name__ == "__main__":
    run_alignment()
