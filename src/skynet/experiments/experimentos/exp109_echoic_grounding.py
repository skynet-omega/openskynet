"""
Exp109: Echoic Grounding (V300 Alice - Child Learning)
=====================================================

Goal: Solve the 'Noise Problem' by simulating 'Visual Grounding' 
using Echoic Anchors.

Mechanism:
1. Identify 5 'Anchor Nouns' (Alicia, Conejo, Gato, Reina, Sombrerero).
2. Anchor Signal: When an anchor word is seen, its resonant phase 
   is 'Locked' and its energy is amplified by 5x.
3. Echoic Resonance: The anchor's signal is maintained as a 'ghost' 
   input for the next 5 steps (simulating a child looking at an image).
4. Goal: Force the surrounding words (verbs, adjectives) to physically 
   synchronize with the anchors.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
from pathlib import Path
import sys
import os

# Paths
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V300_SINGULARITY import SKYNET_CORE_V300_SINGULARITY

REPORT_PATH = Path("exp109_grounding_results.json")
BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

ANCHOR_WORDS = ["alicia", "conejo", "gato", "reina", "sombrerero"]

def clean_text(text):
    return re.sub(r'[^a-záéíóúüñ\s]', ' ', text.lower()).split()

class GroundedSingularity(SKYNET_CORE_V300_SINGULARITY):
    """
    V300 with Echoic Anchoring (Visual Grounding simulation).
    """
    def __init__(self, anchor_ids, **kwargs):
        super().__init__(**kwargs)
        self.anchor_ids = set(anchor_ids)
        self.echo_buffer = None
        self.echo_decay = 0.8 # Echo fades by 20% each step

    def forward(self, x_text=None, training=True):
        batch = x_text.shape[0]
        
        # 1. Standard Embedding
        h_in = self.input_norm(self.text_embed(x_text))
        
        # 2. Check for Anchors (Simulated Visual Presence)
        is_anchor = False
        for tid in x_text[0]: # Look at current seq
            if tid.item() in self.anchor_ids:
                is_anchor = True
                break
        
        if is_anchor:
            # If an anchor is present, we boost the signal energy (Child focuses)
            h_in = h_in * 2.5
            self.echo_buffer = h_in.detach().clone()
        elif self.echo_buffer is not None:
            # Add the 'Afterimage' (The Echo)
            h_in = h_in + self.echo_buffer * self.echo_decay
            self.echo_buffer *= self.echo_decay
            if self.echo_buffer.abs().mean() < 0.01:
                self.echo_buffer = None

        return super().forward(x_text, training=training)

def run_grounding_experiment():
    print("--- V300: ECHOIC GROUNDING (CHILD MIND STUDY) ---")
    
    # 1. Data
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    words = clean_text(raw_text)
    vocab = sorted(list(set(words)))
    word_to_id = {w: i for i, w in enumerate(vocab)}
    id_to_word = {i: w for i, w in enumerate(vocab)}
    
    anchor_ids = [word_to_id[w] for w in ANCHOR_WORDS if w in word_to_id]
    
    # 2. Model
    model = GroundedSingularity(
        anchor_ids=anchor_ids,
        vocab_size=len(vocab), 
        n_organs=16, n_nodes_per_organ=32, d_feature=16,
        device=DEVICE
    ).to(DEVICE)
    
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    # 3. Training
    model.train()
    for step in range(2500):
        idx = random.randint(0, len(words) - 6)
        chunk = [word_to_id[w] for w in words[idx : idx + 5]]
        target = word_to_id[words[idx + 5]]
        
        ids = torch.tensor(chunk).unsqueeze(0).to(DEVICE)
        tgt = torch.tensor([target]).to(DEVICE)
        
        model.reset()
        out = model(ids)
        loss = F.cross_entropy(out['logits'], tgt)
        
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        if (step+1) % 500 == 0:
            print(f"    Step {step+1} | Loss: {loss.item():.4f} | Energy: {out['audit']['energy']:.4f}")

    # 4. Final Audit (Internal Associations)
    print("\n--- MEASURING EMERGENT ASSOCIATIONS (POST-GROUNDING) ---")
    model.eval()
    embeds = model.text_embed.weight
    
    def get_sim(w1, w2):
        if w1 not in word_to_id or w2 not in word_to_id: return 0.0
        return F.cosine_similarity(embeds[word_to_id[w1]].unsqueeze(0), 
                                   embeds[word_to_id[w2]].unsqueeze(0)).item()

    # Core relationship
    sim_aa = get_sim("alicia", "conejo")
    sim_rr = get_sim("reina", "corazones")
    
    print(f"  alicia <-> conejo: {sim_aa:.4f}")
    print(f"  reina <-> corazones: {sim_rr:.4f}")

    # 5. Dialogue Test
    prompt = "alicia estaba muy"
    p_ids = torch.tensor([word_to_id[w] for w in clean_text(prompt)]).unsqueeze(0).to(DEVICE)
    res_words = clean_text(prompt)
    curr = p_ids
    with torch.no_grad():
        for _ in range(10):
            model.reset()
            out = model(curr)
            nxt = out['logits'].argmax(-1).item()
            res_words.append(id_to_word[nxt])
            curr = torch.cat([curr[:, 1:], torch.tensor([[nxt]], device=DEVICE)], dim=1)
            
    print(f"\n  Final Result: {' '.join(res_words)}")
    
    report = {
        "experiment": "exp109_echoic_grounding",
        "associations": {"alicia_conejo": sim_aa, "reina_corazones": sim_rr},
        "response": " ".join(res_words)
    }
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_grounding_experiment()
