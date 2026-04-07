"""
Exp138: The Causal Geometry of Alice (Text Network Analysis)
============================================================

Goal: Stop guessing and actually measure the "Hidden Protocol" 
of the Alice book. We will map the text as a Directed Graph 
where Words = Nodes, and Transitions = Causal Edges.

We will measure:
1. Hubs (Words with massive gravity/connectivity).
2. Contextual Paths (How "conejo" connects differently than "alicia").
"""

import json
import re
from pathlib import Path
from collections import Counter, defaultdict
import math

DATA_BOOKS = Path("/home/daroch/.openskynet/workspace/alicia_libros.json")

def clean_text(text):
    if not text: return []
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def analyze_causal_geometry():
    print("--- THE CAUSAL GEOMETRY OF ALICE ---")
    
    if not DATA_BOOKS.exists():
        print("Data not found.")
        return
        
    with open(DATA_BOOKS, 'r') as f:
        data = json.load(f)
        
    words = []
    for text in data['textos']:
        words.extend(clean_text(text))
        
    print(f"\n[1] MASA TOTAL: {len(words)} palabras en la simulación.")
    
    # 1. Frequency (Mass)
    freq = Counter(words)
    print("\n[2] AGUJEROS NEGROS SEMÁNTICOS (Top 10 por masa bruta):")
    for w, count in freq.most_common(10):
        print(f"    - '{w:10}': {count} apariciones")
        
    # 2. Causal Edges (Transitions: A -> B)
    # This is the empirical Protocol Map
    transitions = defaultdict(Counter)
    for i in range(len(words) - 1):
        w1, w2 = words[i], words[i+1]
        transitions[w1][w2] += 1
        
    print("\n[3] GEOMETRÍA CONTEXTUAL (¿Hacia dónde curva el espacio cada palabra?):")
    target_words = ["alicia", "conejo", "dijo", "reloj", "cayó"]
    
    for target in target_words:
        if target not in transitions: continue
        total_transitions = sum(transitions[target].values())
        print(f"\n  Gravedad Local de '{target.upper()}' (Total salidas: {total_transitions}):")
        
        # Top 5 most probable next states (The natural Geodesics)
        for next_w, count in transitions[target].most_common(5):
            prob = count / total_transitions
            print(f"    -> '{next_w:10}' (Prob: {prob*100:.1f}%)")
            
    # 3. Entropy of a Word (Is it a Hub or a specific path?)
    # High entropy = connects to everything (like "el") = Black Hole
    # Low entropy = highly specific causal chain = Soliton
    print("\n[4] ENTROPÍA ESTRUCTURAL (Ruido vs Señal):")
    def calc_entropy(word):
        if word not in transitions: return 0.0
        total = sum(transitions[word].values())
        ent = 0.0
        for count in transitions[word].values():
            p = count / total
            ent -= p * math.log2(p)
        return ent

    test_words = ["que", "de", "alicia", "madriguera", "sombrerero"]
    for w in test_words:
        ent = calc_entropy(w)
        print(f"    - '{w:12}' | Entropía: {ent:.3f} bits")

if __name__ == "__main__":
    analyze_causal_geometry()
