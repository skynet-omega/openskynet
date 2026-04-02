"""
Exp59: Recursive Semantic Reasoning & Brain Scaling (The Turing-Lenia Test)
========================================================================

Goal: Push V85 to its limits using a larger semantic dataset that requires:
1. Concept Chaining (A -> B, B -> C, therefore A -> C).
2. Knowledge Partitioning: Multiple distinct domains (Science, Art, Nature).
3. Dynamic Growth: Observe if the brain triggers neurogenesis when switching domains.
4. Internal Reasoning: Check if signal flows through intermediate nodes to reach a conclusion.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
from pathlib import Path
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V85_SCALING_HYPERGRAPH import SKYNET_CORE_V85_SCALING_HYPERGRAPH
from exp38_ex_hypothesis_benchmark import train_on_dataset, evaluate

REPORT_PATH = Path("exp59_recursive_reasoning_results.json")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

KNOWLEDGE_GRAPH = {
    # Biology
    "lion": {"is": "mammal", "lives": "savannah", "eats": "meat"},
    "eagle": {"is": "bird", "lives": "mountains", "eats": "fish"},
    "shark": {"is": "fish", "lives": "ocean", "eats": "fish"},
    # Tech
    "laptop": {"is": "computer", "needs": "battery", "for": "work"},
    "car": {"is": "vehicle", "needs": "fuel", "for": "travel"},
    "phone": {"is": "mobile", "needs": "battery", "for": "chat"},
    # Art
    "monalisa": {"is": "painting", "style": "renaissance", "by": "davinci"},
    "david": {"is": "statue", "style": "renaissance", "by": "michelangelo"},
    "starrynight": {"is": "painting", "style": "impressionism", "by": "vangogh"}
}

ALL_TERMS = set()
for k, v in KNOWLEDGE_GRAPH.items():
    ALL_TERMS.add(k)
    for attr_val in v.values():
        ALL_TERMS.add(attr_val)

VOCAB = {term: i for i, term in enumerate(sorted(list(ALL_TERMS)))}

def generate_reasoning_data(n_samples=4000):
    seq_len = 8
    x = torch.zeros(n_samples, seq_len, 658)
    y = torch.zeros(n_samples, dtype=torch.long)
    
    concepts = list(KNOWLEDGE_GRAPH.keys())
    
    for i in range(n_samples):
        is_positive = random.random() > 0.5
        c = random.choice(concepts)
        attrs = KNOWLEDGE_GRAPH[c]
        attr_key = random.choice(list(attrs.keys()))
        correct_val = attrs[attr_key]
        
        if is_positive:
            target_val = correct_val
            y[i] = 1
        else:
            all_values = [v[attr_key] for v in KNOWLEDGE_GRAPH.values() if attr_key in v]
            target_val = random.choice(all_values)
            while target_val == correct_val:
                target_val = random.choice(all_values)
            y[i] = 0
            
        x[i, 0, VOCAB[c]] = 5.0
        x[i, 4, VOCAB[target_val]] = 5.0 
        
    return x, y

def generate_transitive_reasoning_data(n_samples=2000):
    """
    TRANSITIVE REASONING TEST:
    Knowledge: A -> B (Lion is Mammal), B -> C (Mammal lives in Savannah)
    Test: A -> C (Does Lion live in Savannah?)
    """
    seq_len = 10
    x = torch.zeros(n_samples, seq_len, 658)
    y = torch.zeros(n_samples, dtype=torch.long)
    
    bio_concepts = ["lion", "eagle", "shark"]
    
    for i in range(n_samples):
        c = random.choice(bio_concepts)
        attrs = KNOWLEDGE_GRAPH[c]
        
        is_positive = random.random() > 0.5
        val1 = attrs['is']
        val2 = attrs['lives']
        
        if is_positive:
            target_val = val2
            y[i] = 1
        else:
            other_c = random.choice(bio_concepts)
            while KNOWLEDGE_GRAPH[other_c]['is'] == val1:
                other_c = random.choice(bio_concepts)
            target_val = KNOWLEDGE_GRAPH[other_c]['lives']
            y[i] = 0
            
        x[i, 0, VOCAB[val1]] = 5.0
        x[i, 5, VOCAB[target_val]] = 5.0
        
    return x, y

def run_scaling_reasoning_experiment():
    random.seed(999)
    torch.manual_seed(999)
    
    print(f"Vocab Size: {len(VOCAB)}")
    
    x_train, y_train = generate_reasoning_data(4000)
    x_test_trans, y_test_trans = generate_transitive_reasoning_data(1000)
    
    model = SKYNET_CORE_V85_SCALING_HYPERGRAPH(
        n_input=658, n_actions=2, n_initial_nodes=32, max_nodes=128, device=DEVICE
    ).to(DEVICE)
    
    def forward_sequence(x_seq, training=True):
        model.reset()
        for t in range(x_seq.shape[1]):
            out = model.forward(x_seq[:, t], training=training)
        return out['logits']
    model.forward_sequence = forward_sequence

    print("--- Phase 1: Knowledge Acquisition ---")
    train_on_dataset(model, x_train, y_train, max_epochs=25)
    
    print("--- Phase 2: Internal Consolidation (Field Settling) ---")
    model.train()
    for _ in range(5):
        dummy_x = torch.randn(10, 5, 658).to(DEVICE) * 0.01
        model.forward_sequence(dummy_x, training=True)

    print("\n--- Testing Phase: Transitive Reasoning (Indirect Links) ---")
    acc_trans = evaluate(model, x_test_trans, y_test_trans)
    
    final_nodes = model.organ.n_nodes
    
    report = {
        "experiment": "exp59_recursive_reasoning",
        "vocab_size": len(VOCAB),
        "initial_nodes": 32,
        "final_nodes": final_nodes,
        "transitive_accuracy": acc_trans,
        "status": "SUCCESS" if acc_trans > 0.7 else "REASONING_GAP"
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_scaling_reasoning_experiment()
