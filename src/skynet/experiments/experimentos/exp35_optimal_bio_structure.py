"""
Exp35: Decodificar la Estructura Optima Allen/MICrONs
=====================================================

Problema central: si tomamos bio-params al azar, puede que no sirvan.
Necesitamos entender QUE propiedades biologicas ayudan.

A) Allen - Ablacion de Propiedades:
  1. mu_only      - Solo heterogeneidad de mu
  2. sigma_only   - Solo heterogeneidad de sigma
  3. ei_ratio     - Solo ratio E/I (51E:13I)
  4. crystal_only - Solo crystal_strength heterogeneo
  5. full         - Allen completo
  6. ei_inverted  - E/I invertido (control)

B) MICrONs - Modos Espectrales:
  1. low  (0-3)   - Componente global
  2. mid  (4-15)  - Circuitos meso
  3. high (16-63) - Detalle local
  4. all  (0-63)  - Todos los modos
  5. random_ortho - Random orthogonal basis (control)

C) Combinaciones Optimas:
  Combinar los mejores de A y B.

Tarea de evaluacion: XOR + Memory (las mas discriminantes de Exp34).
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import torch.nn as nn
import numpy as np
import json
from datetime import datetime
from pathlib import Path

from SKYNET_V28_PHYSICAL_CYBORG import SKYNET_V28_PHYSICAL_CYBORG
from bio_initializer import (
    load_allen_ablation_params,
    get_microns_selective_template,
    get_random_orthogonal_template,
)

LOG_DIR = Path(__file__).parent
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

D_STATE = 64
D_MODEL = 128
N_INPUT = 658
N_EPOCHS = 60
BATCH_SIZE = 32


# ============================================================
# TASK GENERATORS (from Exp34)
# ============================================================

def generate_xor_data(n_samples, n_classes=4, seed=42):
    torch.manual_seed(seed)
    np.random.seed(seed)
    n_features = 20
    pair_indices = np.random.choice(n_features, size=(n_classes, 2), replace=False)
    X = torch.randn(n_samples, N_INPUT) * 0.5
    for i in range(n_features):
        X[:, i] = (torch.randn(n_samples) > 0).float()
    Y = torch.zeros(n_samples, dtype=torch.long)
    for i in range(n_samples):
        xor_bits = []
        for c in range(n_classes):
            a = X[i, pair_indices[c, 0]].item() > 0.5
            b = X[i, pair_indices[c, 1]].item() > 0.5
            xor_bits.append(int(a) ^ int(b))
        Y[i] = sum(b * (2 ** idx) for idx, b in enumerate(xor_bits)) % n_classes
    return X, Y


def generate_sequential_memory_data(n_samples, seq_len=12, n_classes=8, seed=42):
    torch.manual_seed(seed)
    delay = 5
    all_sequences = []
    all_targets = []
    for _ in range(n_samples):
        labels = torch.randint(0, n_classes, (seq_len,))
        seq_inputs = []
        for t in range(seq_len):
            x = torch.zeros(N_INPUT)
            x[labels[t].item()] = 1.0
            x += torch.randn(N_INPUT) * 0.1
            seq_inputs.append(x)
        target_pos = max(0, seq_len - 1 - delay)
        all_sequences.append(seq_inputs)
        all_targets.append(labels[target_pos].item())
    return all_sequences, torch.tensor(all_targets)


# ============================================================
# CONFIG BUILDERS
# ============================================================

def build_allen_config(ablation):
    """Build bio_params for an Allen ablation."""
    bp = load_allen_ablation_params(ablation, d_state=D_STATE)
    return bp


def build_microns_config(mode_range, name='microns'):
    """Build bio_params with specific spectral modes."""
    template = get_microns_selective_template(mode_range=mode_range, d_state=D_STATE)
    return {
        'mu': torch.full((D_STATE,), 0.4),
        'sigma': torch.full((D_STATE,), 0.3),
        'crystal_strength': torch.full((D_STATE,), 1.0),
        'lambda_base': torch.full((D_STATE,), 0.02),
        'init_template': template,
    }


def build_random_ortho_config():
    """Random orthogonal basis (control)."""
    template = get_random_orthogonal_template(d_state=D_STATE, seed=42)
    return {
        'mu': torch.full((D_STATE,), 0.4),
        'sigma': torch.full((D_STATE,), 0.3),
        'crystal_strength': torch.full((D_STATE,), 1.0),
        'lambda_base': torch.full((D_STATE,), 0.02),
        'init_template': template,
    }


def build_combined_config(allen_ablation, mode_range):
    """Combine Allen ablation with MICrONs modes."""
    bp = load_allen_ablation_params(allen_ablation, d_state=D_STATE)
    template = get_microns_selective_template(mode_range=mode_range, d_state=D_STATE)
    bp['init_template'] = template
    return bp


# ============================================================
# TRAINING/EVAL
# ============================================================

def train_eval_xor(bio_params, config_name, n_classes=4):
    """Quick XOR eval: return test accuracy and metrics."""
    n_train, n_test = 600, 150
    X_train, Y_train = generate_xor_data(n_train, n_classes, seed=42)
    X_test, Y_test = generate_xor_data(n_test, n_classes, seed=123)
    X_train, Y_train = X_train.to(DEVICE), Y_train.to(DEVICE)
    X_test, Y_test = X_test.to(DEVICE), Y_test.to(DEVICE)

    model = SKYNET_V28_PHYSICAL_CYBORG(
        n_input=N_INPUT, n_actions=n_classes, d_model=D_MODEL,
        d_state=D_STATE, device=DEVICE, bio_params=bio_params
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss()

    epochs_to_80 = N_EPOCHS
    acc_curve = []

    for epoch in range(N_EPOCHS):
        model.train()
        perm = torch.randperm(n_train)
        correct = 0
        for i in range(0, n_train, BATCH_SIZE):
            model.reset()
            xb = X_train[perm[i:i+BATCH_SIZE]]
            yb = Y_train[perm[i:i+BATCH_SIZE]]
            out = model(xb, training=True)
            loss = criterion(out['logits'], yb)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            model.detach_states()
            correct += (out['logits'].argmax(-1) == yb).sum().item()

        acc = correct / n_train * 100
        acc_curve.append(acc)
        if acc >= 80 and epochs_to_80 == N_EPOCHS:
            epochs_to_80 = epoch + 1

    model.eval()
    model.reset()
    with torch.no_grad():
        out = model(X_test, training=False)
    test_acc = (out['logits'].argmax(-1) == Y_test).float().mean().item() * 100

    return {
        'config': config_name,
        'test_acc': test_acc,
        'epochs_to_80': epochs_to_80,
        'final_T_mean': out['audit']['T_mean'],
        'final_h_bimodal': out['audit']['h_bimodal'],
        'acc_curve': acc_curve,
    }


def train_eval_memory(bio_params, config_name, n_classes=8):
    """Quick Memory eval."""
    seq_len = 12
    n_train, n_test = 400, 100
    train_seqs, train_Y = generate_sequential_memory_data(n_train, seq_len, n_classes, seed=42)
    test_seqs, test_Y = generate_sequential_memory_data(n_test, seq_len, n_classes, seed=123)
    train_Y = train_Y.to(DEVICE)
    test_Y = test_Y.to(DEVICE)

    model = SKYNET_V28_PHYSICAL_CYBORG(
        n_input=N_INPUT, n_actions=n_classes, d_model=D_MODEL,
        d_state=D_STATE, device=DEVICE, bio_params=bio_params
    ).to(DEVICE)

    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    criterion = nn.CrossEntropyLoss()

    epochs_to_80 = N_EPOCHS
    acc_curve = []

    for epoch in range(N_EPOCHS):
        model.train()
        perm = torch.randperm(n_train).tolist()
        correct = 0
        for idx in range(0, n_train, BATCH_SIZE):
            batch_idx = perm[idx:idx+BATCH_SIZE]
            model.reset()
            for t in range(seq_len):
                x_batch = torch.stack([train_seqs[i][t] for i in batch_idx]).to(DEVICE)
                out = model(x_batch, training=True)
            y_batch = train_Y[batch_idx]
            loss = criterion(out['logits'][:, :n_classes], y_batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            model.detach_states()
            correct += (out['logits'][:, :n_classes].argmax(-1) == y_batch).sum().item()

        acc = correct / n_train * 100
        acc_curve.append(acc)
        if acc >= 80 and epochs_to_80 == N_EPOCHS:
            epochs_to_80 = epoch + 1

    model.eval()
    test_correct = 0
    for i in range(n_test):
        model.reset()
        with torch.no_grad():
            for t in range(seq_len):
                x = test_seqs[i][t].unsqueeze(0).to(DEVICE)
                out = model(x, training=False)
        if out['logits'][0, :n_classes].argmax().item() == test_Y[i].item():
            test_correct += 1

    test_acc = test_correct / n_test * 100

    return {
        'config': config_name,
        'test_acc': test_acc,
        'epochs_to_80': epochs_to_80,
        'final_T_mean': out['audit']['T_mean'],
        'final_h_bimodal': out['audit']['h_bimodal'],
        'acc_curve': acc_curve,
    }


# ============================================================
# EXPERIMENT PHASES
# ============================================================

def phase_A_allen_ablation():
    """Phase A: Allen ablation study."""
    print("\n" + "=" * 60)
    print("PHASE A: ALLEN ABLATION")
    print("=" * 60)

    ablations = [
        ('Random', None),
        ('Allen-mu_only', 'mu_only'),
        ('Allen-sigma_only', 'sigma_only'),
        ('Allen-ei_ratio', 'ei_ratio'),
        ('Allen-crystal_only', 'crystal_only'),
        ('Allen-full', 'full'),
        ('Allen-ei_inverted', 'ei_inverted'),
    ]

    results = []
    for name, abl in ablations:
        print(f"\n  {name}...")
        bio_params = build_allen_config(abl) if abl else None
        r_xor = train_eval_xor(bio_params, f"{name}-XOR")
        r_mem = train_eval_memory(bio_params, f"{name}-Mem")
        combined = {
            'config': name,
            'xor_test': r_xor['test_acc'],
            'xor_ep80': r_xor['epochs_to_80'],
            'mem_test': r_mem['test_acc'],
            'mem_ep80': r_mem['epochs_to_80'],
            'avg_test': (r_xor['test_acc'] + r_mem['test_acc']) / 2,
        }
        results.append(combined)
        print(f"    XOR: {r_xor['test_acc']:.1f}% (ep80={r_xor['epochs_to_80']})")
        print(f"    Mem: {r_mem['test_acc']:.1f}% (ep80={r_mem['epochs_to_80']})")

    return results


def phase_B_microns_modes():
    """Phase B: MICrONs spectral mode selection."""
    print("\n" + "=" * 60)
    print("PHASE B: MICrONs SPECTRAL MODES")
    print("=" * 60)

    mode_configs = [
        ('MICrONs-low(0-3)', (0, 4)),
        ('MICrONs-mid(4-15)', (4, 16)),
        ('MICrONs-high(16-63)', (16, 64)),
        ('MICrONs-all(0-63)', None),
        ('Random-Orthogonal', 'random'),
    ]

    results = []
    for name, modes in mode_configs:
        print(f"\n  {name}...")
        if modes == 'random':
            bio_params = build_random_ortho_config()
        else:
            bio_params = build_microns_config(modes, name)

        r_xor = train_eval_xor(bio_params, f"{name}-XOR")
        r_mem = train_eval_memory(bio_params, f"{name}-Mem")
        combined = {
            'config': name,
            'xor_test': r_xor['test_acc'],
            'xor_ep80': r_xor['epochs_to_80'],
            'mem_test': r_mem['test_acc'],
            'mem_ep80': r_mem['epochs_to_80'],
            'avg_test': (r_xor['test_acc'] + r_mem['test_acc']) / 2,
        }
        results.append(combined)
        print(f"    XOR: {r_xor['test_acc']:.1f}% (ep80={r_xor['epochs_to_80']})")
        print(f"    Mem: {r_mem['test_acc']:.1f}% (ep80={r_mem['epochs_to_80']})")

    return results


def phase_C_optimal_combo(allen_results, microns_results):
    """Phase C: Combine best Allen + best MICrONs."""
    print("\n" + "=" * 60)
    print("PHASE C: OPTIMAL COMBINATIONS")
    print("=" * 60)

    # Find best Allen (excluding Random and inverted)
    allen_ranked = sorted(
        [r for r in allen_results if 'inverted' not in r['config'] and r['config'] != 'Random'],
        key=lambda r: r['avg_test'],
        reverse=True
    )
    best_allen = allen_ranked[0] if allen_ranked else None

    # Find best MICrONs (excluding random ortho)
    microns_ranked = sorted(
        [r for r in microns_results if 'Random' not in r['config']],
        key=lambda r: r['avg_test'],
        reverse=True
    )
    best_microns = microns_ranked[0] if microns_ranked else None

    print(f"  Best Allen: {best_allen['config']} (avg={best_allen['avg_test']:.1f}%)")
    print(f"  Best MICrONs: {best_microns['config']} (avg={best_microns['avg_test']:.1f}%)")

    # Map config name to ablation type
    allen_map = {
        'Allen-mu_only': 'mu_only',
        'Allen-sigma_only': 'sigma_only',
        'Allen-ei_ratio': 'ei_ratio',
        'Allen-crystal_only': 'crystal_only',
        'Allen-full': 'full',
    }
    # Map MICrONs name to mode_range
    microns_map = {
        'MICrONs-low(0-3)': (0, 4),
        'MICrONs-mid(4-15)': (4, 16),
        'MICrONs-high(16-63)': (16, 64),
        'MICrONs-all(0-63)': None,
    }

    best_allen_abl = allen_map.get(best_allen['config'], 'full')
    best_microns_modes = microns_map.get(best_microns['config'], None)

    # Combo 1: Best Allen + Best MICrONs
    combo_name = f"OPTIMAL({best_allen['config']}+{best_microns['config']})"
    print(f"\n  Combo: {combo_name}")
    bio_params = build_combined_config(best_allen_abl, best_microns_modes)
    r_xor = train_eval_xor(bio_params, f"{combo_name}-XOR")
    r_mem = train_eval_memory(bio_params, f"{combo_name}-Mem")
    combo_result = {
        'config': combo_name,
        'xor_test': r_xor['test_acc'],
        'xor_ep80': r_xor['epochs_to_80'],
        'mem_test': r_mem['test_acc'],
        'mem_ep80': r_mem['epochs_to_80'],
        'avg_test': (r_xor['test_acc'] + r_mem['test_acc']) / 2,
        'allen_component': best_allen['config'],
        'microns_component': best_microns['config'],
    }
    print(f"    XOR: {r_xor['test_acc']:.1f}% (ep80={r_xor['epochs_to_80']})")
    print(f"    Mem: {r_mem['test_acc']:.1f}% (ep80={r_mem['epochs_to_80']})")

    # Combo 2: Full Allen + All MICrONs (baseline combo)
    print(f"\n  Baseline Combo: Full-Bio (Allen-full + MICrONs-all)")
    bio_full = build_combined_config('full', None)
    r_xor_full = train_eval_xor(bio_full, "Full-Bio-XOR")
    r_mem_full = train_eval_memory(bio_full, "Full-Bio-Mem")
    full_result = {
        'config': 'Full-Bio',
        'xor_test': r_xor_full['test_acc'],
        'xor_ep80': r_xor_full['epochs_to_80'],
        'mem_test': r_mem_full['test_acc'],
        'mem_ep80': r_mem_full['epochs_to_80'],
        'avg_test': (r_xor_full['test_acc'] + r_mem_full['test_acc']) / 2,
    }
    print(f"    XOR: {r_xor_full['test_acc']:.1f}%")
    print(f"    Mem: {r_mem_full['test_acc']:.1f}%")

    return [combo_result, full_result]


# ============================================================
# SAVE & PLOT
# ============================================================

def save_results(allen_results, microns_results, combo_results):
    log_path = LOG_DIR / 'exp35_optimal_bio_structure.log'

    report = {
        'experiment': 'Exp35: Optimal Bio Structure',
        'timestamp': datetime.now().isoformat(),
        'device': DEVICE,
        'phase_A_allen': allen_results,
        'phase_B_microns': microns_results,
        'phase_C_optimal': combo_results,
    }

    with open(log_path, 'w') as f:
        f.write(json.dumps(report, indent=2, default=str))
    print(f"\n[SAVED] {log_path}")

    # Plot
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(1, 3, figsize=(20, 6))
        fig.suptitle('Exp35: Optimal Bio Structure', fontsize=14, fontweight='bold')

        # Phase A: Allen ablation
        ax = axes[0]
        names = [r['config'] for r in allen_results]
        xor_accs = [r['xor_test'] for r in allen_results]
        mem_accs = [r['mem_test'] for r in allen_results]
        x = np.arange(len(names))
        w = 0.35
        ax.bar(x - w/2, xor_accs, w, label='XOR', color='#2196F3')
        ax.bar(x + w/2, mem_accs, w, label='Memory', color='#FF9800')
        ax.set_xticks(x)
        ax.set_xticklabels([n.replace('Allen-', '') for n in names], rotation=30, ha='right')
        ax.set_ylabel('Test Accuracy (%)')
        ax.set_title('Phase A: Allen Ablation')
        ax.legend()

        # Phase B: MICrONs modes
        ax = axes[1]
        names = [r['config'] for r in microns_results]
        xor_accs = [r['xor_test'] for r in microns_results]
        mem_accs = [r['mem_test'] for r in microns_results]
        x = np.arange(len(names))
        ax.bar(x - w/2, xor_accs, w, label='XOR', color='#2196F3')
        ax.bar(x + w/2, mem_accs, w, label='Memory', color='#FF9800')
        ax.set_xticks(x)
        ax.set_xticklabels([n.replace('MICrONs-', '') for n in names], rotation=30, ha='right')
        ax.set_ylabel('Test Accuracy (%)')
        ax.set_title('Phase B: MICrONs Spectral Modes')
        ax.legend()

        # Phase C: Combinations
        ax = axes[2]
        all_results = allen_results + microns_results + combo_results
        random_r = next((r for r in all_results if r['config'] == 'Random'), None)
        # Sort by avg_test for ranking
        ranked = sorted(all_results, key=lambda r: r['avg_test'], reverse=True)[:8]
        names = [r['config'] for r in ranked]
        avgs = [r['avg_test'] for r in ranked]
        colors = ['#4CAF50' if r['config'] == combo_results[0]['config'] else
                  '#FF9800' if 'Allen' in r['config'] else
                  '#2196F3' if 'MICrON' in r['config'] else
                  '#9E9E9E' for r in ranked]
        ax.barh(range(len(names)), avgs, color=colors)
        ax.set_yticks(range(len(names)))
        ax.set_yticklabels([n[:25] for n in names])
        ax.set_xlabel('Average Test Accuracy (%)')
        ax.set_title('Phase C: Top Configurations')
        if random_r:
            ax.axvline(x=random_r['avg_test'], color='red', linestyle='--',
                       label=f"Random baseline ({random_r['avg_test']:.1f}%)")
            ax.legend()

        plt.tight_layout()
        png_path = LOG_DIR / 'exp35_optimal_bio_structure.png'
        plt.savefig(png_path, dpi=150)
        print(f"[SAVED] {png_path}")
        plt.close()
    except ImportError:
        print("[SKIP] matplotlib not available")


# ============================================================
# MAIN
# ============================================================

if __name__ == "__main__":
    print("=" * 70)
    print("EXP35: OPTIMAL BIO STRUCTURE")
    print("=" * 70)

    allen_results = phase_A_allen_ablation()
    microns_results = phase_B_microns_modes()
    combo_results = phase_C_optimal_combo(allen_results, microns_results)

    save_results(allen_results, microns_results, combo_results)

    # Final summary
    print("\n" + "=" * 70)
    print("EXP35 FINAL SUMMARY")
    print("=" * 70)
    all_r = allen_results + microns_results + combo_results
    all_r.sort(key=lambda r: r['avg_test'], reverse=True)
    print(f"{'Rank':>4} {'Config':<30} {'XOR%':>6} {'Mem%':>6} {'Avg%':>6}")
    print("-" * 60)
    for i, r in enumerate(all_r):
        print(f"{i+1:>4} {r['config']:<30} "
              f"{r['xor_test']:>5.1f}% {r['mem_test']:>5.1f}% {r['avg_test']:>5.1f}%")
    print("=" * 70)
