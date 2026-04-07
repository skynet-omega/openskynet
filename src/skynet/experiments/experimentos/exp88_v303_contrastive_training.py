"""
Exp88_V4: V303 Contrastive Holographic Brain Training (InfoNCE)
================================================================

Goal: Train the V303 architecture using Contrastive Concept Loss (InfoNCE).
This prevents "Representation Collapse" by forcing the predicted concept vector
to be close to the true word's vector AND far from other words' vectors in the batch.
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
from SKYNET_CORE_V303_CONTRASTIVE import SKYNET_CORE_V303_CONTRASTIVE

REPORT_PATH = Path("exp88_v303_training_status.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V303_ALICIA_CONTRASTIVE.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")

DATA_LIBROS = Path("/home/daroch/.openskynet/workspace/alicia_libros.json")
DATA_INSTRUCT = Path("/home/daroch/.openskynet/workspace/alicia_dataset_1000.jsonl")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BATCH_SIZE = 8
SEQ_LEN = 64

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

def infonce_loss(pred_concepts, target_concepts, mask, logit_scale):
    # Flatten the batch and sequence dimensions
    pred_flat = pred_concepts.view(-1, pred_concepts.size(-1))
    target_flat = target_concepts.view(-1, target_concepts.size(-1))
    mask_flat = mask.view(-1)
    
    # Filter out padding tokens
    valid_preds = pred_flat[mask_flat > 0]
    valid_targets = target_flat[mask_flat > 0]
    
    if len(valid_preds) == 0:
        return torch.tensor(0.0, device=pred_concepts.device, requires_grad=True)
    
    # Normalize features
    valid_preds = F.normalize(valid_preds, p=2, dim=-1)
    valid_targets = F.normalize(valid_targets, p=2, dim=-1)
    
    # Calculate Cosine Similarities (scaled by temperature)
    # [N, d_model] @ [d_model, N] -> [N, N]
    logits = torch.matmul(valid_preds, valid_targets.t()) * logit_scale
    
    # The correct target for pred[i] is target[i], which is on the diagonal
    labels = torch.arange(len(logits), device=logits.device)
    
    # Standard CrossEntropy loss on the contrastive logits
    loss = F.cross_entropy(logits, labels)
    return loss

def run_training():
    print("--- OPEN SKYNET: V303 CONTRASTIVE CONCEPT TRAINING ---")
    
    print(f"  Loading MiniLM Embeddings from {EMBEDS_PATH.name}...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    vocab_size = len(vocab_map)
    print(f"  Vocab Size: {vocab_size} words.")

    unsupervised_tokens, supervised_sequences = load_data(vocab_map)

    model = SKYNET_CORE_V303_CONTRASTIVE(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print(f"  Resuming from existing V303 brain...")
        model.load_checkpoint(CHECKPOINT_PATH)

    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    model.train()
    
    print("  Phase 1: Holographic Contrastive Unsupervised Learning (200 steps)")
    for step in range(1, 201):
        x, y = get_batch(unsupervised_tokens, supervised_sequences, phase=1)
        if x is None: break
        
        model.reset()
        out = model(x)
        
        pred_concepts = out['concept_vectors'] 
        logit_scale = out['logit_scale']
        
        # Get target embeddings
        target_concepts = model.text_embed(y) 
        
        mask = (y != 0).float()
        
        loss = infonce_loss(pred_concepts, target_concepts, mask, logit_scale)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 20 == 0:
            print(f"  [Phase 1] Step {step} | InfoNCE Loss: {loss.item():.4f} | Temp: {1/logit_scale.item():.4f}")

    print("  Phase 2: Holographic Contrastive Instruct Tuning (300 steps)")
    for step in range(1, 301):
        x, y = get_batch(unsupervised_tokens, supervised_sequences, phase=2)
        if x is None: break
        
        model.reset()
        out = model(x)
        
        pred_concepts = out['concept_vectors']
        logit_scale = out['logit_scale']
        
        target_concepts = model.text_embed(y)
        
        mask = (y != 0).float()
        
        loss = infonce_loss(pred_concepts, target_concepts, mask, logit_scale)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 20 == 0:
            print(f"  [Phase 2] Step {step} | InfoNCE Loss: {loss.item():.4f} | Temp: {1/logit_scale.item():.4f}")

    model.save_checkpoint(CHECKPOINT_PATH)
    print("--- V303 TRAINING FINISHED ---")

if __name__ == "__main__":
    run_training()
