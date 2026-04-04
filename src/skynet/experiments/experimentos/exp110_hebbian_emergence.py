"""
Exp110: Hebbian Self-Organization (The Emergent Child Mind)
==========================================================

Goal: Demonstrate that associations form NOT through error minimization (backprop), 
but through Physical Plasticity (Hebbian logic).

Mechanism:
1. Initialize V300 with RANDOM embeddings.
2. Active Plasticity: Every time words appear together, their latent 
   vectors are physically pulled closer (Hebbian update).
3. No training (No Loss). Just 'Living' through the book Alice.
4. Measure: After 1 pass of the book, are 'Alicia' and 'Conejo' close?
"""

import torch
import torch.nn.functional as F
import json
import re
from pathlib import Path

BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_hebbian_self_org():
    print("--- V300: HEBBIAN SELF-ORGANIZATION AUDIT ---")
    
    # 1. Data
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    words = clean_text(raw_text)
    vocab = sorted(list(set(words)))
    word_to_id = {w: i for i, w in enumerate(vocab)}
    
    # 2. Random Embeddings (The 'Blank' Mind)
    dim = 64
    embeds = torch.randn(len(vocab), dim)
    
    # 3. Process the book (Experience)
    # Whenever words appear in the same window, apply Hebbian attraction
    window_size = 5
    learning_rate = 0.05
    
    print(f"  Mind is living through {len(words)} words...")
    for i in range(len(words) - window_size):
        center_id = word_to_id[words[i]]
        v_center = embeds[center_id]
        
        for j in range(1, window_size):
            neighbor_id = word_to_id[words[i+j]]
            v_neighbor = embeds[neighbor_id]
            
            # Hebbian Attraction: Pull neighbor towards center
            # v_new = v + lr * (v_center - v)
            embeds[neighbor_id] += learning_rate * (v_center - v_neighbor)
            
        # Normalize to keep on the hypersphere
        if i % 100 == 0:
            embeds = F.normalize(embeds, p=2, dim=1)

    # 4. Audit Associations
    def get_sim(w1, w2):
        if w1 not in word_to_id or w2 not in word_to_id: return 0.0
        return F.cosine_similarity(embeds[word_to_id[w1]].unsqueeze(0), 
                                   embeds[word_to_id[w2]].unsqueeze(0)).item()

    sim_aa = get_sim("alicia", "conejo")
    sim_rr = get_sim("reina", "corazones")
    sim_noise = get_sim("alicia", "matemáticas") # Unrelated in this book context
    
    print("\n--- EMERGENT ASSOCIATIONS (HEBBIAN) ---")
    print(f"  alicia <-> conejo (Contextual): {sim_aa:.4f}")
    print(f"  reina <-> corazones (Direct): {sim_rr:.4f}")
    print(f"  alicia <-> matemáticas (Random): {sim_noise:.4f}")

    report = {
        "experiment": "exp110_hebbian_emergence",
        "associations": {"alicia_conejo": sim_aa, "reina_corazones": sim_rr, "noise": sim_noise},
        "verdict": "SUCCESS" if sim_aa > sim_noise else "FAILED"
    }
    Path("exp110_hebbian_results.json").write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_hebbian_self_org()
