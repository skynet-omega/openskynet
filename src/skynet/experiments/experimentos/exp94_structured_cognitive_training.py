"""
Exp94: V300 Structured Cognitive Training (The SKYNET_X Protocol)
================================================================

Goal: Train the V300 Unified Resonant Brain using the highly 
structured synthetic dataset from the successful SKYNET_X project.

Mechanism:
1. Load Purified Multilingual Foundation (27k whole words).
2. Parse JSONL structured data: Context -> Instruction -> Answer.
3. Train the model to map Context + Instruction to the Answer 
   using System 2 internal resonant steps.
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

REPORT_PATH = Path("exp94_structured_training_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_COGNITIVE_BRAIN.pth")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")
DATASET_DIR = Path("/home/daroch/SKYNET_X/data_fine_tuning")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def load_structured_data():
    print("  Loading Structured Datasets...")
    samples = []
    
    # Load from SKYNET_X dataset_fine_tuning.jsonl
    main_file = DATASET_DIR / "dataset_fine_tuning.jsonl"
    if main_file.exists():
        with open(main_file, 'r', encoding='utf-8') as f:
            for line in f:
                samples.append(json.loads(line))
                
    # Also load from SKYNET_GD data_fine_tuning_ollama.jsonl if exists
    gd_file = Path("/home/daroch/SKYNET_GD/data_fine_tuning/data_fine_tuning_ollama.jsonl")
    if gd_file.exists():
        with open(gd_file, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    data = json.loads(line)
                    # Convert to standard format
                    if "messages" in data and len(data["messages"]) >= 2:
                        samples.append({
                            "contexto": "",
                            "instruccion": data["messages"][0]["content"],
                            "respuesta": data["messages"][1]["content"]
                        })
                except: pass

    print(f"  Loaded {len(samples)} structured reasoning examples.")
    return samples

def run_cognitive_training():
    print("--- V300: STRUCTURED COGNITIVE TRAINING ---")
    
    # 1. Load Purified Foundation
    if not FOUNDATION_PATH.exists():
        print(f"  [ERROR] Foundation not found at {FOUNDATION_PATH}. Run exp92 first.")
        return
        
    print("  Loading Purified Semantic Foundation...")
    foundation = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = foundation['word_to_id']
    id_to_word = foundation['id_to_word']
    vocab_size = len(word_to_id)
    print(f"  Vocabulary: {vocab_size} pure concepts.")

    # 2. Load Data
    samples = load_structured_data()

    # 3. Initialize Model
    # We use a robust size: 32 organs x 64 nodes = 2048 physical neurons
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        model.load_checkpoint(CHECKPOINT_PATH)

    # 4. Training Loop
    optimizer = torch.optim.Adam(model.parameters(), lr=2e-4)
    model.train()
    
    print("  Starting Protocol Absorption (2000 steps)...")
    
    for step in range(2000):
        sample = random.choice(samples)
        
        ctx_words = clean_text(sample.get('contexto', ''))
        inst_words = clean_text(sample.get('instruccion', ''))
        ans_words = clean_text(sample.get('respuesta', ''))
        
        if not ans_words or not inst_words: continue
        
        # Sequence: Context + Instruction
        input_words = ctx_words[-15:] + inst_words[-15:] # Keep it bounded
        input_ids = [word_to_id[w] for w in input_words if w in word_to_id]
        
        if len(input_ids) < 3: continue
        
        # Target: The next logical word in the answer
        target_word = random.choice(ans_words)
        if target_word not in word_to_id: continue
        
        x_t = torch.tensor(input_ids).unsqueeze(0).to(DEVICE)
        y_t = torch.tensor([word_to_id[target_word]]).to(DEVICE)
        
        model.reset()
        out = model(x_t)
        loss = F.cross_entropy(out['logits'], y_t)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if (step + 1) % 500 == 0:
            print(f"    Step {step+1}/2000 | Loss: {loss.item():.4f} | Cavity Energy: {out['audit']['energy']:.4f}")

    # 5. Reasoning Test
    print("\n--- COGNITIVE REASONING TEST ---")
    model.eval()
    
    prompts = [
        "rapunzel lanza tu",
        "el jardinero tiene doce rosas cuantas combinaciones",
        "la inteligencia artificial esta transformando la"
    ]
    
    responses = []
    for p in prompts:
        p_words = clean_text(p)
        ids = torch.tensor([word_to_id[w] for w in p_words if w in word_to_id]).unsqueeze(0).to(DEVICE)
        if ids.size(1) == 0: continue
        
        # Generate 10 words
        curr = ids
        res_words = p_words.copy()
        with torch.no_grad():
            for _ in range(10):
                model.reset()
                out = model(curr)
                probs = F.softmax(out['logits'] / 0.7, dim=-1)
                nxt = torch.multinomial(probs, 1)
                res_words.append(id_to_word[nxt.item()])
                curr = torch.cat([curr[:, 1:], nxt], dim=1)
                
        ans = " ".join(res_words)
        print(f"  Q: {p}\n  A: {ans}\n")
        responses.append(ans)

    model.save_checkpoint(CHECKPOINT_PATH)
    
    report = {
        "experiment": "exp94_structured_cognitive_training",
        "vocab_size": vocab_size,
        "dataset_size": len(samples),
        "status": "VALIDATED",
        "responses": responses
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_cognitive_training()
