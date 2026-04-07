"""
Exp88_V6_Marathon: V305 Hybrid Semantic-Syntax Training (2-Hour Run)
====================================================================

Goal: Train the V305 architecture using a Dual Loss function for 2 hours
to empirically validate if the semantic-syntax unification holds up at scale
without representation collapse.

- Phase 1: Unsupervised Structural Learning (30 minutes)
- Phase 2: Supervised Instruct Tuning (90 minutes)
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
from SKYNET_CORE_V305_HYBRID import SKYNET_CORE_V305_HYBRID

REPORT_PATH = Path("exp88_v305_marathon_status.json")
CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V305_ALICIA_HYBRID.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/MINILM_EMBEDS.pth")

DATA_LIBROS = Path("/home/daroch/.openskynet/workspace/alicia_libros.json")
DATA_INSTRUCT = Path("/home/daroch/.openskynet/workspace/alicia_dataset_1000.jsonl")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
BATCH_SIZE = 16 # Increased for better gradient estimation during marathon
SEQ_LEN = 64
CE_WEIGHT = 0.7
MSE_WEIGHT = 0.3

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

def run_training():
    print("--- OPEN SKYNET: V305 HYBRID 2-HOUR MARATHON ---")
    
    print(f"  Loading MiniLM Embeddings from {EMBEDS_PATH.name}...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    vocab_size = len(vocab_map)
    print(f"  Vocab Size: {vocab_size} words.")

    unsupervised_tokens, supervised_sequences = load_data(vocab_map)

    model = SKYNET_CORE_V305_HYBRID(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    if CHECKPOINT_PATH.exists():
        print(f"  Resuming from existing V305 brain...")
        model.load_checkpoint(CHECKPOINT_PATH)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-4) # Lower LR for stability over long run
    model.train()
    
    start_time = time.time()
    
    # Phase 1: 30 minutes (1800 seconds)
    print(f"\n  [Phase 1] Unsupervised Structural Learning (30 minutes) - Started at {time.ctime()}")
    step = 0
    phase_1_duration = 1800 
    
    while (time.time() - start_time) < phase_1_duration:
        step += 1
        x, y = get_batch(unsupervised_tokens, supervised_sequences, phase=1)
        if x is None: break
        
        model.reset()
        out = model(x)
        
        logits = out['logits'].view(-1, vocab_size)
        targets = y.view(-1)
        loss_ce = F.cross_entropy(logits, targets, ignore_index=0)
        
        pred_concepts = out['concept_vectors'] 
        target_concepts = model.text_embed(y) 
        mask = (y != 0).float().unsqueeze(-1)
        loss_mse = F.mse_loss(pred_concepts * mask, target_concepts * mask, reduction='sum') / (mask.sum() + 1e-8)
        
        loss = (CE_WEIGHT * loss_ce) + (MSE_WEIGHT * loss_mse)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 100 == 0:
            elapsed = time.time() - start_time
            print(f"  [P1] Step {step} | {elapsed/60:.1f}m / 30m | Total Loss: {loss.item():.4f} (CE: {loss_ce.item():.4f}, MSE: {loss_mse.item():.4f})")
            
            # Save periodic status
            status = {
                "phase": 1,
                "step": step,
                "elapsed_minutes": elapsed / 60,
                "loss": loss.item(),
                "ce_loss": loss_ce.item(),
                "mse_loss": loss_mse.item(),
                "energy": out['audit']['energy']
            }
            REPORT_PATH.write_text(json.dumps(status, indent=2))
            
            if step % 500 == 0:
                model.save_checkpoint(CHECKPOINT_PATH)

    # Phase 2: 90 minutes (5400 seconds) - Total 2 hours (7200 seconds)
    print(f"\n  [Phase 2] Supervised Instruct Tuning (90 minutes) - Started at {time.ctime()}")
    step = 0
    total_duration = 7200 
    
    while (time.time() - start_time) < total_duration:
        step += 1
        x, y = get_batch(unsupervised_tokens, supervised_sequences, phase=2)
        if x is None: break
        
        model.reset()
        out = model(x)
        
        logits = out['logits'].view(-1, vocab_size)
        targets = y.view(-1)
        loss_ce = F.cross_entropy(logits, targets, ignore_index=0)
        
        pred_concepts = out['concept_vectors']
        target_concepts = model.text_embed(y)
        mask = (y != 0).float().unsqueeze(-1)
        loss_mse = F.mse_loss(pred_concepts * mask, target_concepts * mask, reduction='sum') / (mask.sum() + 1e-8)
        
        loss = (CE_WEIGHT * loss_ce) + (MSE_WEIGHT * loss_mse)
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step % 100 == 0:
            elapsed = time.time() - start_time
            print(f"  [P2] Step {step} | {elapsed/60:.1f}m / 120m | Total Loss: {loss.item():.4f} (CE: {loss_ce.item():.4f}, MSE: {loss_mse.item():.4f})")
            
            status = {
                "phase": 2,
                "step": step,
                "elapsed_minutes": elapsed / 60,
                "loss": loss.item(),
                "ce_loss": loss_ce.item(),
                "mse_loss": loss_mse.item(),
                "energy": out['audit']['energy']
            }
            REPORT_PATH.write_text(json.dumps(status, indent=2))
            
            if step % 500 == 0:
                model.save_checkpoint(CHECKPOINT_PATH)

    model.save_checkpoint(CHECKPOINT_PATH)
    print(f"\n--- V305 MARATHON FINISHED at {time.ctime()} ---")

if __name__ == "__main__":
    run_training()
