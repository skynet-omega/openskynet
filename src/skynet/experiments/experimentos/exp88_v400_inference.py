"""
Exp88_V8: V400 Causal Resonance Inference
=========================================

Goal: Test the V400 Causal Resonance Core.
The network predicts the next word by generating a "Valence Wave" and 
finding the "Dictionary Wave" that produces the highest constructive 
interference (energy) when superimposed.
"""

import torch
import torch.nn.functional as F
import re
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V400_RESONANCE import SKYNET_CORE_V400_RESONANCE

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V400_ALICIA_RESONANCE.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_inference():
    print("--- OPEN SKYNET: V400 CAUSAL RESONANCE INFERENCE ---")
    
    if not CHECKPOINT_PATH.exists():
        print("  [ERROR] Model checkpoint not found. Run training first.")
        return

    print(f"  Loading MiniLM Embeddings...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    vocab_size = len(vocab_map)
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    model = SKYNET_CORE_V400_RESONANCE(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    model.load_checkpoint(CHECKPOINT_PATH)
    model.eval()

    questions = [
        "¿Cuál es el principal obstáculo físico que impide a Alicia avanzar hacia el jardín?",
        "¿Qué efecto han tenido los sucesos del día en la percepción de Alicia sobre la realidad?",
        "Identifica la razón principal por la cual el sombrerero se encuentra en un estado de hambre y sed."
    ]

    print("\n--- INFERENCE RESULTS ---")
    with torch.no_grad():
        for q in questions:
            print(f"\nPregunta: {q}")
            prompt_text = f"instruccion {q} respuesta "
            words = clean_text(prompt_text)
            
            # Map words to IDs, skipping unknown words
            seq = [vocab_map[w] for w in words if w in vocab_map]
            
            if not seq:
                print("  [No words understood from prompt]")
                continue
                
            x_input = torch.tensor([seq]).to(DEVICE)
            
            # Autoregressive generation loop using Wave Interference
            generated_tokens = []
            
            for _ in range(25): # Generate up to 25 words
                model.reset()
                out = model(x_input, inference=True)
                
                # [1, vocab_size]
                resonance_energies = out['resonance_energy']
                
                # Greedy decoding: take the word that produces highest interference energy
                next_token_id = torch.argmax(resonance_energies, dim=-1).item()
                
                generated_tokens.append(next_token_id)
                
                # Append to input sequence for the next timestep
                next_token_tensor = torch.tensor([[next_token_id]]).to(DEVICE)
                x_input = torch.cat([x_input, next_token_tensor], dim=1)
            
            generated_words = [id_to_word.get(tid, "<UNK>") for tid in generated_tokens]
            print(f"Respuesta Resonante (Autoregresiva): {' '.join(generated_words)}")

if __name__ == "__main__":
    run_inference()
