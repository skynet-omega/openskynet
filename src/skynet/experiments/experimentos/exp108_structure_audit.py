"""
Exp108: Emergent Embedding Audit (V300 Alice)
=============================================

Goal: Verify if the 'Frustration' training (Exp107) is creating meaningful 
internal associations. We check if related words in Alice are 'attracting' 
each other in the latent space.

Metrics:
1. Latent Proximity: Are 'Alicia' and 'Conejo' closer than 'Alicia' and 'Sopa'?
2. Structural Order: Is the brain's energy collapsing into patterns or 
   staying as uniform noise?
"""

import torch
import torch.nn.functional as F
import json
from pathlib import Path

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V300_CLEAN_SLATE.pth")
FOUNDATION_PATH = Path("/home/daroch/.openskynet/workspace/V300_FOUNDATION.pt")

def audit_internal_associations():
    print("--- V300 INTERNAL STRUCTURE AUDIT: ALICE REBORN ---")
    
    if not CHECKPOINT_PATH.exists():
        print("Checkpoint missing.")
        return

    # Load Foundation to get word mappings
    fd = torch.load(FOUNDATION_PATH, map_location='cpu')
    word_to_id = fd['word_to_id']
    id_to_word = fd['id_to_word']
    
    # Load the trained weights
    sd = torch.load(CHECKPOINT_PATH, map_location='cpu')
    embeds = sd['text_embed.weight'] # The emergent embedding matrix
    
    def get_similarity(w1, w2):
        if w1 not in word_to_id or w2 not in word_to_id:
            return 0.0
        v1 = embeds[word_to_id[w1]].unsqueeze(0)
        v2 = embeds[word_to_id[w2]].unsqueeze(0)
        return F.cosine_similarity(v1, v2).item()

    # 1. Test Associations (The 'Tree' logic)
    associations = [
        ("alicia", "conejo", "Narrative Link"),
        ("reina", "corazones", "Conceptual Link"),
        ("alicia", "matemáticas", "Non-related Link"),
        ("gato", "sonrisa", "Specific Link")
    ]
    
    results = []
    for w1, w2, desc in associations:
        sim = get_similarity(w1, w2)
        results.append({"pair": f"{w1} <-> {w2}", "sim": sim, "type": desc})
        print(f"  {w1} <-> {w2} ({desc}): {sim:.4f}")

    # 2. Measure Entropy of the entire Brain
    # High entropy = Noise, Low entropy = Structured concepts
    std_dev = embeds.std().item()
    print(f"\n  Global Brain Contrast (StdDev): {std_dev:.4f}")

    report = {
        "experiment": "exp108_emergent_structure",
        "associations": results,
        "contrast": std_dev,
        "verdict": "STRUCTURED" if std_dev > 0.5 else "NOISY"
    }
    
    Path("exp108_structure_results.json").write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    audit_internal_associations()
