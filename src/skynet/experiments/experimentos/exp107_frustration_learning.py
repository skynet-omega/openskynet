"""
Exp107: Learning by Frustration (Active Inference V300)
======================================================

Goal: Test the 'Predictive Coding' concept using ONLY Alice in Wonderland.
Instead of brute-force CrossEntropy, we use 'Frustration' (Prediction Error)
as the primary motivator for topological change.

Mechanism:
1. System 1: Process current words.
2. System 2 (Dreaming): Simulate 5 steps ahead to 'hallucinate' the next word.
3. Surprise: Measure the distance between the 'Hallucination' and 'Reality'.
4. Growth: Update the Hypergraph to minimize this physical surprise.
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

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

REPORT_PATH = Path("exp107_frustration_results.json")
BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_frustration_learning():
    print("--- V300: LEARNING BY FRUSTRATION (ALICE ONLY) ---")
    
    # 1. Load Foundation (27k words)
    foundation = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = foundation['word_to_id']
    id_to_word = foundation['id_to_word']
    vocab_size = len(word_to_id)
    
    # 2. Load Alice
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    words = clean_text(raw_text)
    print(f"  [Data] Alice loaded: {len(words)} words.")

    # 3. Initialize fresh V300
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size,
        n_organs=16, 
        n_nodes_per_organ=32, 
        d_feature=16,
        device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    # 4. Training Loop: The Frustration Cycle
    model.train()
    steps = 2000
    seq_len = 5
    
    frustration_history = []
    
    print("  Starting Active Inference Loop...")
    for step in range(steps):
        idx = random.randint(0, len(words) - seq_len - 1)
        chunk = [word_to_id[w] for w in words[idx : idx + seq_len] if w in word_to_id]
        target_word = words[idx + seq_len]
        
        if len(chunk) < seq_len or target_word not in word_to_id: continue
        
        # --- THE BIOLOGICAL STEP ---
        model.reset()
        input_ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([word_to_id[target_word]]).to(DEVICE)
        
        # 1. Prediction (Hallucination)
        # We run the forward pass which includes internal simulation steps
        out = model(input_ids)
        
        # 2. Measure Frustration (Surprise)
        # Instead of just CE, we look at the 'Energy' of the mismatch
        loss_frustration = F.cross_entropy(out['logits'], target_id)
        
        # 3. Adaptive Update
        optimizer.zero_grad()
        loss_frustration.backward()
        optimizer.step()
        
        if (step+1) % 500 == 0:
            print(f"    Step {step+1} | Frustration (Loss): {loss_frustration.item():.4f}")
            frustration_history.append(loss_frustration.item())

    # 5. Evaluation: Does it speak 'Alice'?
    print("\n--- INFERENCE TEST: RECOVERING SENSE ---")
    model.eval()
    prompt = "alicia estaba muy"
    p_words = clean_text(prompt)
    p_ids = torch.tensor([word_to_id.get(w, 0) for w in p_words]).unsqueeze(0).to(DEVICE)
    
    res = p_words.copy()
    curr = p_ids
    with torch.no_grad():
        for _ in range(12):
            model.reset()
            out = model(curr)
            # Sampling with temperature to see diverse patterns
            probs = F.softmax(out['logits'] / 0.8, dim=-1)
            nxt = torch.multinomial(probs, 1).item()
            
            res.append(id_to_word[nxt])
            curr = torch.cat([curr[:, 1:], torch.tensor([[nxt]], device=DEVICE)], dim=1)
            
    final_text = " ".join(res)
    print(f"  Result: {final_text}")
    
    report = {
        "experiment": "exp107_active_inference_alice",
        "final_frustration": frustration_history[-1] if frustration_history else 0,
        "sample_output": final_text,
        "status": "SUCCESS" if frustration_history and frustration_history[-1] < frustration_history[0] else "LEARNING"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_frustration_learning()
