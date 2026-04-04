"""
Exp98: V300 Black Box Audit - Topology & Resonance Discovery
============================================================

Goal: Look inside the V300_FINAL_BRAIN.pth to visualize 
the internal 'Growth' of the intelligence.

Audit Steps:
1. Phase Coherence: Calculate if organs are synchronizing (Low variance in phases).
2. Concept Clustering: Check if words from different books (Alicia vs LOTR) 
   are forming distinct clusters in the embedding space.
3. Signal Energy: Measure the average power of the Resonant Colony.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import numpy as np
from pathlib import Path

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_FINAL_BRAIN.pth")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")

def run_blackbox_audit():
    print("--- V300 BLACK BOX AUDIT: TOPOLOGY DISCOVERY ---")
    
    if not CHECKPOINT_PATH.exists():
        print("Checkpoint missing.")
        return

    sd = torch.load(CHECKPOINT_PATH, map_location='cpu')
    fd = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = fd['word_to_id']
    id_to_word = fd['id_to_word']

    # 1. PHASE COHERENCE (Resonance)
    # If phases are random, it's noise. If they cluster, it's a thought.
    phases = []
    for k in sd.keys():
        if 'phase_shift' in k:
            phases.append(sd[k])
    
    phases = torch.stack(phases) # [N_Organs, Freq_Dim]
    # Variance across organs (lower = more synchronization)
    sync_score = 1.0 / (phases.var(dim=0).mean().item() + 1e-6)
    
    # 2. EMBEDDING CLUSTERING (Concept Islands)
    embeds = sd['text_embed.weight'] # [Vocab, D]
    
    def get_cluster_quality(word_list):
        ids = [word_to_id[w] for w in word_list if w in word_to_id]
        if not ids: return 0.0
        vectors = embeds[ids]
        # Cosine similarity within the cluster
        norm_v = F.normalize(vectors, p=2, dim=1)
        sim = torch.mm(norm_v, norm_v.T).mean().item()
        return sim

    # Test Islands:
    alicia_island = ["alicia", "conejo", "reina", "sombrerero"]
    lotr_island = ["frodo", "anillo", "sauron", "mordor"]
    logic_island = ["suma", "resultado", "calcula", "entonces"]
    
    sim_alicia = get_cluster_quality(alicia_island)
    sim_lotr = get_cluster_quality(lotr_island)
    sim_logic = get_cluster_quality(logic_island)
    
    # 3. ROUTER SPECIALIZATION
    # Does the router have high variance? (High variance = specialization)
    router_weights = sd['router.weight']
    specialization = router_weights.std().item()

    report = {
        "sync_score": sync_score,
        "islands": {
            "alicia_coherence": sim_alicia,
            "lotr_coherence": sim_lotr,
            "logic_coherence": sim_logic
        },
        "router_specialization": specialization,
        "growth_verdict": "HEALTHY" if (sim_alicia > 0.1 or sim_lotr > 0.1) else "NOISY"
    }
    
    print(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_blackbox_audit()
