"""
Exp88_V17: V402 Deep Brain Autopsy & Resonance Mapping
=====================================================

Goal: Inspect the internal "Valence Waves" of the Boltzmann Brain V402.
We want to see why it prefers common words (Black Holes) and if the 
32 Resonant Organs are truly active.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import sys
import os
from pathlib import Path

# Paths
EX_DIR = "/home/daroch/openskynet/src/skynet/experiments/EX"
sys.path.insert(0, EX_DIR)
from SKYNET_CORE_V402_THERMODYNAMIC import SKYNET_CORE_V402_THERMODYNAMIC

MODEL_PATH = Path(EX_DIR) / "V402_ALICIA_THERMODYNAMIC.pth"
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_autopsy():
    print("--- SKYNET V402: DEEP RESONANCE AUTOPSY ---")
    
    # 1. Load Dictionary
    print(f"  Loading Whole-Word Map...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    weights = knowledge['weights']
    vocab_size = len(vocab_map)

    # 2. Load Brain
    print(f"  Loading Boltzmann Brain (V402)...")
    model = SKYNET_CORE_V402_THERMODYNAMIC(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
    model.eval()

    # 3. Targeted Probes
    probes = [
        "el conejo tenía un",
        "alicia cayó por el",
        "el sombrerero estaba tomando"
    ]

    report = []

    for prompt in probes:
        print(f"\n  Probing: '{prompt}'")
        words = clean_text(prompt)
        p_ids = torch.tensor([vocab_map.get(w, 0) for w in words]).unsqueeze(0).to(DEVICE)
        
        with torch.no_grad():
            model.reset()
            # Capture internal waves and energy weights
            out = model(p_ids, get_logits=True)
            
            # --- ENERGY ANALYSIS ---
            logits = out['logits'][:, -1, :] # Last token prediction
            probs = F.softmax(logits, dim=-1)
            
            # Top 10 Resonant Candidates
            top_vals, top_ids = torch.topk(logits, 10)
            candidates = []
            for i in range(10):
                word = id_to_word[top_ids[0, i].item()]
                energy = top_vals[0, i].item()
                prob = probs[0, top_ids[0, i].item()].item()
                candidates.append({"word": word, "energy": energy, "prob": prob})
                print(f"    - {word:12} | Energy: {energy:.4f} | Prob: {prob:.4f}")

            # --- ORGAN DIAGNOSIS ---
            # Extract router weights (which organs were summoned?)
            # Need to re-run or use a hook? Let's just re-simulate the router logic
            h_in = model.input_norm(model.text_embed(p_ids)) + model.pos_encoder[:, :p_ids.shape[1], :]
            causal_mask = nn.Transformer.generate_square_subsequent_mask(p_ids.shape[1]).to(DEVICE)
            h_ctx_seq = model.cortex(h_in, mask=causal_mask, is_causal=True)
            router_weights = torch.softmax(model.router(h_ctx_seq[:, -1, :]), dim=-1) # [1, 32]
            
            active_organs = (router_weights > 0.05).sum().item()
            entropy = -torch.sum(router_weights * torch.log(router_weights + 1e-9)).item()
            print(f"    Organ Sync: {active_organs}/32 active | Entropy: {entropy:.4f}")

            # --- SPECTRAL DYNAMICS ---
            # Let's check the temperature tau
            tau = out['audit']['tau']
            print(f"    Thalamic Temp (tau): {tau:.4f}")

            report.append({
                "prompt": prompt,
                "top_10": candidates,
                "active_organs": active_organs,
                "entropy": entropy,
                "tau": tau
            })

    # Save findings
    with open("exp88_v402_autopsy_v2_results.json", "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nAutopsy complete. Results saved to exp88_v402_autopsy_v2_results.json")

if __name__ == "__main__":
    run_autopsy()
