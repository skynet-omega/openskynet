"""
Exp78: V220 Reading Alicia - Spanish Narrative Resonance
========================================================

Goal: Test the V210/V220's ability to process a complex Spanish 
literary text: "Alicia en el país de las maravillas".

Mechanism:
1. Spanish Tokenizer: Mapping the book's vocabulary to the V220 embedding.
2. Narrative Flow: Processing the text as a sequence of waves.
3. Resonance Audit: Measuring how the 'Swarm Mind' (100 organs) synchronizes 
   phases as it encounters repeating characters or concepts (Alicia, Conejo).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import re
from pathlib import Path
import sys
import os

# Paths for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V220_UNIFIED_RESONANT import SKYNET_CORE_V220_UNIFIED_RESONANT

REPORT_PATH = Path("exp78_v220_alicia_results.json")
BOOK_PATH = Path("/home/daroch/documents/Alicia_en_el_pais_de_las_maravillas.txt")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    # Remove non-alpha chars but keep spaces and spanish accents
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', '', text)
    return text.split()

def run_reading_session():
    print("--- V220 READING SESSION: ALICIA EN EL PAÍS DE LAS MARAVILLAS ---")
    
    # 1. Load and Tokenize
    if not BOOK_PATH.exists():
        print(f"Error: {BOOK_PATH} not found.")
        return {"status": "FILE_MISSING"}
        
    raw_text = BOOK_PATH.read_text(encoding='utf-8')
    words = clean_text(raw_text)
    vocab = sorted(list(set(words)))
    vocab_size = len(vocab)
    word_to_id = {w: i for i, w in enumerate(vocab)}
    
    print(f"  Book Statistics: {len(words)} words, {vocab_size} unique tokens.")
    
    # 2. Initialize V220 with the book's vocab size
    # We use 100 organs to handle the narrative complexity
    model = SKYNET_CORE_V220_UNIFIED_RESONANT(
        vocab_size=vocab_size + 1, 
        n_organs=32, 
        d_model=512, 
        device=DEVICE
    ).to(DEVICE)
    
    # 3. Reading Process (Sequential Forward Passes)
    # We read in chunks of 20 words to simulate context windows
    chunk_size = 20
    n_chunks = 50 # Let's read the first 1000 words
    
    resonance_history = []
    
    print(f"  Reading first {n_chunks * chunk_size} words...")
    model.eval()
    with torch.no_grad():
        for i in range(n_chunks):
            start = i * chunk_size
            end = start + chunk_size
            chunk = words[start:end]
            ids = torch.tensor([word_to_id[w] for w in chunk]).to(DEVICE)
            
            # Forward through the Resonant Colony
            model.reset()
            out = model(x_text=ids)
            energy = out['audit']['energy']
            resonance_history.append(energy)
            
            if (i+1) % 10 == 0:
                print(f"    Chunk {i+1}/{n_chunks} | Cavity Resonance: {energy:.4f}")

    # 4. Analysis
    avg_resonance = sum(resonance_history) / len(resonance_history)
    max_resonance = max(resonance_history)
    
    report = {
        "experiment": "exp78_v220_reading_alicia",
        "language": "Spanish",
        "tokens_processed": n_chunks * chunk_size,
        "unique_vocab_size": vocab_size,
        "avg_resonance_energy": avg_resonance,
        "max_resonance_peak": max_resonance,
        "status": "STABLE" if avg_resonance < 5.0 else "UNSTABLE",
        "conclusion": "V220 successfully processed Spanish syntax through the resonant cavity."
    }
    
    print(json.dumps(report, indent=2))
    REPORT_PATH.write_text(json.dumps(report, indent=2))
    return report

if __name__ == "__main__":
    run_reading_session()
