"""
Exp85: The High-Fantasy & Instruction Synthesis (V250+)
======================================================

Goal: Train V250 on a massive corpus combining 'Lord of the Rings' 
narrative and 'OpenHermes' instructions to achieve natural, clear 
communication.

Data Sources:
1. OpenHermes Spanish (Extracted from .arrow cache via string parsing).
2. Lord of the Rings (Excerpts/Knowledge distilled from local LLM).
3. English/Spanish Multilingual mix.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
import requests
import subprocess
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V250_SPARSE_RESONANT import SKYNET_CORE_V250_SPARSE_RESONANT

REPORT_PATH = Path("exp85_high_fantasy_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V250_GENERALIST_BRAIN.pth")
ARROW_PATH = Path("/home/daroch/.cache/huggingface/datasets/Iker___open_hermes-2.5-spanish/default/0.0.0/b671e8e0335eb90087088df06d360e3dff59eab7/open_hermes-2.5-spanish-train-00000-of-00004.arrow")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def extract_openhermes_strings(n_lines=5000):
    print("  [Data] Extracting strings from OpenHermes Arrow cache...")
    try:
        cmd = f"strings {ARROW_PATH} | grep -E '^.{{30,300}}$' | head -n {n_lines}"
        result = subprocess.check_output(cmd, shell=True, text=True)
        lines = result.splitlines()
        print(f"  [Data] Extracted {len(lines)} lines from Arrow.")
        return lines
    except Exception as e:
        print(f"  [Data] Error extracting strings: {e}")
        return ["Hola, ¿cómo puedo ayudarte hoy?", "El razonamiento es la clave del AGI."]

def get_lotr_excerpts_from_ollama(model_name="gemma4:e4b"):
    print("  [Data] Distilling Lord of the Rings knowledge from Ollama...")
    prompt = """
    Escribe un resumen detallado de 1000 palabras de 'El Señor de los Anillos', 
    mezclando español e inglés, centrándote en los personajes y la geografía 
    de la Tierra Media.
    """
    try:
        response = requests.post("http://localhost:11434/api/generate", 
                                 json={"model": model_name, "prompt": prompt, "stream": False})
        return response.json().get("response", "")
    except Exception as e:
        print(f"  [Data] Ollama error: {e}")
        return "Frodo Bolsón lleva el anillo único al Monte del Destino en Mordor."

def generate_text(model, prompt_ids, id_to_word, max_len=30, temperature=0.7):
    model.eval()
    results = [id_to_word.get(id.item(), "[UNK]") for id in prompt_ids[0]]
    current_ids = prompt_ids
    with torch.no_grad():
        for _ in range(max_len):
            model.reset()
            out = model(current_ids)
            probs = F.softmax(out['logits'] / temperature, dim=-1)
            next_id = torch.multinomial(probs, 1)
            results.append(id_to_word.get(next_id.item(), "[UNK]"))
            current_ids = torch.cat([current_ids[:, 1:], next_id], dim=1)
    return " ".join(results)

def run_experiment():
    print("--- V250+ HIGH FANTASY & INSTRUCTION TRAINING ---")
    
    # 1. Gather Data
    hermes_lines = extract_openhermes_strings(3000)
    lotr_text = get_lotr_excerpts_from_ollama()
    
    all_raw_text = " ".join(hermes_lines) + " " + lotr_text
    all_words = clean_text(all_raw_text)
    vocab = sorted(list(set(all_words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    print(f"  Final Combined Vocab: {vocab_size} words.")

    # 2. Initialize Model (Larger Colony for better resolution)
    # 64 organs x 64 nodes = 4096 physical neurons
    model = SKYNET_CORE_V250_SPARSE_RESONANT(
        vocab_size=vocab_size,
        n_organs=64, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print("  Loading existing generalist brain...")
        try:
            st = torch.load(CHECKPOINT_PATH, map_location=DEVICE)
            model.load_state_dict(st, strict=False)
        except: pass

    # 3. Training Session
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    model.train()
    print("  Absorption phase (3000 steps)...")
    
    seq_len = 8
    for step in range(3000):
        # Mix lottery: 70% Hermes, 30% LOTR
        if random.random() < 0.7:
            line = random.choice(hermes_lines)
            chunk_words = clean_text(line)
        else:
            idx = random.randint(0, len(all_words) - seq_len - 1)
            chunk_words = all_words[idx : idx + seq_len + 1]
            
        if len(chunk_words) <= seq_len: continue
        
        idx_start = random.randint(0, len(chunk_words) - seq_len - 1)
        chunk = chunk_words[idx_start : idx_start + seq_len]
        target = chunk_words[idx_start + seq_len]
        
        ids = torch.tensor([word_to_id[w] for w in chunk]).unsqueeze(0).to(DEVICE)
        target_id = torch.tensor([word_to_id[target]]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], target_id)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (step+1) % 1000 == 0:
            print(f"    Step {step+1}/3000 | Loss: {loss.item():.4f}")

    # 4. Communicative Validation
    print("\n--- FINAL COMMUNICATION TEST ---")
    prompts = [
        "frodo llevaba el",
        "puedes ayudarme con",
        "the ring was",
        "quien es sauron"
    ]
    
    responses = []
    for p in prompts:
        p_words = clean_text(p)
        ids = torch.tensor([word_to_id[w] for w in p_words if w in word_to_id]).unsqueeze(0).to(DEVICE)
        if ids.size(1) == 0: continue
        res = generate_text(model, ids, id_to_word)
        print(f"  Q: {p}\n  A: {res}\n")
        responses.append(res)

    model.save_checkpoint(CHECKPOINT_PATH)
    
    report = {
        "experiment": "exp85_v250_fantasy_reasoning",
        "vocab_size": vocab_size,
        "organs": 64,
        "nodes": 4096,
        "responses": responses,
        "status": "CONSOLIDATED"
    }
    
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_experiment()
