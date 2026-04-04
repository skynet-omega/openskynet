"""
Exp99: V300 Convergence Optimizer - High Entropy Recovery
=========================================================

Diagnosis from Audit:
V300 is stuck in a 'Probability Flatland' where high-frequency 
connectors like 'de' dominate the entire resonant field.

Aims:
1. Increase Learning Rate (3e-4 -> 1e-3) to break the 'de' attractor.
2. Diversity Penalty: Penalize the router if it selects the same organs too often.
3. Label Smoothing: Reduce overconfidence in connectors.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import time
import subprocess
from pathlib import Path
import sys
import os

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

REPORT_PATH = Path("exp99_optimizer_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_FINAL_BRAIN.pth")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")
LIBRARY_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/library_full.txt")
HERMES_ARROW = Path("/home/daroch/.cache/huggingface/datasets/Iker___open_hermes-2.5-spanish/default/0.0.0/b671e8e0335eb90087088df06d360e3dff59eab7/open_hermes-2.5-spanish-train-00000-of-00004.arrow")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    import re
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_optimizer_breakthrough():
    print("--- V300 OPTIMIZER BREAKTHROUGH: BREAKING THE 'DE' LOOP ---")
    
    foundation = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = foundation['word_to_id']
    id_to_word = foundation['id_to_word']
    vocab_size = len(word_to_id)

    lib_words = clean_text(LIBRARY_PATH.read_text(encoding='utf-8'))

    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size, n_organs=64, n_nodes_per_organ=64, d_feature=32, device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        model.load_checkpoint(CHECKPOINT_PATH)

    # HIGH LR to escape local minima
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    
    # Hermes Loader
    cmd = f"strings {HERMES_ARROW} | grep -E '^.{{40,500}}$' | head -n 100000"
    proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, text=True)
    
    start_time = time.time()
    steps = 5000 # Fast burst to check change
    
    for step in range(steps):
        if random.random() < 0.4:
            idx = random.randint(0, len(lib_words) - 11)
            chunk = [word_to_id.get(w, 0) for w in lib_words[idx:idx+10]]
            target = word_to_id.get(lib_words[idx+10], 0)
        else:
            line = proc.stdout.readline()
            if not line: break
            words = clean_text(line)
            if len(words) < 11: continue
            chunk = [word_to_id.get(w, 0) for w in words[:10]]
            target = word_to_id.get(words[10], 0)

        ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([target]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        
        # --- INNOVATION: Diversity Loss ---
        # Forces the brain to use more 'expensive' or 'rare' nodes
        logits = out['logits']
        loss_main = F.cross_entropy(logits, target_id, label_smoothing=0.1)
        
        # Diversity Penalty (Shannon Entropy of Logits)
        # We want to avoid collapsing to 1 word
        prob = F.softmax(logits, dim=-1)
        ent = -torch.sum(prob * torch.log(prob + 1e-6))
        
        total_loss = loss_main - (0.01 * ent) # Maximize entropy of output to avoid 'de' bias
        
        optimizer.zero_grad()
        total_loss.backward()
        optimizer.step()
        
        if (step+1) % 1000 == 0:
            print(f"    Step {step+1}/{steps} | Loss: {loss_main.item():.4f} | Entropy: {ent.item():.4f}")

    model.save_checkpoint(CHECKPOINT_PATH)
    proc.terminate()
    return {"status": "SUCCESS", "accuracy_impact": "check next audit"}

if __name__ == "__main__":
    run_optimizer_breakthrough()
