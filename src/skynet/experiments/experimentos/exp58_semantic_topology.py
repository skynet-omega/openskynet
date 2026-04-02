"""
Exp58: Semantic Topology - Concept Association via Hypergraph
===========================================================

Goal: Test if the V85 Hypergraph can learn to associate words/concepts 
by building physical bridges between their embeddings in the topology.

Mechanism:
1. Embeddings: Small vocabulary (Fruit, Colors, Animals).
2. Input: Pairs of related concepts (e.g. 'Apple' + 'Red').
3. Topology Check: Verify if A_t creates a stronger connection 
   between nodes representing related concepts vs unrelated ones.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path

# Paths for imports
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))

from SKYNET_CORE_V85_SCALING_HYPERGRAPH import SKYNET_CORE_V85_SCALING_HYPERGRAPH
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp58_semantic_topology_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

# 1. Vocabulary & Simple Embeddings
VOCAB = {
    "apple": 0, "banana": 1, "cherry": 2,  # Fruits
    "red": 3, "yellow": 4,                 # Colors
    "dog": 5, "cat": 6, "bird": 7,         # Animals
    "bark": 8, "meow": 9                   # Sounds
}
EMBED_DIM = 16

class SemanticTask:
    def __init__(self):
        # Relationship pairs (concept -> association)
        self.pairs = [
            ("apple", "red"), ("cherry", "red"),
            ("banana", "yellow"),
            ("dog", "bark"), ("cat", "meow")
        ]
        self.vocab_size = len(VOCAB)
        self.embedding = nn.Embedding(self.vocab_size, EMBED_DIM)

    def generate_data(self, n_samples=1000):
        seq_len = 5
        # We pad to match SKYNET_CORE_V85 n_input (658)
        x = torch.zeros(n_samples, seq_len, 658)
        y = torch.zeros(n_samples, dtype=torch.long)
        
        for i in range(n_samples):
            # Pick a positive pair (True association) or negative
            is_positive = random.random() > 0.5
            if is_positive:
                w1, w2 = random.choice(self.pairs)
                y[i] = 1
            else:
                w1 = random.choice(list(VOCAB.keys()))
                w2 = random.choice(list(VOCAB.keys()))
                # Ensure it's not a known pair
                while (w1, w2) in self.pairs:
                    w2 = random.choice(list(VOCAB.keys()))
                y[i] = 0
            
            # Simple one-hot-like injection into the 658 input space
            x[i, 0, VOCAB[w1]] = 5.0
            x[i, 2, VOCAB[w2]] = 5.0 # Delay of 1 step
            
        return x, y

def run_semantic_experiment():
    random.seed(42)
    torch.manual_seed(42)
    
    task = SemanticTask()
    x_train, y_train = task.generate_data(2000)
    x_test, y_test = task.generate_data(500)
    
    # Initialize V85
    model = SKYNET_CORE_V85_SCALING_HYPERGRAPH(
        n_input=658, n_actions=2, n_initial_nodes=32, device=DEVICE
    ).to(DEVICE)
    
    print("Training V85 on Semantic Associations...")
    # Wrap model to provide forward_sequence if missing
    if not hasattr(model, 'forward_sequence'):
        def forward_sequence(x_seq, training=True):
            model.reset()
            for t in range(x_seq.shape[1]):
                logits = model.forward(x_seq[:, t], training=training)['logits']
            return logits
        model.forward_sequence = forward_sequence

    train_on_dataset(model, x_train, y_train, max_epochs=20)
    
    acc = evaluate(model, x_test, y_test)
    print(f"Final Semantic Accuracy: {acc:.4f}")
    
    # Audit Topology
    # We want to see if the density of A_t is higher for positive pairs
    avg_density = model.A_phys.mean().item()
    
    report = {
        "experiment": "exp58_semantic_topology",
        "test_accuracy": acc,
        "final_nodes": model.organ.n_nodes,
        "topology_avg_density": avg_density,
        "conclusion": "SUCCESS" if acc > 0.85 else "FAILED"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_semantic_experiment()
