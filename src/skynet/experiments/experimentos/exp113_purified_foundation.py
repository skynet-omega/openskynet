"""
Exp113: The Unified Alice Foundation (V300-Pure)
================================================

Goal: Create a 100% clean, whole-word vocabulary and a Hebbian 
Mental Map using the Alice Duology and the provided JSON datasets.

Protocol:
1. Text Extraction: Combine .txt books and 'textos' from datos_entrenamiento.json.
2. Structured Extraction: Combine 'contexto', 'instruccion', 'respuesta' from dataset_fine_tuning.json.
3. Pure Word Vocab: NO subwords. 
4. Hebbian Adjacency: A_ij = P(i|j)
"""

import torch
import json
import re
from pathlib import Path
from collections import Counter

# Paths
DOCS_DIR = Path("/home/daroch/documents")
JSON_RAW = DOCS_DIR / "datos_entrenamiento.json"
JSON_PROTO = DOCS_DIR / "dataset_fine_tuning.json"
OUTPUT_FOUNDATION = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION_PURE.pt")

def clean_text(text):
    if not isinstance(text, str): return []
    # Keep Spanish chars, accents and spaces
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_foundation_build():
    print("--- BUILDING UNIFIED ALICE FOUNDATION (PURE WORDS) ---")
    
    all_words = []
    
    # 1. Process .txt books
    books = ["Alicia_en_el_pais_de_las_maravillas.txt", "Alicia_a_traves_del_espejo.txt"]
    for b in books:
        path = DOCS_DIR / b
        if path.exists():
            print(f"  Reading {b}...")
            all_words.extend(clean_text(path.read_text(encoding='utf-8')))
            
    # 2. Process Raw JSON (datos_entrenamiento.json)
    if JSON_RAW.exists():
        print(f"  Reading {JSON_RAW.name}...")
        data = json.loads(JSON_RAW.read_text(encoding='utf-8'))
        for t in data.get('textos', []):
            all_words.extend(clean_text(t))
            
    # 3. Process Protocol JSON (dataset_fine_tuning.json)
    if JSON_PROTO.exists():
        print(f"  Reading {JSON_PROTO.name}...")
        # Note: This file seems to be JSONL (multiple objects)
        with open(JSON_PROTO, 'r', encoding='utf-8') as f:
            for line in f:
                try:
                    obj = json.loads(line)
                    all_words.extend(clean_text(obj.get('contexto', '')))
                    all_words.extend(clean_text(obj.get('instruccion', '')))
                    all_words.extend(clean_text(obj.get('respuesta', '')))
                except: pass

    print(f"  Total tokens collected: {len(all_words)}")
    
    # 4. Build Vocabulary
    counts = Counter(all_words)
    # Minimum frequency 2 to remove typos/rare noise
    vocab = sorted([w for w, c in counts.items() if c >= 2])
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    
    print(f"  Purified Vocab size: {vocab_size} words.")

    # 5. Build Hebbian Mental Map (Co-occurrence)
    # We'll use the top 12,000 words for the dense 'Skeleton' to stay under VRAM limits
    top_n = min(12000, vocab_size)
    top_words = sorted(vocab, key=lambda x: counts[x], reverse=True)[:top_n]
    top_word_to_id = {w: i for i, w in enumerate(top_words)}
    
    print(f"  Building Hebbian Map for top {top_n} words...")
    adj = torch.zeros((top_n, top_n))
    window = 5
    
    for i in range(len(all_words) - window):
        w1 = all_words[i]
        if w1 not in top_word_to_id: continue
        id1 = top_word_to_id[w1]
        for j in range(1, window):
            w2 = all_words[i+j]
            if w2 not in top_word_to_id: continue
            id2 = top_word_to_id[w2]
            if id1 != id2:
                adj[id1, id2] += 1.0
                adj[id2, id1] += 1.0
                
    # Normalize (Conditional Probability P(i|j))
    row_sums = adj.sum(dim=-1, keepdim=True) + 1e-6
    adj = adj / row_sums
    
    # 6. Save Foundation
    foundation = {
        "word_to_id": word_to_id,
        "id_to_word": {i: w for i, w in enumerate(vocab)},
        "hebbian_skeleton": adj,
        "top_n": top_n
    }
    
    torch.save(foundation, OUTPUT_FOUNDATION)
    print(f"  [SUCCESS] Foundation saved to {OUTPUT_FOUNDATION}")

if __name__ == "__main__":
    run_foundation_build()
