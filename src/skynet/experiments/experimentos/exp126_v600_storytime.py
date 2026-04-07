"""
Exp126: V600 "Storytime" - Simplicity vs Complexity (Optimized)
============================================================

Goal: Test the V600 on a simple children's story.
Analyze internal entrails: resonance, intent, and causal structure.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import sys
import os
import time
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

STORY_TEXT = """
alicia vio un gato blanco en el jardín
el gato era pequeño y muy suave
alicia buscaba una hermosa flor roja
encontró la flor cerca del gato blanco
el gato saltó y alicia se rió mucho
jugaron juntos bajo el sol toda la tarde
"""

def run_storytime():
    print("--- V600 STORYTIME: SIMPLICITY ANALYSIS ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=len(vocab_map),
        n_nodes=64, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    model.embed.weight.data = knowledge['weights'].to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    lines = [clean_text(line) for line in STORY_TEXT.strip().split('\n') if line.strip()]
    
    print("\n  [TRAINING] Absorbiendo el cuento (500 ciclos)...")
    start_train = time.time()
    for step in range(1, 501):
        model.train()
        total_loss = 0
        for line_words in lines:
            if len(line_words) < 2: continue
            model.reset()
            x_ids = torch.tensor([[vocab_map.get(w, 0) for w in line_words[:-1]]]).to(DEVICE)
            y_ids = torch.tensor([[vocab_map.get(w, 0) for w in line_words[1:]]]).to(DEVICE)
            intent = torch.tensor([[vocab_map.get("historia", 0)]]).to(DEVICE)
            
            out = model(x_ids, intent_text=intent)
            loss = F.cross_entropy(out.view(-1, len(vocab_map)), y_ids.view(-1))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
        
        if step % 100 == 0:
            elapsed = time.time() - start_train
            print(f"    Paso {step} | Loss: {total_loss/len(lines):.4f} | Tiempo: {elapsed:.1f}s")

    print("\n--- AUTOPSIA INTERNA: LAS ENTRAÑAS DEL MODELO ---")
    model.eval()
    
    # Analyze Saliency and Curvature
    with torch.no_grad():
        curv = model.field.curvature.cpu().numpy()
        sal = torch.sigmoid(model.field.saliency_threshold).cpu().numpy()
        print(f"  Curvatura Media (Ricci): {curv.mean():.4f} | Desviación: {curv.std():.4f}")
        print(f"  Saliencia Media (Filtro): {sal.mean():.4f} | Desviación: {sal.std():.4f}")
        
        # Test specific concepts
        test_phrases = [
            "alicia vio un",
            "el gato era",
            "encontró la"
        ]
        
        for phrase in test_phrases:
            model.reset()
            words = clean_text(phrase)
            x = torch.tensor([[vocab_map.get(w, 0) for w in words]]).to(DEVICE)
            intent = torch.tensor([[vocab_map.get("historia", 0)]]).to(DEVICE)
            out = model(x, intent_text=intent)
            
            probs = F.softmax(out[0, -1, :], dim=-1)
            top_val, top_idx = torch.topk(probs, 5)
            
            print(f"\n  Frase: '{phrase}'")
            print("  Top 5 Predicciones (Sintonía):")
            for v, idx in zip(top_val, top_idx):
                print(f"    - {id_to_word.get(idx.item(), '<?>'):12} | Prob: {v:.4f}")

    print("\n  [INFERENCE] Generación Geodésica:")
    model.reset()
    prompt = "jugaron"
    curr_words = prompt.split()
    intent = torch.tensor([[vocab_map.get("historia", 0)]]).to(DEVICE)
    
    for _ in range(8):
        x = torch.tensor([[vocab_map.get(w, 0) for w in curr_words]]).to(DEVICE)
        with torch.no_grad():
            out = model(x, intent_text=intent)
            next_id = torch.argmax(out[0, -1, :]).item()
            next_word = id_to_word.get(next_id, "<?>")
            curr_words.append(next_word)
            if next_word == "<?>": break
            
    print(f"  Result: {' '.join(curr_words)}")

if __name__ == "__main__":
    run_storytime()
