"""
Exp88_V12: Build Whole-Word Semantic Dictionary
===============================================

Goal: The user correctly pointed out that human cognition and Causal Valence 
operate on whole concepts (words), not arbitrary sub-word fragments (like 'cone' + '##jo').
Sub-word tokenizers destroy the physical resonance of a concept.

To fix this, we will build a custom, pure Whole-Word Dictionary specifically for the 
Alice dataset. We will use MiniLM to encode every single unique WHOLE WORD into a 
single semantic vector. This preserves the "Semantic Anchoring" but eliminates LLM tokenization.
"""

import torch
import json
import re
import os
from pathlib import Path

# We need the sentence-transformers library to generate the embeddings
try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("Please install sentence-transformers: pip install sentence-transformers")
    sys.exit(1)

DATA_LIBROS = Path("/home/daroch/.openskynet/workspace/alicia_libros.json")
DATA_INSTRUCT = Path("/home/daroch/.openskynet/workspace/alicia_dataset_1000.jsonl")
OUT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def build_dictionary():
    print("--- OPEN SKYNET: BUILDING WHOLE-WORD CONCEPT DICTIONARY ---")
    
    unique_words = set()
    
    # 1. Extract words from Libros
    if DATA_LIBROS.exists():
        with open(DATA_LIBROS, 'r') as f:
            data = json.load(f)
        for text in data.get('textos', []):
            unique_words.update(clean_text(text))
            
    # 2. Extract words from Instruct Dataset
    if DATA_INSTRUCT.exists():
        with open(DATA_INSTRUCT, 'r') as f:
            for line in f:
                if not line.strip(): continue
                item = json.loads(line)
                text = f"{item.get('contexto', '')} {item.get('instruccion', '')} {item.get('respuesta', '')}"
                unique_words.update(clean_text(text))
                
    # Add special structural tokens that act as conceptual anchors
    unique_words.update(['contexto', 'instruccion', 'respuesta'])
    
    word_list = sorted(list(unique_words))
    vocab_size = len(word_list)
    print(f"  Extracted {vocab_size} unique whole words from the Alice universe.")
    
    print("  Loading MiniLM to anchor semantics...")
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model = SentenceTransformer('all-MiniLM-L6-v2', device=device)
    
    print("  Encoding whole words into continuous semantic vectors...")
    # Encode all words. convert_to_tensor returns a torch tensor.
    embeddings = model.encode(word_list, convert_to_tensor=True, show_progress_bar=True)
    
    # Add a padding token at index 0 (vector of zeros)
    pad_vector = torch.zeros(1, embeddings.shape[1]).to(device)
    final_embeddings = torch.cat([pad_vector, embeddings], dim=0)
    
    # Build the vocab map
    vocab_map = {'<PAD>': 0}
    for i, word in enumerate(word_list):
        vocab_map[word] = i + 1
        
    print(f"  Final Dictionary Size: {len(vocab_map)} concepts.")
    print(f"  Embedding Matrix Shape: {final_embeddings.shape}")
    
    # Save the knowledge base
    knowledge = {
        'vocab': vocab_map,
        'weights': final_embeddings.cpu()
    }
    
    torch.save(knowledge, OUT_PATH)
    print(f"  Whole-Word Semantic Dictionary saved to {OUT_PATH.name}")

if __name__ == "__main__":
    build_dictionary()
