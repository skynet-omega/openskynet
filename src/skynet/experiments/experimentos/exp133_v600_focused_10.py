"""
Exp133: V600 Focused 10 - The Mastery Protocol (LTS Refactor)
============================================================

Goal: Prove that the V600 LTS can master 10 specific complex concepts
by using focused teacher-driven plasticity and the NEW causal metric flow.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import sys
import os
import subprocess
import time
from pathlib import Path

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
SAMPLES_PATH = Path("focused_10_samples.jsonl")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    if not text: return []
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def ask_ollama(prompt):
    try:
        cmd = ["ollama", "run", "gemma4:e4b", prompt]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        output = result.stdout.strip()
        output = re.sub(r'<think>.*?</think>', '', output, flags=re.DOTALL).strip()
        if "done thinking" in output.lower():
            output = output.split("done thinking.")[-1].strip()
        return output
    except Exception as e: return f"Error: {e}"

def run_focused_10():
    print("--- OPEN SKYNET: THE FOCUSED 10 MASTERY (LTS V600) ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights_data = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=len(vocab_map),
        d_model=weights_data.shape[1],
        n_nodes=256, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    model.embed.weight.data = weights_data
    
    # 1. Load the 10 Golden Samples
    samples = []
    if not SAMPLES_PATH.exists():
        # Create it if it doesn't exist
        print("  Creating focused samples...")
        protocol_path = Path("/home/daroch/.openskynet/workspace/alicia_dataset_1000.jsonl")
        with open(protocol_path, 'r') as f:
            lines = f.readlines()[:10]
        SAMPLES_PATH.write_text("".join(lines))

    with open(SAMPLES_PATH, 'r') as f:
        for line in f:
            if line.strip(): samples.append(json.loads(line))
    
    print("\n  [PRE-PROCESS]: Identificando 'Palabras de Oro' con el Maestro...")
    for s in samples:
        ans = s['respuesta']
        prompt = f"Respuesta: {ans}. Dime SOLAMENTE la palabra única más importante (sustantivo o verbo) de esta respuesta para un niño la aprendiera."
        golden = clean_text(ask_ollama(prompt))
        s['golden'] = golden[0] if golden else "alicia"
        print(f"    - Concepto: {s['golden']}")

    # 2. Mastery Loop
    max_mastery_cycles = 15
    print(f"\n  [MASTERY LOOP]: Sintonización con Plásticidad Total...")
    
    for p in model.parameters(): p.requires_grad = True
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    for cycle in range(1, max_mastery_cycles + 1):
        mastered_count = 0
        model.train()
        
        for i, s in enumerate(samples):
            full_input = f"{s['contexto']} {s['instruccion']}"
            x_ids = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(full_input)]]).to(DEVICE)
            target_id = torch.tensor([vocab_map.get(s['golden'], 0)]).to(DEVICE)
            
            model.reset()
            out = model(x_ids)
            loss = F.cross_entropy(out[:, -1, :], target_id)
            
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            
            with torch.no_grad():
                pred_id = torch.argmax(out[0, -1, :]).item()
                if id_to_word.get(pred_id) == s['golden']:
                    mastered_count += 1
        
        print(f"    Ciclo {cycle} | Maestría: {mastered_count}/10")
        if mastered_count == 10:
            print(f"\n  🎉 ¡ÉXITO en el ciclo {cycle}! El cerebro ha sintonizado los 10 conceptos.")
            break

    # 3. Final Verification
    print("\n--- AUDITORÍA DE MAESTRÍA FINAL ---")
    model.eval()
    for i, s in enumerate(samples):
        full_input = f"{s['contexto']} {s['instruccion']}"
        x_ids = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(full_input)]]).to(DEVICE)
        model.reset()
        with torch.no_grad():
            out = model(x_ids)
            pred_word = id_to_word.get(torch.argmax(out[0, -1, :]).item())
            print(f"  Concepto {i+1}: '{s['golden']:12}' | V610 dice: '{pred_word:12}' {'✅' if pred_word == s['golden'] else '❌'}")

if __name__ == "__main__":
    run_focused_10()
