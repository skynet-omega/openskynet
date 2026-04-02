"""
Exp60: Mental Simulation & Dictionary-Scale Topology (V90)
=========================================================

Goal: Unlock 'System 2' reasoning using Mental Simulation (Internal Iteration).
Dataset: Dictionary-scale knowledge (hundreds of words across multiple categories).
Mechanism:
1. System 2 Thinking: The model runs N steps of internal physical diffusion 
   WITHOUT external input to allow signal to reach distant nodes (transitivity).
2. Large Vocab Embedding: Mapping a 500-word dictionary to the Hypergraph nodes.
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
from SKYNET_CORE_V85_SCALING_HYPERGRAPH import SKYNET_CORE_V85_SCALING_HYPERGRAPH
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp60_mental_simulation_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

# 1. DICTIONARY-SCALE DATASET GENERATOR
CATEGORIES = {
    "physics": ["atom", "molecule", "energy", "gravity", "quantum", "photon", "quark", "boson"],
    "biology": ["cell", "dna", "protein", "organism", "evolution", "mammal", "reptile", "enzyme"],
    "geography": ["continent", "ocean", "mountain", "river", "glacier", "desert", "volcano"],
    "computing": ["kernel", "algorithm", "database", "network", "compiler", "variable", "binary"],
    "emotions": ["joy", "sorrow", "anger", "fear", "surprise", "disgust", "trust", "anticipation"]
}

# Expand Categories to ~500 items total (synthetic)
WORDS = []
for cat, base_words in CATEGORIES.items():
    for i in range(100):
        WORDS.append(f"{cat}_{i}")
        
VOCAB = {word: i for i, word in enumerate(WORDS)}
CAT_OF_WORD = {f"{cat}_{i}": cat for cat in CATEGORIES for i in range(100)}

def generate_dictionary_data(n_samples=5000):
    seq_len = 5
    x = torch.zeros(n_samples, seq_len, 658) # Keep core input dim
    y = torch.zeros(n_samples, dtype=torch.long)
    
    for i in range(n_samples):
        # 50% Same Category (Association), 50% Random
        is_positive = random.random() > 0.5
        w1 = random.choice(WORDS)
        
        if is_positive:
            # Pick another word from same category
            cat = CAT_OF_WORD[w1]
            w2 = random.choice([w for w in WORDS if CAT_OF_WORD[w] == cat and w != w1])
            y[i] = 1
        else:
            # Pick word from different category
            cat = CAT_OF_WORD[w1]
            w2 = random.choice([w for w in WORDS if CAT_OF_WORD[w] != cat])
            y[i] = 0
            
        x[i, 0, VOCAB[w1] % 658] = 5.0 # Use modulo to fit 658 input dim
        x[i, 3, VOCAB[w2] % 658] = 5.0
        
    return x, y

class V90_System2_Hypergraph(SKYNET_CORE_V85_SCALING_HYPERGRAPH):
    """
    V90: Added Mental Simulation (N internal steps)
    """
    def __init__(self, n_internal_steps=10, **kwargs):
        super().__init__(**kwargs)
        self.n_internal_steps = n_internal_steps

    def forward_sequence(self, x_seq, training=True):
        self.reset()
        batch, steps, _ = x_seq.shape
        
        # Phase 1: Input Processing
        for t in range(steps):
            out = self.forward(x_seq[:, t], training=training)
            
        # Phase 2: MENTAL SIMULATION (Internal Thinking Time)
        # We run the physical organ N times WITHOUT cortex drive
        # to allow signal propagation across the graph.
        for _ in range(self.n_internal_steps):
            # Drive is 0, but physics keeps running
            zero_drive = torch.zeros(batch, self.organ.n_nodes, self.organ.d_feature, device=self.device)
            # Use the organ forward directly to avoid cortex update
            self.h_phys, self.A_phys, _ = self.organ(zero_drive, self.h_phys, self.A_phys, training)
            
        # Final Readout after thinking
        h_full = torch.zeros(batch, self.max_nodes, self.d_feature, device=self.device)
        h_full[:, :self.organ.n_nodes, :] = self.h_phys
        h_fused = torch.cat([self.cortex_state.squeeze(0), h_full.view(batch, -1)], dim=-1)
        logits = self.readout(h_fused)
        return logits

def run_system2_experiment():
    random.seed(42)
    torch.manual_seed(42)
    
    print(f"Loading Dictionary Dataset (~500 words)...")
    x_train, y_train = generate_dictionary_data(5000)
    x_test, y_test = generate_dictionary_data(1000)
    
    # Large brain for large vocab
    model = V90_System2_Hypergraph(
        n_internal_steps=8, # THE MENTAL SIMULATION TIME
        n_input=658, n_actions=2, n_initial_nodes=64, max_nodes=256, device=DEVICE
    ).to(DEVICE)
    
    print("--- Training V90: System 2 (Mental Simulation) ---")
    train_on_dataset(model, x_train, y_train, max_epochs=20)
    
    acc = evaluate(model, x_test, y_test)
    print(f"Final V90 Dictionary Accuracy: {acc:.4f}")
    
    report = {
        "experiment": "exp60_mental_simulation",
        "vocab_size": len(WORDS),
        "internal_thinking_steps": 8,
        "final_nodes": model.organ.n_nodes,
        "test_accuracy": acc,
        "conclusion": "SUCCESS" if acc > 0.9 else "FAILED"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_system2_experiment()
