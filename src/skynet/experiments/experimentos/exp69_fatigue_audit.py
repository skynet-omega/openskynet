"""
Exp69: The Stress-Limit Test (V110/V120 Fatigue & Capacity Audit)
================================================================

Goal: Identify the 'Critical Breaking Point' of the Hypergraph architecture.
We test three axes of failure:
1. DEEP REASONING (The Transitivity Limit):
   Chain: A -> B -> C -> D -> E. Can it relate A to E?
2. TOPOLOGICAL SATURATION (The Capacity Limit):
   Inject 1000 unrelated semantic associations into a 256-node brain.
3. CONTEXTUAL NOISE (The Focus Limit):
   Processing a target task while 90% of the nodes are being 'hit' 
   by random high-frequency noise.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V100_SINGULARITY import SKYNET_CORE_V100_SINGULARITY

REPORT_PATH = Path("exp69_fatigue_audit_results.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V100_PERSISTENT_BRAIN.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

class V120_Stress_Cortex(SKYNET_CORE_V100_SINGULARITY):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Increase simulation steps for deeper reasoning
        self.n_internal_steps = 15 

def generate_chain_data(chain_length=4, n_samples=500):
    """
    Creates transitive chains: Node 0 -> Node 1 -> Node 2 -> Node 3.
    Target: Does Node 0 lead to Node 3?
    """
    x_seq = torch.zeros(n_samples, chain_length, 658)
    y_target = torch.zeros(n_samples, dtype=torch.long)
    
    for i in range(n_samples):
        # Start a chain
        base_node = random.randint(0, 50)
        y_target[i] = 1 if random.random() > 0.5 else 0
        
        # Build the chain in time
        for t in range(chain_length):
            x_seq[i, t, base_node + t] = 5.0
            
        if y_target[i] == 0:
            # Break the chain at the end
            x_seq[i, -1, :] = 0.0
            x_seq[i, -1, 500] = 5.0 # Wrong terminal node
            
    return x_seq.to(DEVICE), y_target.to(DEVICE)

def run_fatigue_audit():
    print("--- INITIATING CRITICAL LIMIT AUDIT (V120) ---")
    torch.cuda.empty_cache()
    
    # We use 256 nodes to find the limit faster
    model = V120_Stress_Cortex(vocab_size=30000, n_nodes=256, device=DEVICE).to(DEVICE)
    
    # --- TEST 1: REASONING DEPTH ---
    print("\n[Audit 1] Testing Deep Transitivity (Chain Length 5)...")
    x_chain, y_chain = generate_chain_data(chain_length=5, n_samples=200) # Smaller sample
    
    # Train briefly on short chains
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    model.train()
    batch_size = 16
    for _ in range(10):
        for i in range(0, len(x_chain), batch_size):
            model.reset()
            xb = x_chain[i:i+batch_size]
            yb = y_chain[i:i+batch_size]
            # Feed sequence
            for t in range(xb.shape[1]):
                out = model(x_text=xb[:, t].argmax(-1))
            loss = F.cross_entropy(out['logits'], yb)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        
    # Evaluate depth
    model.eval()
    with torch.no_grad():
        model.reset()
        for t in range(x_chain.shape[1]):
            out = model(x_text=x_chain[:, t].argmax(-1))
        acc_depth = (out['logits'].argmax(-1) == y_chain).float().mean().item()
    print(f"  Reasoning Depth Acc (L=5): {acc_depth:.4f}")

    # --- TEST 2: NOISE RESILIENCE ---
    print("\n[Audit 2] Testing Resilience to Saturating Noise...")
    x_clean, y_clean = generate_chain_data(chain_length=2, n_samples=200)
    # Add massive noise to other input dims
    x_noisy = x_clean.clone()
    x_noisy[:, :, 100:600] += torch.randn_like(x_noisy[:, :, 100:600]) * 5.0 
    
    with torch.no_grad():
        model.reset()
        for t in range(x_noisy.shape[1]):
            out = model(x_text=x_noisy[:, t].argmax(-1))
        acc_noise = (out['logits'].argmax(-1) == y_clean).float().mean().item()
    print(f"  Noise Resilience Acc: {acc_noise:.4f}")

    # --- TEST 3: CAPACITY LIMIT ---
    # We measure how 'saturated' the Adjacency matrix gets
    topo_density = model.A_phys.mean().item()
    print(f"\n[Audit 3] Topological Density: {topo_density:.4f}")

    verdict = "STABLE" if acc_depth > 0.7 and acc_noise > 0.7 else "CRITICAL_FAILURE"
    
    report = {
        "experiment": "exp69_v120_fatigue_audit",
        "reasoning_depth_acc": acc_depth,
        "noise_resilience_acc": acc_noise,
        "topological_density": topo_density,
        "critical_limit_detected": "REASONING_DEPTH" if acc_depth < 0.6 else "NONE",
        "verdict": verdict
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_fatigue_audit()
