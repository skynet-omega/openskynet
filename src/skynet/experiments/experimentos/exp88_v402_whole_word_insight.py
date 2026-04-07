"""
Exp88_V13: V402 Whole-Word Insight
==================================

Goal: Observe the internal cognition of the Thermodynamic Brain (V402)
now that it is operating exclusively on WHOLE CONCEPTS (Whole words)
using the custom ALICIA dictionary.
We eliminate sub-word tokenization. "Alicia" is one concept. "Reloj" is one concept.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import re
import sys
import os
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'EX'))
from SKYNET_CORE_V402_THERMODYNAMIC import SKYNET_CORE_V402_THERMODYNAMIC

EMBEDS_PATH = Path("/home/daroch/openskynet/src/skynet/experiments/experimentos/ALICIA_WHOLE_WORD_EMBEDS.pth")
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

def clean_text(text):
    text = text.lower()
    text = re.sub(r'[^a-záéíóúüñ\s]', ' ', text)
    return text.split()

def run_insight_test():
    print("--- OPEN SKYNET: V402 WHOLE-WORD COGNITION ANALYSIS ---")
    
    print(f"  Loading Whole-Word Dictionary...")
    knowledge = torch.load(EMBEDS_PATH, map_location='cpu')
    weights = knowledge['weights'].to(DEVICE)
    vocab_map = knowledge['vocab']
    id_to_word = {v: k for k, v in vocab_map.items()}
    vocab_size = len(vocab_map)
    print(f"  Dictionary size: {vocab_size} pure concepts.")

    # A complex, causal sentence from Alice
    texto_causal = "Alicia pensó que, como el conejo tenía un reloj, debía tener mucha prisa. Por lo tanto, corrió tras él."
    
    # Proper whole-word tokenization
    words = clean_text(texto_causal)
    seq = [vocab_map[w] for w in words if w in vocab_map]
    
    print(f"\n  [CAUSAL SEQUENCE TO LEARN]")
    print(f"  Words: {words}")
    print(f"  Length: {len(seq)} whole concepts.")

    # We use a small, observable brain
    n_organs = 4
    model = SKYNET_CORE_V402_THERMODYNAMIC(
        vocab_size=vocab_size,
        n_organs=n_organs, 
        n_nodes_per_organ=16, 
        d_feature=16,
        device=DEVICE,
        pretrained_embeds=weights
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    
    x_train = torch.tensor([seq[:-1]]).to(DEVICE)
    y_train = torch.tensor([seq[1:]]).to(DEVICE)

    print("\n  [OBSERVING THE LEARNING PROCESS]")
    model.train()
    
    for step in range(1, 301):
        model.reset()
        
        # --- Custom Forward Pass Extraction ---
        batch, seq_len = x_train.shape
        h_in = model.input_norm(model.text_embed(x_train)) + model.pos_encoder[:, :seq_len, :]
        causal_mask = nn.Transformer.generate_square_subsequent_mask(seq_len).to(model.device)
        h_ctx_seq = model.cortex(h_in, mask=causal_mask, is_causal=True)
        
        # Organ activation weights
        energy_weights = torch.softmax(model.router(h_ctx_seq), dim=-1) # [B, T, n_organs]
        
        for i in range(model.n_organs):
            model.h_freq_states[i] = torch.zeros(batch, model.freq_dim, dtype=torch.complex64, device=model.device)
                
        drive_times = [model.organ_projs[i](h_ctx_seq) for i in range(model.n_organs)]
        all_waves = []
        for t in range(seq_len):
            global_wave = torch.zeros(batch, model.freq_dim, dtype=torch.complex64, device=model.device)
            for i, organ in enumerate(model.organs):
                drive_time_t = drive_times[i][:, t, :] * energy_weights[:, t, i:i+1]
                drive_freq_t = torch.fft.rfft(drive_time_t, dim=-1, norm='ortho')
                model.h_freq_states[i] = organ(drive_freq_t, model.h_freq_states[i])
                global_wave = global_wave + model.h_freq_states[i]
                
            h_workspace_time = torch.fft.irfft(global_wave, n=model.n_res, dim=-1, norm='ortho')
            h_workspace_time = h_workspace_time + F.gelu(model.sys2_mixer(h_workspace_time))
            fused_state = torch.cat([h_ctx_seq[:, t, :], h_workspace_time], dim=-1)
            valence_time = model.valence_projector(fused_state)
            valence_wave_t = torch.fft.rfft(valence_time, dim=-1, norm='ortho')
            all_waves.append(valence_wave_t)
            
        valence_wave_seq = torch.stack(all_waves, dim=1)
        vocab_waves = model.get_vocab_waves()
        vocab_energy = (vocab_waves.real**2 + vocab_waves.imag**2).sum(dim=-1)
        real_part = torch.matmul(valence_wave_seq.real, vocab_waves.real.t())
        imag_part = torch.matmul(valence_wave_seq.imag, vocab_waves.imag.t())
        raw_resonance = real_part + imag_part
        normalized_resonance = raw_resonance / (vocab_energy.unsqueeze(0).unsqueeze(0) + 1e-4)
        logits = model.thalamus(normalized_resonance)
        
        # Loss calculation
        loss = F.cross_entropy(logits.view(-1, vocab_size), y_train.view(-1))
        
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        
        if step == 1 or step == 300:
            print(f"\n    --- STATS AT STEP {step} ---")
            print(f"    Loss: {loss.item():.4f}")
            
            # Print the resonance confidence for the first word prediction ("pens")
            target_id = y_train[0, 0].item()
            target_resonance = normalized_resonance[0, 0, target_id].item()
            mean_resonance = normalized_resonance[0, 0, :].mean().item()
            max_resonance = normalized_resonance[0, 0, :].max().item()
            print(f"    Resonance on target '{words[1]}': {target_resonance:.4f} (Mean noise: {mean_resonance:.4f}, Max: {max_resonance:.4f})")
            
            if step == 300:
                print("\n    [ORGAN SPECIALIZATION MAP (Energy Routing on Whole Words)]")
                # Print which organ is dominating for each word in the sequence
                for t in range(seq_len - 1):
                    in_word = words[t]
                    out_word = words[t+1]
                    weights_t = energy_weights[0, t, :].detach().cpu().numpy()
                    dominant_organ = weights_t.argmax()
                    print(f"    Context: '{in_word:10}' -> Pred: '{out_word:10}' | Dominant Organ: {dominant_organ} | Routing: {[f'{w:.2f}' for w in weights_t]}")

if __name__ == "__main__":
    run_insight_test()
