"""
Exp36: Brain Scaling — El telefono de lata vs fibra optica
===========================================================

Exp35 mostro que Holo-Variance gana en Participation Ratio (3.5 vs 2.7)
pero d_state=64 comprime brutalmente: solo 12.9% de la varianza del conectoma.

Pregunta: Si escalamos d_state, la informacion espectral adicional se traduce
en mejor aprendizaje?

Diseño: {Random, Holo-Var} x {64, 128, 256} = 6 configuraciones
- Random: h_phys=0.5 uniforme, bio_params=None
- Holo-Var: Top-K modes por varianza, Allen modulado

Varianza capturada por Holo-Var:
  d_state=64:  12.9%
  d_state=128: 25.8%
  d_state=256: 51.5%

Tarea: Simbiosis (exp34) — patron continuo + memoria secuencial
Metricas: test_acc, epochs_to_80, T_mean, participation_ratio, n_params
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import json
from datetime import datetime
from pathlib import Path

from SKYNET_V28_PHYSICAL_CYBORG import SKYNET_V28_PHYSICAL_CYBORG
from bio_initializer_holographic import get_holographic_bio_params, get_holographic_template
from experimentos.exp34_hard_bio_benchmark import (
    generate_symbiosis_data,
    compute_participation_ratio,
)

LOG_DIR = Path(__file__).parent
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

D_MODEL = 128
N_INPUT = 32
N_EPOCHS = 50
BATCH_SIZE = 64
WEIGHT_DECAY = 1e-4
LR = 1e-3
SEQ_LEN = 15
N_CLASSES = 2

D_STATES = [64, 128, 256]


# ============================================================
# MODEL WRAPPER
# ============================================================

class CyborgScaled(nn.Module):
    """Cyborg con d_state configurable."""
    def __init__(self, d_state, bio_params=None):
        super().__init__()
        self.model = SKYNET_V28_PHYSICAL_CYBORG(
            n_input=N_INPUT, n_actions=N_CLASSES,
            d_model=D_MODEL, d_state=d_state,
            device=DEVICE, bio_params=bio_params,
        )

    def reset(self):
        self.model.reset()

    def detach_states(self):
        self.model.detach_states()

    def forward(self, x, **kwargs):
        return self.model(x, training=kwargs.get('training', True))


# ============================================================
# TRAINING
# ============================================================

def train_and_eval(label, d_state, bio_params, train_seqs, train_Y, test_seqs, test_Y):
    """Entrena un Cyborg y evalua en simbiosis."""
    print(f"\n  [{label}] d_state={d_state}")

    model = CyborgScaled(d_state, bio_params).to(DEVICE)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"    Params: {n_params:,}")

    optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    criterion = nn.CrossEntropyLoss()

    n_train = len(train_seqs)
    n_test = len(test_seqs)

    curves = {'accuracy': [], 'loss': [], 'T_mean': [], 'pr': []}
    epochs_to_80 = N_EPOCHS

    for epoch in range(N_EPOCHS):
        model.train()
        perm = torch.randperm(n_train).tolist()
        correct = 0
        total_loss = 0
        epoch_T = []
        h_samples = []

        for idx in range(0, n_train, BATCH_SIZE):
            batch_idx = perm[idx:idx+BATCH_SIZE]
            model.reset()

            for t in range(SEQ_LEN):
                x_batch = torch.stack([train_seqs[i][t] for i in batch_idx]).to(DEVICE)
                out = model(x_batch, training=True)

            y_batch = train_Y[batch_idx]
            loss = criterion(out['logits'][:, :N_CLASSES], y_batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            model.detach_states()

            preds = out['logits'][:, :N_CLASSES].argmax(-1)
            correct += (preds == y_batch).sum().item()
            total_loss += loss.item()
            epoch_T.append(out['audit']['T_mean'])

            if model.model.organ.h_phys is not None:
                h_samples.append(model.model.organ.h_phys.detach().cpu())

        acc = correct / n_train * 100
        T_mean = np.mean(epoch_T)

        if h_samples:
            h_all = torch.cat(h_samples, dim=0)
            pr = compute_participation_ratio(list(h_all[-100:]))
        else:
            pr = 0.0

        curves['accuracy'].append(acc)
        curves['loss'].append(total_loss)
        curves['T_mean'].append(T_mean)
        curves['pr'].append(pr)

        if acc >= 80 and epochs_to_80 == N_EPOCHS:
            epochs_to_80 = epoch + 1

        if (epoch + 1) % 10 == 0:
            print(f"    Ep{epoch+1}: acc={acc:.1f}%, T={T_mean:.3f}, PR={pr:.1f}")

    # Test
    model.eval()
    test_correct = 0
    for i in range(0, n_test, BATCH_SIZE):
        batch_end = min(i + BATCH_SIZE, n_test)
        batch_idx = list(range(i, batch_end))
        model.reset()
        with torch.no_grad():
            for t in range(SEQ_LEN):
                x_batch = torch.stack([test_seqs[j][t] for j in batch_idx]).to(DEVICE)
                out = model(x_batch, training=False)
        preds = out['logits'][:, :N_CLASSES].argmax(-1)
        test_correct += (preds == test_Y[batch_idx]).sum().item()

    test_acc = test_correct / n_test * 100
    print(f"    Test: {test_acc:.1f}%, ep80={epochs_to_80}, T={curves['T_mean'][-1]:.3f}, PR={curves['pr'][-1]:.1f}")

    return {
        'test_acc': test_acc,
        'epochs_to_80': epochs_to_80,
        'n_params': n_params,
        'd_state': d_state,
        'T_mean_final': float(curves['T_mean'][-1]),
        'pr_final': float(curves['pr'][-1]),
        'curves': curves,
    }


# ============================================================
# MAIN
# ============================================================

def run_experiment():
    print("=" * 70)
    print("EXP36: BRAIN SCALING — TELEFONO DE LATA vs FIBRA OPTICA")
    print(f"Device: {DEVICE}")
    print(f"D_MODEL={D_MODEL}, D_STATES={D_STATES}")
    print(f"N_EPOCHS={N_EPOCHS}, BATCH_SIZE={BATCH_SIZE}")
    print("=" * 70)

    # Variance analysis
    print("\n--- Varianza Capturada por d_state (Holo-Var) ---")
    variance_report = {}
    for d in D_STATES:
        _, info = get_holographic_template('top_variance', d_state=d)
        variance_report[d] = info
        print(f"  d_state={d:>3d}: var_captured={info['var_captured_ratio']*100:.1f}%, "
              f"modes={info['n_modes_used']}/{info['n_modes_available']}")

    # Data
    print("\n--- Generando Datos ---")
    n_train, n_test = 2000, 500
    train_seqs, train_Y = generate_symbiosis_data(n_train, SEQ_LEN, seed=42)
    test_seqs, test_Y = generate_symbiosis_data(n_test, SEQ_LEN, seed=123)
    train_Y = train_Y.to(DEVICE)
    test_Y = test_Y.to(DEVICE)
    class_counts = [(train_Y == c).sum().item() for c in range(N_CLASSES)]
    print(f"  Train: {n_train}, balance: {class_counts}")

    # Configs: {Random, Holo-Var} x {64, 128, 256}
    print("\n" + "=" * 70)
    print("ENTRENAMIENTO: 6 CONFIGURACIONES")
    print("=" * 70)

    results = {}
    for d_state in D_STATES:
        # Random baseline
        label = f"Random-{d_state}"
        results[label] = train_and_eval(
            label, d_state, None,
            train_seqs, train_Y, test_seqs, test_Y,
        )

        # Holo-Var
        label = f"HoloVar-{d_state}"
        bio_params, _ = get_holographic_bio_params('top_variance', d_state=d_state)
        results[label] = train_and_eval(
            label, d_state, bio_params,
            train_seqs, train_Y, test_seqs, test_Y,
        )

    save_results(results, variance_report)
    print_summary(results, variance_report)
    return results


def save_results(results, variance_report):
    log_path = LOG_DIR / 'exp36_brain_scaling.log'

    def clean(obj):
        if isinstance(obj, dict):
            return {str(k): clean(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean(v) for v in obj]
        elif isinstance(obj, (np.floating, np.integer)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, torch.Tensor):
            return obj.item() if obj.numel() == 1 else obj.tolist()
        return obj

    report = {
        'experiment': 'Exp36: Brain Scaling',
        'timestamp': datetime.now().isoformat(),
        'device': DEVICE,
        'hypothesis': 'Escalar d_state libera informacion espectral comprimida y mejora aprendizaje.',
        'config': {
            'D_MODEL': D_MODEL, 'D_STATES': D_STATES,
            'N_EPOCHS': N_EPOCHS, 'BATCH_SIZE': BATCH_SIZE,
            'LR': LR, 'WEIGHT_DECAY': WEIGHT_DECAY,
        },
        'variance_analysis': clean(variance_report),
        'results': clean(results),
    }

    with open(log_path, 'w') as f:
        f.write(json.dumps(report, indent=2, default=str))
    print(f"\n[SAVED] {log_path}")

    # Plot
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle('Exp36: Brain Scaling — d_state={64, 128, 256}',
                     fontsize=14, fontweight='bold')

        # Color scheme: Random=dashed, HoloVar=solid; 64=blue, 128=orange, 256=red
        style = {
            'Random-64':  {'color': '#2196F3', 'ls': '--', 'alpha': 0.6},
            'HoloVar-64': {'color': '#2196F3', 'ls': '-',  'alpha': 1.0},
            'Random-128':  {'color': '#FF9800', 'ls': '--', 'alpha': 0.6},
            'HoloVar-128': {'color': '#FF9800', 'ls': '-',  'alpha': 1.0},
            'Random-256':  {'color': '#E91E63', 'ls': '--', 'alpha': 0.6},
            'HoloVar-256': {'color': '#E91E63', 'ls': '-',  'alpha': 1.0},
        }

        # Panel 1: Train Accuracy
        ax = axes[0, 0]
        for name, r in results.items():
            s = style.get(name, {'color': 'black', 'ls': '-', 'alpha': 1.0})
            ax.plot(r['curves']['accuracy'], color=s['color'], ls=s['ls'],
                    alpha=s['alpha'], label=f"{name} ({r['test_acc']:.1f}%)")
        ax.axhline(y=80, color='gray', ls='--', alpha=0.3)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Train Accuracy (%)')
        ax.set_title('Convergencia')
        ax.legend(fontsize=7)

        # Panel 2: Test Acc + Params bar chart
        ax = axes[0, 1]
        names = list(results.keys())
        test_accs = [results[n]['test_acc'] for n in names]
        bar_colors = [style.get(n, {}).get('color', 'gray') for n in names]
        alphas = [style.get(n, {}).get('alpha', 1.0) for n in names]
        bars = ax.bar(range(len(names)), test_accs, color=bar_colors)
        for bar, a in zip(bars, alphas):
            bar.set_alpha(a)
        ax.set_xticks(range(len(names)))
        ax.set_xticklabels(names, rotation=45, ha='right', fontsize=7)
        ax.set_ylabel('Test Accuracy (%)')
        ax.set_title('Test Accuracy Final')
        for i, n in enumerate(names):
            params_k = results[n]['n_params'] / 1000
            ax.text(i, test_accs[i] + 0.3, f'{params_k:.0f}K', ha='center', fontsize=7)

        # Panel 3: Participation Ratio
        ax = axes[1, 0]
        for name, r in results.items():
            s = style.get(name, {'color': 'black', 'ls': '-', 'alpha': 1.0})
            ax.plot(r['curves']['pr'], color=s['color'], ls=s['ls'],
                    alpha=s['alpha'], label=f"{name} ({r['pr_final']:.1f})")
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Participation Ratio')
        ax.set_title('Dimension Efectiva (PR)')
        ax.legend(fontsize=7)

        # Panel 4: Scaling summary
        ax = axes[1, 1]
        for init_type, marker, ls in [('Random', 'o', '--'), ('HoloVar', 's', '-')]:
            ds = []
            accs = []
            prs = []
            for d in D_STATES:
                key = f'{init_type}-{d}'
                if key in results:
                    ds.append(d)
                    accs.append(results[key]['test_acc'])
                    prs.append(results[key]['pr_final'])
            color_acc = '#4CAF50'
            color_pr = '#9C27B0'
            ax.plot(ds, accs, marker=marker, ls=ls, color=color_acc,
                    label=f'{init_type} acc', alpha=0.8 if init_type == 'HoloVar' else 0.5)
            ax2 = ax.twinx()
            ax2.plot(ds, prs, marker=marker, ls=ls, color=color_pr,
                     label=f'{init_type} PR', alpha=0.8 if init_type == 'HoloVar' else 0.5)

        ax.set_xlabel('d_state')
        ax.set_ylabel('Test Accuracy (%)', color=color_acc)
        ax2.set_ylabel('Participation Ratio', color=color_pr)
        ax.set_title('Scaling: d_state vs Performance')
        ax.set_xticks(D_STATES)
        lines1, labs1 = ax.get_legend_handles_labels()
        lines2, labs2 = ax2.get_legend_handles_labels()
        ax.legend(lines1 + lines2, labs1 + labs2, fontsize=7, loc='center right')

        plt.tight_layout()
        png_path = LOG_DIR / 'exp36_brain_scaling.png'
        plt.savefig(png_path, dpi=150)
        print(f"[SAVED] {png_path}")
        plt.close()
    except ImportError:
        print("[SKIP] matplotlib not available")


def print_summary(results, variance_report):
    print("\n" + "=" * 70)
    print("EXP36 SUMMARY: BRAIN SCALING")
    print("=" * 70)

    print(f"\n  {'Config':<16s} {'d_state':>7s} {'Params':>8s} {'Test%':>6s} {'Ep80':>5s} {'T_fin':>6s} {'PR':>6s} {'Var%':>6s}")
    print(f"  {'-'*62}")

    best_acc = max(r['test_acc'] for r in results.values())

    for name, r in results.items():
        d = r['d_state']
        var_pct = variance_report.get(d, {}).get('var_captured_ratio', 0) * 100
        if 'Random' in name:
            var_pct = 0.0
        marker = ' *' if r['test_acc'] == best_acc else '  '
        print(f"  {name:<16s} {d:>7d} {r['n_params']:>7,d} {r['test_acc']:>5.1f}%{marker}"
              f" {r['epochs_to_80']:>4d} {r['T_mean_final']:>6.3f} {r['pr_final']:>6.1f}"
              f" {var_pct:>5.1f}%")

    # Scaling analysis
    print(f"\n--- Analisis de Scaling ---")
    for init_type in ['Random', 'HoloVar']:
        print(f"\n  {init_type}:")
        prev_acc = None
        for d in D_STATES:
            key = f'{init_type}-{d}'
            if key in results:
                acc = results[key]['test_acc']
                pr = results[key]['pr_final']
                params = results[key]['n_params']
                delta = f"  (delta={acc - prev_acc:+.1f}%)" if prev_acc is not None else ""
                print(f"    d={d:>3d}: acc={acc:.1f}%, PR={pr:.1f}, params={params:,}{delta}")
                prev_acc = acc

    # Key question
    print(f"\n--- Pregunta Clave: Holo-Var se beneficia MAS del scaling? ---")
    for d in D_STATES:
        r_key = f'Random-{d}'
        h_key = f'HoloVar-{d}'
        if r_key in results and h_key in results:
            r_acc = results[r_key]['test_acc']
            h_acc = results[h_key]['test_acc']
            delta = h_acc - r_acc
            var_pct = variance_report.get(d, {}).get('var_captured_ratio', 0) * 100
            print(f"  d={d:>3d}: HoloVar-Random = {delta:+.1f}%, var_captured={var_pct:.1f}%")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    results = run_experiment()
