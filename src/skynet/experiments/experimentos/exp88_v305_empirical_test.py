"""
Exp88_V6_Empirical: V305 Hybrid Empirical Validation
====================================================

Goal: Provide undeniable EMPIRICAL PROOF that the architecture learns.
We will feed it the exact context and instruction from the training set
and measure if the Resonant Colony correctly retrieves the expected answer
(Memorization & Causal recall capability).
"""

import torch
import torch.nn.functional as F
import re
import os
import sys
import json
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V305_HYBRID import SKYNET_CORE_V305_HYBRID

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V305_ALICIA_HYBRID.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_empirical_test():
    print("--- OPEN SKYNET: V305 EMPIRICAL VALIDATION ---")
    
    if not CHECKPOINT_PATH.exists():
        print("  [ERROR] Model checkpoint not found.")
        return

    print(f"  Loading MiniLM Embeddings...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)
    
    model = SKYNET_CORE_V305_HYBRID(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    model.load_checkpoint(CHECKPOINT_PATH)
    model.eval()

    # Exact training sample
    contexto = "Pero ni siquiera podía pasar la cabeza por la abertura. Y aunque pudiera pasar la cabeza, pensó la pobre Alicia, de poco iba a servirme sin los hombros."
    instruccion = "¿Cuál es el principal obstáculo físico que impide a Alicia avanzar hacia el jardín?"
    expected_respuesta = "El obstáculo es su tamaño; es demasiado grande para pasar la cabeza, y por lo tanto, mucho más para los hombros."

    print("\n[MUESTRA EMPÍRICA DE PRUEBA]")
    print(f"Contexto: {contexto}")
    print(f"Instrucción: {instruccion}")
    print(f"Respuesta Esperada: {expected_respuesta}")

    with torch.no_grad():
        prompt_text = f"contexto {contexto} instruccion {instruccion} respuesta "
        words = clean_text(prompt_text)
        
        # Map words to IDs
        seq = [vocab_map[w] for w in words if w in vocab_map]
        x_input = torch.tensor([seq]).to(DEVICE)
        
        generated_tokens = []
        expected_len = len(clean_text(expected_respuesta))
        
        # Autoregressive Generation
        for _ in range(expected_len + 5): # Give it a little extra room
            model.reset()
            out = model(x_input)
            
            # Use discrete logits for exact word generation
            last_logits = out['logits'][:, -1, :] 
            
            # Greedy decoding
            next_token_id = torch.argmax(last_logits, dim=-1).item()
            generated_tokens.append(next_token_id)
            
            next_token_tensor = torch.tensor([[next_token_id]]).to(DEVICE)
            x_input = torch.cat([x_input, next_token_tensor], dim=1)
        
        generated_words = [id_to_word.get(tid, "<UNK>") for tid in generated_tokens]
        print(f"\n[GENERACIÓN DEL CEREBRO V305 (2 Horas Entrenamiento)]")
        print(f"Respuesta: {' '.join(generated_words)}")

if __name__ == "__main__":
    run_empirical_test()
