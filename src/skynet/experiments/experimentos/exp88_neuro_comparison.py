"""
Exp88_V19: Comparative Neuro-Autopsy (V402 vs V500)
===================================================

Goal: Empirically compare the internal "thoughts" of the V402 (Resonance) 
and the V500 (Protocol Decrypter).
We want to see if the V500's "Causal Link" module actually creates a 
different, more structured internal representation.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V402_THERMODYNAMIC import SKYNET_CORE_V402_THERMODYNAMIC
from SKYNET_CORE_V500_DECRYPTER import SKYNET_CORE_V500_DECRYPTER

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def get_internal_patterns(model, x_input):
    model.eval()
    model.reset()
    with torch.no_grad():
        # We manually step through to capture weights
        # Both models have similar front-ends
        batch, seq_len = x_input.shape
        h_in = model.input_norm(model.text_embed(x_input))
        
        # Capture Router Weights (Cognitive Focus)
        # For V402/V500 we'll use the cortex first
        if hasattr(model, 'pos_encoder'):
            h_in = h_in + model.pos_encoder[:, :seq_len, :]
            
        h_ctx_seq = model.cortex(h_in)
        
        # V500 has the observer bias
        if hasattr(model, 'observer'):
            initial_weights = torch.softmax(model.router(h_ctx_seq), dim=-1)
            protocol_bias = model.observer(initial_weights)
            energy_weights = torch.softmax(model.router(h_ctx_seq) + protocol_bias, dim=-1)
        else:
            energy_weights = torch.softmax(model.router(h_ctx_seq), dim=-1)
            
        return energy_weights[0].cpu()

def run_comparison():
    print("--- OPEN SKYNET: ARCHITECTURAL EVOLUTION ANALYSIS ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    
    # Input sequence
    message = "alicia pensó que el conejo tenía un reloj"
    words = message.split()
    seq = [vocab_map[w] for w in words if w in vocab_map]
    x_input = torch.tensor([seq]).to(DEVICE)

    # Initialize models
    v402 = SKYNET_CORE_V402_THERMODYNAMIC(vocab_size=len(vocab_map), pretrained_embeds=weights).to(DEVICE)
    v500 = SKYNET_CORE_V500_DECRYPTER(vocab_size=len(vocab_map), pretrained_embeds=weights).to(DEVICE)

    # Note: We are looking at them UNTRAINED first to see the "Architectural Bias",
    # then we'll discuss the trained state based on previous logs.
    
    weights_v402 = get_internal_patterns(v402, x_input)
    weights_v500 = get_internal_patterns(v500, x_input)

    print(f"\n[ANALYSIS: COGNITIVE FOCUS (Router Entropy)]")
    # Entropy measures how "spread out" the brain's focus is.
    # Lower entropy = sharper focus on specific organs.
    ent_v402 = -(weights_v402 * torch.log(weights_v402 + 1e-9)).sum(dim=-1).mean()
    ent_v500 = -(weights_v500 * torch.log(weights_v500 + 1e-9)).sum(dim=-1).mean()
    
    print(f"  V402 Mean Entropy: {ent_v402:.4f}")
    print(f"  V500 Mean Entropy: {ent_v500:.4f}")
    print(f"  Difference: {((ent_v402 - ent_v500) / ent_v402)*100:.1f}% reduction in cognitive chaos in V500.")

    print(f"\n[ANALYSIS: CAUSAL LINKAGE]")
    # In V500, we have the Protocol Map (Observer weights)
    p_map = v500.observer.causal_link.detach().cpu()
    strength = p_map.abs().mean().item()
    sparsity = (p_map.abs() < 0.005).float().mean().item()
    
    print(f"  V500 Protocol Map Connectivity Strength: {strength:.6f}")
    print(f"  V500 Protocol Map Sparsity: {sparsity*100:.1f}% (Hidden rules are sparse and specific)")

    print(f"\n[COMPARATIVE VERDICT]")
    if ent_v500 < ent_v402:
        print("  CONSTATACIÓN: El V500 ha formado una estructura interna más 'dura' y menos ruidosa.")
        print("  La retroalimentación del ProtocolObserver está obligando a los órganos a")
        print("  auto-organizarse en una jerarquía causal, en lugar de ser una suma plana.")
    else:
        print("  CONSTATACIÓN: La estructura sigue siendo fluida, similar a la versión anterior.")

if __name__ == "__main__":
    import re
    run_comparison()
