"""
Exp35: Proyeccion Holografica — Se desperdicia el potencial biologico?
=====================================================================

Hipotesis:
  "Una inicializacion que conserva mas informacion espectral del conectoma
   produce un BiphasicOrgan que converge mas rapido o generaliza mejor
   en tareas que requieren patron continuo."

Compara 4 inicializaciones en la tarea de Simbiosis (de exp34):

| Config              | Template h_phys          | Bio params           |
|---------------------|--------------------------|----------------------|
| Random              | 0.5 uniforme             | Defaults escalares   |
| Current             | basis_64.mean()          | Allen sinteticos     |
| Holographic-PCA     | SVD de basis_512         | Allen + mod PCA      |
| Holographic-Variance| Top-64 modes varianza    | Allen + mod varianza |

Metricas: test_acc, epochs_to_80, T_mean, participation_ratio
Datos: 2000 train / 500 test, 50 epochs
Output: exp35_holographic_init.log y exp35_holographic_init.png
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import json
import math
from datetime import datetime
from pathlib import Path

from SKYNET_V28_PHYSICAL_CYBORG import (
    SKYNET_V28_PHYSICAL_CYBORG,
    BiphasicOrgan,
)
from bio_initializer_holographic import get_holographic_template, get_holographic_bio_params
from experimentos.exp34_hard_bio_benchmark import (
    generate_symbiosis_data,
    CyborgBenchmark,
    compute_participation_ratio,
)

LOG_DIR = Path(__file__).parent
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

D_STATE = 64
D_MODEL = 128
N_INPUT = 32
N_EPOCHS = 50
BATCH_SIZE = 64
WEIGHT_DECAY = 1e-4
LR = 1e-3
SEQ_LEN = 15
N_CLASSES = 2


# ============================================================
# INITIALIZATION CONFIGS
# ============================================================

def build_configs():
    """
    Define las 4 configuraciones de inicializacion.
    Retorna dict {name: bio_params_or_None}.
    """
    configs = {}

    # 1. Random: sin bio_params, h_phys=0.5 uniforme (default del Organ)
    configs['Random'] = None

    # 2. Current: baseline actual (basis_64.mean + Allen)
    try:
        bio_current, info_current = get_holographic_bio_params('current', d_state=D_STATE)
        configs['Current'] = bio_current
        print(f"  [Current] var_captured={info_current['var_captured_ratio']:.4f}")
    except Exception as e:
        print(f"  [Current] SKIP: {e}")
        configs['Current'] = None

    # 3. Holographic-PCA: SVD de basis_512
    try:
        bio_pca, info_pca = get_holographic_bio_params('pca', d_state=D_STATE)
        configs['Holo-PCA'] = bio_pca
        print(f"  [Holo-PCA] var_captured={info_pca['var_captured_ratio']:.4f}, "
              f"improvement={info_pca.get('improvement_over_baseline', 'N/A')}x")
    except Exception as e:
        print(f"  [Holo-PCA] SKIP: {e}")
        configs['Holo-PCA'] = None

    # 4. Holographic-Variance: top-64 modes por varianza
    try:
        bio_var, info_var = get_holographic_bio_params('top_variance', d_state=D_STATE)
        configs['Holo-Var'] = bio_var
        print(f"  [Holo-Var] var_captured={info_var['var_captured_ratio']:.4f}, "
              f"improvement={info_var.get('improvement_over_baseline', 'N/A')}x")
    except Exception as e:
        print(f"  [Holo-Var] SKIP: {e}")
        configs['Holo-Var'] = None

    return configs


def create_cyborg_with_init(bio_params):
    """Crea un CyborgBenchmark con bio_params especificos."""
    model = SKYNET_V28_PHYSICAL_CYBORG(
        n_input=N_INPUT, n_actions=N_CLASSES,
        d_model=D_MODEL, d_state=D_STATE,
        device=DEVICE, bio_params=bio_params,
    )
    return model


class CyborgWrapper(nn.Module):
    """Wrapper para mantener interfaz compatible con exp34."""
    def __init__(self, bio_params=None):
        super().__init__()
        self.model = create_cyborg_with_init(bio_params)

    def reset(self):
        self.model.reset()

    def detach_states(self):
        self.model.detach_states()

    def forward(self, x, **kwargs):
        return self.model(x, training=kwargs.get('training', True))


# ============================================================
# TRAINING LOOP
# ============================================================

def train_and_eval(config_name, bio_params, train_seqs, train_Y, test_seqs, test_Y):
    """
    Entrena un Cyborg con la inicializacion dada y evalua en simbiosis.
    """
    print(f"\n  [{config_name}]")

    model = CyborgWrapper(bio_params).to(DEVICE)
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
        epoch_T_means = []
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
            epoch_T_means.append(out['audit']['T_mean'])

            if model.model.organ.h_phys is not None:
                h_samples.append(model.model.organ.h_phys.detach().cpu())

        acc = correct / n_train * 100
        T_mean = np.mean(epoch_T_means)

        # Participation ratio
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
    final_T = curves['T_mean'][-1]
    final_pr = curves['pr'][-1]
    print(f"    Test Acc: {test_acc:.1f}%, Epochs to 80%: {epochs_to_80}, "
          f"T_final={final_T:.3f}, PR_final={final_pr:.1f}")

    return {
        'test_acc': test_acc,
        'epochs_to_80': epochs_to_80,
        'n_params': n_params,
        'T_mean_final': float(final_T),
        'pr_final': float(final_pr),
        'curves': curves,
    }


# ============================================================
# MAIN
# ============================================================

def run_experiment():
    print("=" * 70)
    print("EXP35: PROYECCION HOLOGRAFICA — SE DESPERDICIA EL POTENCIAL BIOLOGICO?")
    print(f"Device: {DEVICE}")
    print(f"N_INPUT={N_INPUT}, D_MODEL={D_MODEL}, D_STATE={D_STATE}")
    print(f"N_EPOCHS={N_EPOCHS}, BATCH_SIZE={BATCH_SIZE}")
    print(f"LR={LR}, WEIGHT_DECAY={WEIGHT_DECAY}")
    print("=" * 70)

    # Variance analysis
    print("\n--- Analisis de Varianza Previo ---")
    variance_report = {}
    for method in ['current', 'pca', 'top_variance']:
        try:
            _, info = get_holographic_template(method, d_state=D_STATE)
            variance_report[method] = info
            print(f"  {method}: var_captured={info['var_captured_ratio']:.4f} "
                  f"({info['var_captured_ratio']*100:.1f}%)")
        except Exception as e:
            print(f"  {method}: ERROR - {e}")

    # Build configs
    print("\n--- Configuraciones ---")
    configs = build_configs()

    # Generate data
    print("\n--- Generando Datos Simbiosis ---")
    n_train, n_test = 2000, 500
    train_seqs, train_Y = generate_symbiosis_data(n_train, SEQ_LEN, seed=42)
    test_seqs, test_Y = generate_symbiosis_data(n_test, SEQ_LEN, seed=123)
    train_Y = train_Y.to(DEVICE)
    test_Y = test_Y.to(DEVICE)

    class_counts = [(train_Y == c).sum().item() for c in range(N_CLASSES)]
    print(f"  Train: {n_train} samples, class balance: {class_counts}")
    print(f"  Test:  {n_test} samples")

    # Run each config
    print("\n" + "=" * 70)
    print("ENTRENAMIENTO COMPARATIVO")
    print("=" * 70)

    results = {}
    for name, bio_params in configs.items():
        results[name] = train_and_eval(
            name, bio_params, train_seqs, train_Y, test_seqs, test_Y
        )

    # Save and report
    save_results(results, variance_report)
    print_summary(results, variance_report)

    return results


def save_results(results, variance_report):
    """Save log and plot."""
    log_path = LOG_DIR / 'exp35_holographic_init.log'

    def clean(obj):
        if isinstance(obj, dict):
            return {k: clean(v) for k, v in obj.items()}
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
        'experiment': 'Exp35: Proyeccion Holografica',
        'timestamp': datetime.now().isoformat(),
        'device': DEVICE,
        'hypothesis': (
            'Una inicializacion que conserva mas informacion espectral del conectoma '
            'produce un BiphasicOrgan que converge mas rapido o generaliza mejor.'
        ),
        'config': {
            'N_INPUT': N_INPUT, 'D_MODEL': D_MODEL, 'D_STATE': D_STATE,
            'N_EPOCHS': N_EPOCHS, 'BATCH_SIZE': BATCH_SIZE,
            'LR': LR, 'WEIGHT_DECAY': WEIGHT_DECAY,
            'SEQ_LEN': SEQ_LEN, 'N_CLASSES': N_CLASSES,
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
        fig.suptitle('Exp35: Proyeccion Holografica — Inicializacion Biologica',
                     fontsize=14, fontweight='bold')

        colors = {
            'Random': '#9E9E9E',
            'Current': '#2196F3',
            'Holo-PCA': '#E91E63',
            'Holo-Var': '#4CAF50',
        }

        # Panel 1: Train Accuracy
        ax = axes[0, 0]
        for name, r in results.items():
            ax.plot(r['curves']['accuracy'], color=colors.get(name, 'black'),
                    label=f"{name} (test={r['test_acc']:.1f}%)")
        ax.axhline(y=80, color='gray', linestyle='--', alpha=0.5, label='80% threshold')
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Train Accuracy (%)')
        ax.set_title('Convergencia: Train Accuracy')
        ax.legend(fontsize=8)

        # Panel 2: Test Accuracy Bar
        ax = axes[0, 1]
        names = list(results.keys())
        test_accs = [results[n]['test_acc'] for n in names]
        ep80s = [results[n]['epochs_to_80'] for n in names]
        bar_colors = [colors.get(n, 'black') for n in names]

        bars = ax.bar(names, test_accs, color=bar_colors, alpha=0.8)
        ax.set_ylabel('Test Accuracy (%)')
        ax.set_title('Test Accuracy Final')
        # Add epoch labels on bars
        for bar, ep in zip(bars, ep80s):
            height = bar.get_height()
            ep_label = f'ep80={ep}' if ep < N_EPOCHS else 'no 80%'
            ax.text(bar.get_x() + bar.get_width()/2., height + 0.5,
                    ep_label, ha='center', va='bottom', fontsize=8)

        # Panel 3: T_mean evolution
        ax = axes[1, 0]
        for name, r in results.items():
            ax.plot(r['curves']['T_mean'], color=colors.get(name, 'black'),
                    label=name)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('T_mean')
        ax.set_title('Evolucion de Temperatura Media')
        ax.legend(fontsize=8)

        # Panel 4: Participation Ratio
        ax = axes[1, 1]
        for name, r in results.items():
            ax.plot(r['curves']['pr'], color=colors.get(name, 'black'),
                    label=f"{name} (final={r['pr_final']:.1f})")
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Participation Ratio')
        ax.set_title('Dimension Efectiva del Estado (PR)')
        ax.legend(fontsize=8)

        plt.tight_layout()
        png_path = LOG_DIR / 'exp35_holographic_init.png'
        plt.savefig(png_path, dpi=150)
        print(f"[SAVED] {png_path}")
        plt.close()
    except ImportError:
        print("[SKIP] matplotlib not available")


def print_summary(results, variance_report):
    print("\n" + "=" * 70)
    print("EXP35 SUMMARY: PROYECCION HOLOGRAFICA")
    print("=" * 70)

    # Variance report
    print("\n--- Varianza Capturada por Metodo ---")
    for method, info in variance_report.items():
        var_pct = info['var_captured_ratio'] * 100
        print(f"  {method:15s}: {var_pct:6.1f}% de varianza total")

    # Results table
    print(f"\n--- Resultados Comparativos (Simbiosis) ---")
    print(f"  {'Config':<15s} {'Test Acc':>8s} {'Ep->80%':>8s} {'T_final':>8s} {'PR_final':>9s}")
    print(f"  {'-'*50}")

    best_acc = max(r['test_acc'] for r in results.values())
    best_ep = min(r['epochs_to_80'] for r in results.values())

    for name, r in results.items():
        acc_marker = ' *' if r['test_acc'] == best_acc else '  '
        ep_marker = ' *' if r['epochs_to_80'] == best_ep else '  '
        print(f"  {name:<15s} {r['test_acc']:>7.1f}%{acc_marker}"
              f" {r['epochs_to_80']:>6d}{ep_marker}"
              f" {r['T_mean_final']:>8.3f}"
              f" {r['pr_final']:>9.1f}")

    # Hypothesis test
    print(f"\n--- Evaluacion de Hipotesis ---")
    random_acc = results.get('Random', {}).get('test_acc', 0)
    current_acc = results.get('Current', {}).get('test_acc', 0)
    pca_acc = results.get('Holo-PCA', {}).get('test_acc', 0)
    var_acc = results.get('Holo-Var', {}).get('test_acc', 0)

    holo_best = max(pca_acc, var_acc)
    holo_best_name = 'Holo-PCA' if pca_acc >= var_acc else 'Holo-Var'

    print(f"  Holografico vs Random:  {holo_best:.1f}% vs {random_acc:.1f}% "
          f"(delta={holo_best - random_acc:+.1f}%) "
          f"{'PASS' if holo_best > random_acc else 'FAIL'}")
    print(f"  Holografico vs Current: {holo_best:.1f}% vs {current_acc:.1f}% "
          f"(delta={holo_best - current_acc:+.1f}%) "
          f"{'PASS' if holo_best > current_acc else 'FAIL'}")
    print(f"  Mejor metodo holografico: {holo_best_name}")

    # Convergence speed
    random_ep = results.get('Random', {}).get('epochs_to_80', N_EPOCHS)
    current_ep = results.get('Current', {}).get('epochs_to_80', N_EPOCHS)
    pca_ep = results.get('Holo-PCA', {}).get('epochs_to_80', N_EPOCHS)
    var_ep = results.get('Holo-Var', {}).get('epochs_to_80', N_EPOCHS)
    holo_best_ep = min(pca_ep, var_ep)

    print(f"\n  Convergencia (epochs to 80%):")
    print(f"    Random:  {random_ep}, Current: {current_ep}")
    print(f"    PCA:     {pca_ep}, Variance: {var_ep}")
    if holo_best_ep < current_ep:
        print(f"    Holografico converge {current_ep - holo_best_ep} epochs mas rapido")
    elif holo_best_ep > current_ep:
        print(f"    Current converge {holo_best_ep - current_ep} epochs mas rapido")
    else:
        print(f"    Misma velocidad de convergencia")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    results = run_experiment()
