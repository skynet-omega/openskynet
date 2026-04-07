"""
Exp88_V17: V402 Deep Autopsy (Black Box Inspection)
===================================================

Goal: Open the V402 brain and perform a "Medical Exam" on its cognition.
We will analyze:
1. Signal-to-Noise Ratio (SNR): Are the resonance peaks sharp or blurry?
2. Semantic Plasticity: If we change the subject, does the "Valence Wave" shift?
3. Organ Entropy: Are all 32 organs specialized or is the brain under-utilized?
4. The "Missing Link": Why does it correctly identify the subject but fail to 
   complete the sentence coherently?
"""

import torch
import torch.nn.functional as F
import re
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V402_THERMODYNAMIC import SKYNET_CORE_V402_THERMODYNAMIC

CHECKPOINT_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/EX/V402_ALICIA_THERMODYNAMIC.pth")
EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_autopsy():
    print("--- OPEN SKYNET: V402 BRAIN AUTOPSY ---")
    
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)
    
    model = SKYNET_CORE_V402_THERMODYNAMIC(
        vocab_size=vocab_size,
        n_organs=32, 
        n_nodes_per_organ=64, 
        d_feature=32,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)
    
    model.load_checkpoint(CHECKPOINT_PATH)
    model.eval()

    # --- TEST 1: RESONANCE LANDSCAPE ANALYSIS ---
    # We want to see how "sharp" the decision is.
    print("\n[TEST 1: ANALIZANDO EL PAISAJE DE RESONANCIA]")
    prompt = "alicia pensó que como el conejo tenía un reloj debía tener mucha prisa instruccion quién tenía prisa respuesta"
    words = clean_text(prompt)
    seq = [vocab_map[w] for w in words if w in vocab_map]
    x_input = torch.tensor([seq]).to(DEVICE)

    with torch.no_grad():
        model.reset()
        out = model(x_input, get_logits=True)
        # Raw resonance before Boltzmann
        logits = out['logits'][0, -1, :] # [V]
        
        # Calculate Signal-to-Noise Ratio
        top_v, top_i = torch.topk(logits, 10)
        mean_v = logits.mean()
        std_v = logits.std()
        snr = (top_v[0] - mean_v) / std_v
        
        print(f"  Confianza (SNR): {snr.item():.2f} desviaciones estándar sobre la media.")
        print("  Top 10 Resonancias (Candidatos ganadores):")
        for i in range(10):
            print(f"    {i+1}. {id_to_word[top_i[i].item()]:12} | Energía Relativa: {top_v[i].item():.4f}")

    # --- TEST 2: SEMANTIC PLASTICITY (Perturbation) ---
    print("\n[TEST 2: PRUEBA DE PLASTICIDAD SEMÁNTICA]")
    print("  ¿Qué pasa si cambiamos 'conejo' por 'sombrerero' en la memoria?")
    prompt_mod = prompt.replace("conejo", "sombrerero")
    words_mod = clean_text(prompt_mod)
    seq_mod = [vocab_map[w] for w in words_mod if w in vocab_map]
    x_input_mod = torch.tensor([seq_mod]).to(DEVICE)

    with torch.no_grad():
        model.reset()
        out_mod = model(x_input_mod, get_logits=True)
        logits_mod = out_mod['logits'][0, -1, :]
        top_v_mod, top_i_mod = torch.topk(logits_mod, 5)
        
        print("  Top 5 Candidatos con 'sombrerero' como sujeto:")
        for i in range(5):
            print(f"    {i+1}. {id_to_word[top_i_mod[i].item()]:12} | Energía: {top_v_mod[i].item():.4f}")

    # --- TEST 3: ORGAN SPECIALIZATION ---
    print("\n[TEST 3: ENTROPÍA DE LOS ÓRGANOS]")
    # We need to capture the energy_weights from the forward pass
    # Since I can't easily modify the forward now without re-writing, I'll use a hook or a manual step
    # Let's do a manual step for observation
    with torch.no_grad():
        batch, seq_len = x_input.shape
        h_in = model.input_norm(model.text_embed(x_input)) + model.pos_encoder[:, :seq_len, :]
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seq_len).to(model.device)
        h_ctx_seq = model.cortex(h_in, mask=causal_mask, is_causal=True)
        energy_weights = torch.softmax(model.router(h_ctx_seq), dim=-1) # [B, T, n_organs]
        
        # Calculate how many organs are actually being used (activation > 0.1)
        active_organs = (energy_weights[0, -1, :] > 0.05).sum().item()
        print(f"  Órganos activos en la decisión final: {active_organs} de {model.n_organs}")
        
        # Measure diversity of routing across the sequence
        routing_std = energy_weights[0].std(dim=0).mean().item()
        print(f"  Especialización (Std Dev de Routing): {routing_std:.4f} (Alto = Especializado, Bajo = Genérico)")

if __name__ == "__main__":
    run_autopsy()
