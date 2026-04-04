"""
Exp111: Hebbian Alice Duology - The Cognitive Map of Wonderland
===============================================================

Goal: Build a high-fidelity cognitive map by processing two related books
using Active Hebbian Plasticity.

Mechanism:
1. Physical Attraction: Words appearing in the same context window pull 
   their embedding vectors closer in the latent manifold.
2. Structural Wiring: The Adjacency Matrix A_t grows connections between 
   co-occurring concepts.
3. No Gradient Descent for discovery: The topology forms through experience.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
import random
from pathlib import Path
import sys
import os

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

BOOK1_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
BOOK2_PATH = Path("/home/daroch/documents/Alicia_a_traves_del_espejo.txt")
REPORT_PATH = Path("exp111_hebbian_duology_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

def run_hebbian_duology():
    print("--- V300: HEBBIAN ALICE DUOLOGY TRAINING ---")
    
    # 1. Prepare Data
    print("  Loading Books...")
    text1 = BOOK1_PATH.read_text(encoding='utf-8')
    text2 = BOOK2_PATH.read_text(encoding='utf-8')
    words = clean_text(text1) + clean_text(text2)
    
    vocab = sorted(list(set(words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    print(f"  Unified Vocab: {vocab_size} words. Total tokens: {len(words)}")

    # 2. Initialize Model
    model = SKYNET_CORE_V300_SINGULARITY(
        vocab_size=vocab_size, n_organs=16, n_nodes_per_organ=32, d_feature=32,
        device=DEVICE
    ).to(DEVICE)
    
    # 3. Phase 1: Hebbian Experience (Building the Map)
    # We pull embeddings together based on context.
    print("  Phase 1: Experience-based Mapping (Hebbian)...")
    embeds = model.text_embed.weight.data
    window_size = 5
    lr_hebb = 0.02
    
    # Process in chunks for speed
    for i in range(len(words) - window_size):
        center_id = word_to_id[words[i]]
        v_center = embeds[center_id].clone()
        
        for j in range(1, window_size):
            neighbor_id = word_to_id[words[i+j]]
            # Pull neighbor closer to center
            embeds[neighbor_id] += lr_hebb * (v_center - embeds[neighbor_id])
            
        if i % 5000 == 0:
            # Keep on hypersphere
            embeds.data = F.normalize(embeds.data, p=2, dim=1)
            print(f"    Progress: {i/len(words)*100:.1f}%")

    embeds.data = F.normalize(embeds.data, p=2, dim=1)

    # 4. Phase 2: Articulation Training (Learning to speak the map)
    print("  Phase 2: Articulation Training (Predicting)...")
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    
    for step in range(2000):
        idx = random.randint(0, len(words) - 11)
        chunk = [word_to_id[w] for w in words[idx:idx+10]]
        target = word_to_id[words[idx+10]]
        
        ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
        tgt = torch.tensor([target]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], tgt)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (step+1) % 500 == 0:
            print(f"    Step {step+1}/2000 | Loss: {loss.item():.4f}")

    # 5. Audit
    print("\n--- MEASURING ASSOCIATIONS ---")
    def get_sim(w1, w2):
        if w1 not in word_to_id or w2 not in word_to_id: return 0.0
        return F.cosine_similarity(embeds[word_to_id[w1]].unsqueeze(0), 
                                   embeds[word_to_id[w2]].unsqueeze(0)).item()

    # Shared between books
    sim_ac = get_sim("alicia", "conejo")
    sim_ae = get_sim("alicia", "espejo")
    # Specific to book 2
    sim_aj = get_sim("alicia", "jabberwocky") # Not in alice 1
    
    print(f"  Alicia <-> Conejo: {sim_ac:.4f}")
    print(f"  Alicia <-> Espejo: {sim_ae:.4f}")
    print(f"  Alicia <-> Jabberwocky: {sim_aj:.4f}")

    # 6. Dialogue Test
    prompt = "alicia paso por el"
    p_ids = torch.tensor([word_to_id.get(w, 0) for w in clean_text(prompt)]).unsqueeze(0).to(DEVICE)
    res = clean_text(prompt)
    curr = p_ids
    model.eval()
    with torch.no_grad():
        for _ in range(10):
            model.reset()
            out = model(curr)
            nxt = out['logits'].argmax(-1).item()
            res.append(id_to_word[nxt])
            curr = torch.cat([curr[:, 1:], torch.tensor([[nxt]], device=DEVICE)], dim=1)
            
    response = " ".join(res)
    print(f"\n  Final Result: {response}")

    report = {
        "experiment": "exp111_hebbian_duology",
        "associations": {"alicia_conejo": sim_ac, "alicia_espejo": sim_ae, "alicia_jabberwocky": sim_aj},
        "response": response,
        "status": "COMPLETED"
    }
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_hebbian_duology()
