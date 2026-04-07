"""
Exp88_V16: V402 Thermodynamic Final Inference
=============================================

Goal: Perform the definitive EMPIRICAL TEST on the V402 Boltzmann Brain 
after the 2-hour Whole-Word Marathon.
We use autoregressive generation with wave interference and the learned 
thermodynamic temperature.
"""

import torch
import torch.nn.functional as F
import re
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V402_THERMODYNAMIC import SKYNET_CORE_V402_THERMODYNAMIC

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V402_ALICIA_THERMODYNAMIC.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_inference():
    print("--- OPEN SKYNET: V402 FINAL EMPIRICAL INFERENCE ---")
    
    if not CHECKPOINT_PATH.exists():
        print("  [ERROR] Model checkpoint not found.")
        return

    print(f"  Loading Whole-Word Dictionary and Brain...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)
    
    model = SKYNET_CORE_V402_THERMODYNAMIC(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    model.load_checkpoint(CHECKPOINT_PATH)
    model.eval()

    test_cases = [
        {
            "ctx": "pero ni siquiera podía pasar la cabeza por la abertura",
            "ins": "qué impedía pasar"
        },
        {
            "ctx": "alicia pensó que como el conejo tenía un reloj debía tener mucha prisa",
            "ins": "quién tenía prisa"
        },
        {
            "ctx": "el sombrerero se volvió y asintió con la cabeza pero siguió ocupado con su té",
            "ins": "qué estaba haciendo el sombrerero"
        }
    ]

    print("\n--- RESULTS ---")
    with torch.no_grad():
        for case in test_cases:
            print(f"\nContexto: {case['ctx']}")
            print(f"Pregunta: {case['ins']}")
            
            prompt_text = f"contexto {case['ctx']} instruccion {case['ins']} respuesta "
            words = clean_text(prompt_text)
            seq = [vocab_map[w] for w in words if w in vocab_map]
            
            if not seq:
                print("  [No words understood from prompt]")
                continue
                
            x_input = torch.tensor([seq]).to(DEVICE)
            generated_tokens = []
            
            # Generate up to 15 words
            for _ in range(15):
                model.reset()
                out = model(x_input, get_logits=True)
                
                # Boltzmann logits (Energy / Temperature)
                last_logits = out['logits'][:, -1, :] 
                
                # Top-K Sampling with Temperature
                temperature = 0.7
                top_k = 5
                
                scaled_logits = last_logits / temperature
                probs = F.softmax(scaled_logits, dim=-1)
                
                top_probs, top_indices = torch.topk(probs, top_k, dim=-1)
                
                # Sample from the top-k distribution
                sample_idx = torch.multinomial(top_probs, 1)
                next_token_id = top_indices.gather(-1, sample_idx).item()
                
                # Stop if we hit padding (though not expected here)
                if next_token_id == 0: break
                
                generated_tokens.append(next_token_id)
                
                next_token_tensor = torch.tensor([[next_token_id]]).to(DEVICE)
                x_input = torch.cat([x_input, next_token_tensor], dim=1)
            
            generated_words = [id_to_word.get(tid, "<UNK>") for tid in generated_tokens]
            print(f"V402 Resonante: {' '.join(generated_words)}")

if __name__ == "__main__":
    run_inference()
