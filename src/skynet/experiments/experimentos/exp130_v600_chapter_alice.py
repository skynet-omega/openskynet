"""
Exp130: V600 Level 7 - Full Chapter Challenge (Alice Ch. 1)
=========================================================

Goal: Push the V600 LTS to its current architectural limit by 
absorbing a full chapter (~12k chars). We will use the 
LLM Teacher (Gemma4:e4b) to keep the "Child" focused.

Mechanism:
1. Large Scale Resonant Training (256 nodes).
2. Saliency Filtering to avoid high-frequency word collapse.
3. Periodic LLM Teacher Interventions to correct semantic drift.
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
import random
from pathlib import Path

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
CHAPTER_PATH = Path("chapter_1_alice.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
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
    except Exception as e:
        return f"Error: {e}"

def run_chapter_challenge():
    print("--- V600 LEVEL 7: FULL CHAPTER CHALLENGE (ALICE CH. 1) ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # 1. Initialize Larger V600
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=len(vocab_map),
        n_nodes=256, # Doubled brain mass
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    model.embed.weight.data = knowledge['weights'].to(DEVICE)
    
    # 2. Load and Prepare Chapter
    raw_text = CHAPTER_PATH.read_text(encoding='utf-8')
    all_words = clean_text(raw_text)
    print(f"  [DATA]: Chapter 1 loaded ({len(all_words)} words).")

    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    
    # 3. Training Loop
    steps = 1500
    batch_size = 8
    seq_len = 16
    
    print(f"\n  [TRAINING]: Absorbiendo el capítulo ({steps} pasos)...")
    start_time = time.time()
    
    for step in range(1, steps + 1):
        model.train()
        model.reset()
        
        # Get random chunk
        idx = random.randint(0, len(all_words) - seq_len - 1)
        chunk = all_words[idx : idx + seq_len + 1]
        
        x_ids = torch.tensor([[vocab_map.get(w, 0) for w in chunk[:-1]]]).to(DEVICE)
        y_ids = torch.tensor([[vocab_map.get(w, 0) for w in chunk[1:]]]).to(DEVICE)
        
        out = model(x_ids)
        loss = F.cross_entropy(out.view(-1, len(vocab_map)), y_ids.view(-1))
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        # Periodic Teacher Intervention (Every 500 steps)
        if step % 500 == 0:
            print(f"\n  --- INTERVENCIÓN PASO {step} ---")
            # Select a specific test case from the chapter
            test_phrase = "alicia empezó a" # Expecting 'cansarse' or similar
            x_test = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(test_phrase)]]).to(DEVICE)
            
            model.eval()
            model.reset()
            with torch.no_grad():
                out_test = model(x_test)
                pred_id = torch.argmax(out_test[0, -1, :]).item()
                child_word = id_to_word.get(pred_id, "<?>")
            
            print(f"  [MAESTRO]: ¿Qué hizo Alicia al principio?")
            print(f"  [V600]: Alicia empezó a {child_word}...")
            
            # Let Gemma evaluate and provide the specific correction
            teacher_prompt = f"En el capítulo 1 de Alicia, la frase dice 'Alicia empezaba ya a cansarse'. El alumno dice '{child_word}'. Dime SOLAMENTE la palabra correcta (en infinitivo si es verbo) para corregirlo."
            teacher_word = ask_ollama(teacher_prompt)
            teacher_word = clean_text(teacher_word)[0] if teacher_word else "cansarse"
            
            print(f"  [MAESTRO]: No, Alicia empezó a {teacher_word}.")
            
            if teacher_word in vocab_map:
                print(f"  [PLASTICITY]: Ajustando geometría para '{teacher_word}'...")
                # Freeze net, tune Ricci
                for p in model.parameters(): p.requires_grad = False
                model.field.curvature.requires_grad = True
                model.field.saliency_threshold.requires_grad = True
                
                opt_corr = torch.optim.Adam([model.field.curvature, model.field.saliency_threshold], lr=0.05)
                t_id = torch.tensor([vocab_map[teacher_word]]).to(DEVICE)
                
                for _ in range(20):
                    model.train(); model.reset()
                    out_c = model(x_test)
                    loss_c = F.cross_entropy(out_c[:, -1, :], t_id)
                    opt_corr.zero_grad(); loss_c.backward(); opt_corr.step()
                
                # Unfreeze for next normal training cycle
                for p in model.parameters(): p.requires_grad = True
                
            elapsed = (time.time() - start_time) / 60
            print(f"  [STATUS]: Step {step} | Loss: {loss.item():.4f} | Time: {elapsed:.1f}m")

    # 4. Final Evaluation
    print("\n--- AUDITORÍA FINAL DEL CAPÍTULO ---")
    model.eval()
    prompts = [
        "de qué sirve un libro sin",
        "un conejo blanco de ojos",
        "cayendo por lo que parecía"
    ]
    targets = ["dibujos", "rosados", "pozo"]
    
    for p, t in zip(prompts, targets):
        model.reset()
        x = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(p)]]).to(DEVICE)
        with torch.no_grad():
            out = model(x)
            pred = id_to_word.get(torch.argmax(out[0, -1, :]).item(), "<?>")
            print(f"  Input: '{p:25}' -> Pred: '{pred:10}' {'✅' if pred == t else '❌'}")

if __name__ == "__main__":
    run_chapter_challenge()
