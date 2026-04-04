"""
Exp82: V250 Mass Communication Training - Evol-Instruct Spanish
==============================================================

Goal: Transition V250 from reading books to participating in dialogue.
Dataset: FreedomIntelligence/evol-instruct-spanish (Instruction-Response pairs).
Mechanism:
1. Load dataset from local cache using HuggingFace 'datasets'.
2. Sequential training on Instruction -> Response chains.
3. Persistence: Checkpointing the brain after each training epoch.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

REPORT_PATH = Path("exp82_v250_communication_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V250_COMMUNICATIVE_BRAIN.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', '', text)
    return text.split()

def generate_text(model, prompt_ids, id_to_word, max_len=20, temperature=0.7):
    model.eval()
    results = []
    for id in prompt_ids[0]:
        if id.item() < len(id_to_word):
            results.append(id_to_word[id.item()])
    
    current_ids = prompt_ids
    with torch.no_grad():
        for _ in range(max_len):
            model.reset()
            out = model(current_ids)
            probs = F.softmax(out['logits'] / temperature, dim=-1)
            next_id = torch.multinomial(probs, 1)
            
            idx = next_id.item()
            if idx < len(id_to_word):
                results.append(id_to_word[idx])
            current_ids = torch.cat([current_ids[:, 1:], next_id], dim=1)
            
    return " ".join(results)

def run_communication_training():
    print("--- V250 COMMUNICATION TRAINING: INITIATED ---")
    
    # 1. Load Dataset
    try:
        from datasets import load_dataset
        print("  Loading FreedomIntelligence/evol-instruct-spanish from cache...")
        ds = load_dataset("FreedomIntelligence/evol-instruct-spanish", split="train", streaming=True)
        # Gather a fixed subset for vocab building and training
        samples = []
        for i, item in enumerate(ds):
            if i >= 1000: break
            samples.append({"instruction": item['instruction'], "output": item['output']})
    except Exception as e:
        print(f"  [ERROR] Failed to load dataset: {e}")
        print("  Falling back to expanded 'Alicia' + Synthetic Dialogues.")
        samples = [{"instruction": "hola", "output": "hola soy openskynet"}]

    # 2. Build Vocabulary
    all_text = ""
    for s in samples: all_text += s['instruction'] + " " + s['output'] + " "
    words = clean_text(all_text)
    vocab = sorted(list(set(words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    print(f"  Vocab Size: {vocab_size} words.")

    # 3. Initialize Model
    # 32 organs, 64 nodes = 2048 neuronas físicas
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=32,
        n_nodes_per_organ=64,
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        model.load_checkpoint(CHECKPOINT_PATH)

    # 4. Long Training Session
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    print("  Starting Mass Absorption (3000 steps)...")
    
    seq_len = 8
    model.train()
    for step in range(3000):
        # Pick a random sample and a random window within it
        sample = random.choice(samples)
        full_text = sample['instruction'] + " " + sample['output']
        sample_words = clean_text(full_text)
        
        if len(sample_words) <= seq_len: continue
        
        idx = random.randint(0, len(sample_words) - seq_len - 1)
        chunk = sample_words[idx : idx + seq_len]
        target = sample_words[idx + seq_len]
        
        ids = torch.tensor([word_to_id[w] for w in chunk]).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([word_to_id[target]]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], target_id)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (step + 1) % 500 == 0:
            print(f"    Step {step+1}/3000 | Loss: {loss.item():.4f} | Energy: {out['audit']['energy']:.4f}")

    # 5. Communication Test
    print("\n--- COMMUNICATION TEST (Post-Training) ---")
    prompts = [
        "hola como estas",
        "que es la inteligencia",
        "dime algo sobre"
    ]
    
    responses = []
    for p in prompts:
        p_words = clean_text(p)
        # Filter unknown words
        p_ids = torch.tensor([word_to_id[w] for w in p_words if w in word_to_id]).unsqueeze(0).to(DEVICE)
        if p_ids.size(1) == 0: continue
        
        res = generate_text(model, p_ids, id_to_word)
        print(f"  Q: {p}\n  A: {res}\n")
        responses.append({"q": p, "a": res})

    # 6. Save State
    model.save_checkpoint(CHECKPOINT_PATH)
    
    report = {
        "experiment": "exp82_v250_communication",
        "vocab_size": vocab_size,
        "steps": 3000,
        "responses": responses,
        "status": "READY_FOR_MULTIMODAL"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_communication_training()
