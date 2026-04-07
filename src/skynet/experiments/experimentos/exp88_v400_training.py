"""
Exp88_V8: V400 Causal Resonance Core Training
=============================================

Goal: Train the V400 architecture using purely energy-based loss (Wave Interference).
Instead of CrossEntropy, we maximize the constructive interference (dot product) 
between the network's "Valence Wave" and the target word's "Dictionary Wave", 
while minimizing interference with a random sample of negative words.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import random
import re
import time
from pathlib import Path
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V400_RESONANCE import SKYNET_CORE_V400_RESONANCE

REPORT_PATH = Path("exp88_v400_training_status.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V400_ALICIA_RESONANCE.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")

DATA_LIBROS = Path("/home/daroch/.openskynet/workspace/alicia_libros.json")
DATA_INSTRUCT = Path("/home/daroch/.openskynet/workspace/alicia_dataset_1000.jsonl")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BATCH_SIZE = 8
SEQ_LEN = 64
NUM_NEGATIVES = 64 # Number of negative waves to sample per target

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def load_data(vocab_map):
    print("  Loading datasets...")
    unsupervised_tokens = []
    if DATA_LIBROS.exists():
        with open(DATA_LIBROS, 'r') as f:
            data = json.load(f)
        for text in data.get('textos', []):
            words = clean_text(text)
            unsupervised_tokens.extend([vocab_map.get(w, 0) for w in words])

    supervised_sequences = []
    if DATA_INSTRUCT.exists():
        with open(DATA_INSTRUCT, 'r') as f:
            for line in f:
                if not line.strip(): continue
                item = json.loads(line)
                text = f"contexto {item.get('contexto', '')} instruccion {item.get('instruccion', '')} respuesta {item.get('respuesta', '')}"
                words = clean_text(text)
                seq = [vocab_map.get(w, 0) for w in words]
                if len(seq) > 10:
                    supervised_sequences.append(seq)
                    
    print(f"  Unsupervised tokens: {len(unsupervised_tokens)}")
    print(f"  Supervised sequences: {len(supervised_sequences)}")
    return unsupervised_tokens, supervised_sequences

def get_batch(unsupervised_tokens, supervised_sequences, phase=1):
    if phase == 1 and len(unsupervised_tokens) > SEQ_LEN + 1:
        x_batch = []
        y_batch = []
        for _ in range(BATCH_SIZE):
            idx = random.randint(0, len(unsupervised_tokens) - SEQ_LEN - 1)
            chunk = unsupervised_tokens[idx:idx + SEQ_LEN + 1]
            x_batch.append(chunk[:-1])
            y_batch.append(chunk[1:])
        return torch.tensor(x_batch).to(DEVICE), torch.tensor(y_batch).to(DEVICE)
    elif phase == 2 and supervised_sequences:
        x_batch = []
        y_batch = []
        for _ in range(BATCH_SIZE):
            seq = random.choice(supervised_sequences)
            if len(seq) <= SEQ_LEN:
                pad_len = SEQ_LEN + 1 - len(seq)
                padded_seq = seq + [0]*pad_len
                x_batch.append(padded_seq[:-1])
                y_batch.append(padded_seq[1:])
            else:
                idx = random.randint(0, len(seq) - SEQ_LEN - 1)
                chunk = seq[idx:idx + SEQ_LEN + 1]
                x_batch.append(chunk[:-1])
                y_batch.append(chunk[1:])
        return torch.tensor(x_batch).to(DEVICE), torch.tensor(y_batch).to(DEVICE)
    else:
        return None, None

def calculate_interference_energy(wave_a, wave_b):
    """
    Calculates the constructive interference (energy) between two complex waves.
    wave_a, wave_b: Complex tensors of same shape.
    """
    # Complex dot product: A * Conj(B)
    interference = wave_a * torch.conj(wave_b)
    # Sum over frequency dimension and take real part to get magnitude of resonance
    energy = interference.sum(dim=-1).real
    return energy

def run_training():
    print("--- OPEN SKYNET: V400 CAUSAL RESONANCE TRAINING ---")
    
    print(f"  Loading MiniLM Embeddings from {EMBEDS_PATH.name}...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    vocab_size = len(vocab_map)
    print(f"  Vocab Size: {vocab_size} words.")

    unsupervised_tokens, supervised_sequences = load_data(vocab_map)

    model = SKYNET_CORE_V400_RESONANCE(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print(f"  Resuming from existing V400 brain...")
        model.load_checkpoint(CHECKPOINT_PATH)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4)
    model.train()
    
    print("  Phase 1: Resonant Unsupervised Learning (200 steps)")
    for step in range(1, 201):
        x, y = get_batch(unsupervised_tokens, supervised_sequences, phase=1)
        if x is None: break
        
        model.reset()
        out = model(x)
        
        # [B, T, freq_dim]
        valence_waves = out['valence_waves'] 
        
        # Get target waves (positive examples)
        # [B, T, freq_dim]
        target_waves = model.get_target_waves(y)
        
        # Calculate constructive interference with correct word
        # [B, T]
        positive_energy = calculate_interference_energy(valence_waves, target_waves)
        
        # Sample negative words randomly
        # [B, T, NUM_NEGATIVES]
        neg_ids = torch.randint(0, vocab_size, (BATCH_SIZE, SEQ_LEN, NUM_NEGATIVES), device=DEVICE)
        # [B, T, NUM_NEGATIVES, freq_dim]
        neg_waves = model.get_target_waves(neg_ids)
        
        # Expand valence waves for broadcasting
        # [B, T, 1, freq_dim]
        valence_waves_exp = valence_waves.unsqueeze(2)
        
        # Calculate interference with negative words
        # [B, T, NUM_NEGATIVES]
        negative_energies = calculate_interference_energy(valence_waves_exp, neg_waves)
        
        # Mask out padding tokens
        mask = (y != 0).float() # [B, T]
        
        # Margin Ranking Loss or InfoNCE on Energy
        # We want positive_energy > negative_energies
        # For numerical stability, let's use a softplus margin loss
        margin = 10.0
        
        # [B, T, NUM_NEGATIVES]
        energy_diff = negative_energies - positive_energy.unsqueeze(2) + margin
        
        # Only penalize if negative energy gets too close to positive energy
        loss_components = F.relu(energy_diff)
        
        # Mean over negatives, then apply mask
        loss_per_token = loss_components.mean(dim=2) * mask
        loss = loss_per_token.sum() / (mask.sum() + 1e-8)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 20 == 0:
            avg_pos = (positive_energy * mask).sum() / mask.sum()
            avg_neg = (negative_energies.mean(dim=2) * mask).sum() / mask.sum()
            print(f"  [Phase 1] Step {step} | Loss: {loss.item():.4f} | Pos Energy: {avg_pos:.1f} | Neg Energy: {avg_neg:.1f}")

    print("  Phase 2: Resonant Instruct Tuning (300 steps)")
    for step in range(1, 301):
        x, y = get_batch(unsupervised_tokens, supervised_sequences, phase=2)
        if x is None: break
        
        model.reset()
        out = model(x)
        
        valence_waves = out['valence_waves'] 
        target_waves = model.get_target_waves(y)
        positive_energy = calculate_interference_energy(valence_waves, target_waves)
        
        neg_ids = torch.randint(0, vocab_size, (BATCH_SIZE, SEQ_LEN, NUM_NEGATIVES), device=DEVICE)
        neg_waves = model.get_target_waves(neg_ids)
        valence_waves_exp = valence_waves.unsqueeze(2)
        negative_energies = calculate_interference_energy(valence_waves_exp, neg_waves)
        
        mask = (y != 0).float()
        
        margin = 10.0
        energy_diff = negative_energies - positive_energy.unsqueeze(2) + margin
        loss_components = F.relu(energy_diff)
        loss_per_token = loss_components.mean(dim=2) * mask
        loss = loss_per_token.sum() / (mask.sum() + 1e-8)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 20 == 0:
            avg_pos = (positive_energy * mask).sum() / mask.sum()
            avg_neg = (negative_energies.mean(dim=2) * mask).sum() / mask.sum()
            print(f"  [Phase 2] Step {step} | Loss: {loss.item():.4f} | Pos Energy: {avg_pos:.1f} | Neg Energy: {avg_neg:.1f}")

    model.save_checkpoint(CHECKPOINT_PATH)
    print("--- V400 TRAINING FINISHED ---")

if __name__ == "__main__":
    run_training()
