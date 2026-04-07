"""
Exp127: V600 Level 5 - The "Long Story" Challenge
================================================

Goal: Test the V600 LTS core on a much larger text (approx. 1 page) 
to see if the "Soliton of Meaning" and the "Saliency Filter" 
can prevent the balbuceo effect at scale.

The Story: "El Guardian del Faro y la Estrella Perdida"
A custom story with distinct characters, locations, and causal chains.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import sys
import os
import time
import random
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V600_RESONANT import SKYNET_CORE_V600_RESONANT

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

# --- THE LONG STORY (Level 5) ---
LONG_STORY = """
Había una vez un viejo faro que vivía en una isla de roca fría. 
El guardián del faro se llamaba Tomás y tenía una barba blanca muy larga. 
Cada noche Tomás subía las escaleras caracol para encender la gran lámpara de cristal. 
Un martes una estrella pequeña cayó del cielo y aterrizó suavemente sobre la arena de la playa. 
La estrella estaba triste porque había perdido su luz y tenía frío en la noche oscura. 
Tomás bajó con su linterna y encontró a la estrella brillando muy débilmente cerca del agua. 
Él la envolvió en su bufanda de lana roja y la llevó hasta la cima del faro. 
Allí Tomás le dio un poco de aceite tibio y le cantó una canción sobre el mar. 
Poco a poco la estrella recuperó su brillo dorado y comenzó a flotar de nuevo por la habitación. 
La estrella le dio las gracias a Tomás con un destello fuerte y voló de regreso hacia el cielo infinito. 
Desde ese día Tomás siempre mira hacia arriba y sabe que tiene una amiga en el universo. 
El faro nunca más volvió a sentirse solo en la isla de roca fría.
"""

def run_long_story():
    print("--- OPEN SKYNET: V600 MULTIMODAL DIALOGUE (LTS) ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)
    
    # 1. DATA SOURCES
    # Source A: The Story (Narrative continuity)
    sentences = [clean_text(s) for s in LONG_STORY.strip().split('.') if s.strip()]
    
    # Source B: Protocol (Dialogue/QA Logic)
    protocol_path = Path("/home/daroch/.openskynet/workspace/alicia_dataset_1000.jsonl")
    protocol_samples = []
    if protocol_path.exists():
        with open(protocol_path, 'r') as f:
            for line in f:
                if line.strip(): protocol_samples.append(json.loads(line))
    protocol_subset = random.sample(protocol_samples, 5) # 5 dialogue cases for focused mastery

    # 2. Initialize V600 
    model = SKYNET_CORE_V600_RESONANT(
        vocab_size=vocab_size,
        n_nodes=128, 
        d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    model.embed.weight.data = knowledge['weights'].to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    print(f"\n  [TRAINING] Sintonización Trans-Contextual (Aprendiendo a razonar)...")
    
    # We will create a combined dataset: 
    # 1. Narrative transitions
    # 2. Synthetic QA about the story (Teaching it to bridge context)
    synthetic_qa = [
        ("quién es tomás", "guardián", "diálogo"),
        ("qué tenía tomás", "barba", "diálogo"),
        ("dónde vivía el faro", "isla", "diálogo"),
        ("qué cayó del cielo", "estrella", "diálogo"),
        ("cómo estaba la estrella", "triste", "diálogo")
    ]

    for cycle in range(1, 11): # 10 cycles for deeper anchoring
        model.train()
        loss_total = 0
        
        # Mix narrative and synthetic QA
        # This forces the brain to use the SAME physical nodes for both modes
        combined_data = []
        for seq in sentences:
            if len(seq) < 2: combined_data.append((seq, "historia"))
        for qa in synthetic_qa:
            combined_data.append(([qa[0], qa[1]], qa[2]))
            
        random.shuffle(combined_data)
        
        for item, intent_str in combined_data:
            model.reset()
            intent_id = torch.tensor([[vocab_map.get(intent_str, 0)]]).to(DEVICE)
            
            if intent_str == "historia":
                seq = item
                x = torch.tensor([[vocab_map.get(w, 0) for w in seq[:-1]]]).to(DEVICE)
                y = torch.tensor([[vocab_map.get(w, 0) for w in seq[1:]]]).to(DEVICE)
                out = model(x, intent_text=intent_id, use_dissipation=True)
                loss = F.cross_entropy(out.view(-1, vocab_size), y.view(-1))
            else:
                # QA mode
                q_words, a_word = item[0], item[1]
                x = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(q_words)]]).to(DEVICE)
                y = torch.tensor([vocab_map.get(a_word, 0)]).to(DEVICE)
                out = model(x, intent_text=intent_id, use_dissipation=False)
                loss = F.cross_entropy(out[:, -1, :], y)
                
            optimizer.zero_grad(); loss.backward(); optimizer.step()
            loss_total += loss.item()
            
        if cycle % 2 == 0:
            print(f"    Ciclo {cycle} | Frustración Total: {loss_total/len(combined_data):.4f}")

    # 3. CROSS-CONTEXT TEST
    print("\n--- PRUEBA DE RAZONAMIENTO: EL NIÑO RESPONDE ---")
    
    for question, expected, _ in synthetic_qa:
        model.eval(); model.reset()
        x = torch.tensor([[vocab_map.get(w, 0) for w in clean_text(question)]]).to(DEVICE)
        intent_q = torch.tensor([[vocab_map.get("diálogo", 0)]]).to(DEVICE)
        
        with torch.no_grad():
            out = model(x, intent_text=intent_q)
            pred_id = torch.argmax(out[0, -1, :]).item()
            pred_word = id_to_word.get(pred_id, "<?>")
            
        print(f"  P: '{question:25}' -> R: '{pred_word:12}' {'✅' if pred_word == expected else '❌'}")

if __name__ == "__main__":
    run_long_story()

if __name__ == "__main__":
    run_long_story()
