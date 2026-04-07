"""
Exp88_V4: V303 Contrastive Holographic Inference
================================================

Goal: Test the V303 InfoNCE Concept Brain.
Verify that "Representation Collapse" is fixed and the model actually
generates meaningful, distinct concepts.
"""

import torch
import torch.nn.functional as F
import re
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V303_CONTRASTIVE import SKYNET_CORE_V303_CONTRASTIVE

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V303_ALICIA_CONTRASTIVE.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_inference():
    print("--- OPEN SKYNET: V303 CONTRASTIVE INFERENCE ---")
    
    if not CHECKPOINT_PATH.exists():
        print("  [ERROR] Model checkpoint not found. Run training first.")
        return

    print(f"  Loading MiniLM Embeddings...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    vocab_size = len(vocab_map)
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    model = SKYNET_CORE_V303_CONTRASTIVE(
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
            
            model.reset()
            out = model(x_input)
            
            # Get the concept vector for the last generated token
            # [1, T, d_model] -> [1, d_model]
            last_concept = out['concept_vectors'][:, -1, :] 
            
            # Normalize the concept vector and the embedding matrix for cosine similarity
            norm_concept = F.normalize(last_concept, p=2, dim=-1)
            norm_embeds = F.normalize(model.text_embed.weight, p=2, dim=-1)
            
            # Calculate cosine similarity against all words in the vocabulary
            # [1, d_model] @ [d_model, vocab_size] -> [1, vocab_size]
            similarities = torch.matmul(norm_concept, norm_embeds.t())
            
            # Get top 5 closest concepts
            top_k = 5
            top_probs, top_ids = torch.topk(similarities[0], top_k)
            
            print("Respuesta Conceptual (Top 5 palabras más cercanas al vector generado):")
            for i in range(top_k):
                word = id_to_word.get(top_ids[i].item(), "<UNK>")
                prob = top_probs[i].item()
                print(f"  {i+1}. {word} (Similitud: {prob:.4f})")

if __name__ == "__main__":
    run_inference()
