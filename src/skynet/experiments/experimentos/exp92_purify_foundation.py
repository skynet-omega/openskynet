"""
Exp92: Purified Word Map & Hebbian Initialization (V300-ES)
==========================================================

Goal: Build a high-fidelity word-level vocabulary and a 
topological common-sense map based on co-occurrence.

Data: 5 Master Books + OpenHermes-Spanish (Cleaned).
Mechanism:
1. Extract all unique words (no subwords).
2. Calculate Hebbian Adjacency: A_ij = log(P(i,j) / (P(i)P(j)))
3. Save as V300_PURIFIED_FOUNDATION.pt
"""

import torch
import json
import re
from pathlib import Path
from collections import Counter
import math

def clean_text(text):
    text = text.lower()
    # Only alphanumeric and Spanish characters
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_purification():
    print("--- V300: BUILDING PURIFIED FOUNDATION ---")
    
    # 1. Gather all raw text
    text_sources = [
        Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/library_full.txt"),
        Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/fast_data.txt")
    ]
    
    all_words = []
    for src in text_sources:
        if src.exists():
            print(f"  Reading {src.name}...")
            # We only need a representative slice for the vocab/co-occurrence (e.g., 500k words)
            content = src.read_text(encoding='utf-8')
            all_words.extend(clean_text(content)[:500000])

    # 2. Build Vocabulary (Pure words)
    counts = Counter(all_words)
    # Filter very rare words to keep nodes relevant (min count 2)
    vocab = [w for w, c in counts.items() if c >= 2]
    vocab = sorted(vocab)
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    
    print(f"  Purified Vocab: {vocab_size} unique words.")

    # 3. Calculate Co-occurrence (Hebbian Mapping)
    # We use a window of 5 words to find relationships
    print("  Calculating Hebbian Adjacency (Mental Map)...")
    window_size = 5
    # We'll use a smaller N for the dense initial matrix to avoid OOM
    # Let's pick the TOP 10,000 most frequent words for the initial 'skeleton'
    top_n = min(10000, vocab_size)
    top_words = sorted(vocab, key=lambda x: counts[x], reverse=True)[:top_n]
    top_word_to_id = {w: i for i, w in enumerate(top_words)}
    
    adj = torch.zeros((top_n, top_n))
    
    for i in range(len(all_words) - window_size):
        w1 = all_words[i]
        if w1 not in top_word_to_id: continue
        id1 = top_word_to_id[w1]
        
        for j in range(1, window_size):
            w2 = all_words[i+j]
            if w2 not in top_word_to_id: continue
            id2 = top_word_to_id[w2]
            
            if id1 != id2:
                adj[id1, id2] += 1.0
                adj[id2, id1] += 1.0
                
    # Normalize Adjacency (PMI style)
    print("  Normalizing Topology...")
    row_sums = adj.sum(dim=-1, keepdim=True) + 1e-6
    adj = adj / row_sums
    
    # 4. Save
    foundation = {
        "word_to_id": word_to_id,
        "id_to_word": {i: w for w, i in word_to_id.items()},
        "initial_adjacency": adj, # For the top_n nodes
        "top_n": top_n
    }
    
    torch.save(foundation, "V300_FOUNDATION.pt")
    print(f"--- PURIFICATION COMPLETE: V300_FOUNDATION.pt saved ---")

if __name__ == "__main__":
    run_purification()
