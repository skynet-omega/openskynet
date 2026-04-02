"""
Exp30: Spectral Diffusion vs Local Diffusion
==============================================

Tests:
  A. Propagation: Inject signal at position 0, measure steps until position 63 responds.
     Expected: Local ~64 steps, Spectral ~1 step.

  B. Pattern recognition: Same task as Exp28 with both diffusion modes.
     Expected: Spectral >= Local in accuracy, faster convergence.

  C. Supervised training: V28-Spectral vs V28-Local on sequence classification.
     Metrics: loss curve, T_mean evolution, h_bimodal, accuracy.
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

from SKYNET_V28_PHYSICAL_CYBORG import (
    BiphasicOrgan, BiphasicGrowth, SpectralDiffusion2D, LocalDiffusion1D,
    SKYNET_V28_PHYSICAL_CYBORG
)


LOG_DIR = Path(__file__).parent
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'


def test_A_propagation():
    """Test A: Signal propagation speed comparison."""
    print("\n" + "=" * 60)
    print("TEST A: Signal Propagation Speed")
    print("=" * 60)

    d_state = 64
    n_max_steps = 100
    results = {}

    for name, DiffClass in [("Local", LocalDiffusion1D), ("Spectral", SpectralDiffusion2D)]:
        diffusion = DiffClass(d_state).to(DEVICE)
        T_hot = torch.ones(1, d_state, device=DEVICE)

        h = torch.zeros(1, d_state, device=DEVICE)
        h[0, 0] = 1.0

        spread_history = []
        steps_to_63 = n_max_steps
        for step in range(1, n_max_steps + 1):
            delta = diffusion(h, T_hot)
            h = h + delta
            h = torch.clamp(h, 0.0, 1e6)

            h_norm = h[0] / (h[0].max() + 1e-8)
            n_active = (h_norm > 0.01).sum().item()
            spread_history.append(n_active)

            if n_active >= 63 and steps_to_63 == n_max_steps:
                steps_to_63 = step

            if step == 5:
                results[name] = {
                    'spread_after_1': spread_history[0],
                    'spread_after_5': n_active,
                    'spread_history': spread_history[:5],
                }

        results[name]['steps_to_reach_63'] = steps_to_63

        print(f"\n  {name} Diffusion:")
        print(f"    Spread after 1 step: {results[name]['spread_after_1']}/{d_state}")
        print(f"    Spread after 5 steps: {results[name]['spread_after_5']}/{d_state}")
        print(f"    Steps to reach pos 63: {steps_to_63}")

    return results


def test_B_pattern_recognition():
    """Test B: Pattern recognition accuracy comparison."""
    print("\n" + "=" * 60)
    print("TEST B: Pattern Recognition")
    print("=" * 60)

    n_patterns = 8
    seq_len = 20
    n_train = 1000
    n_test = 200
    batch_size = 32
    d_state = 64
    n_input = 658

    results = {}

    for name in ["Local", "Spectral"]:
        model = SKYNET_V28_PHYSICAL_CYBORG(
            n_input=n_input, n_actions=n_patterns, device=DEVICE
        ).to(DEVICE)

        if name == "Local":
            model.organ.diffusion = LocalDiffusion1D(d_state).to(DEVICE)

        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        criterion = nn.CrossEntropyLoss()

        torch.manual_seed(42)
        patterns = torch.randn(n_patterns, seq_len, n_input)

        train_X = []
        train_Y = []
        for _ in range(n_train):
            label = torch.randint(0, n_patterns, (1,)).item()
            # High noise to test robustness
            x = patterns[label] + 0.8 * torch.randn(seq_len, n_input)
            train_X.append(x)
            train_Y.append(label)

        train_X = torch.stack(train_X)
        train_Y = torch.tensor(train_Y)

        losses = []
        T_means = []
        h_bimodals = []

        model.train()
        for epoch in range(n_train // batch_size):
            model.reset()
            indices = torch.arange(epoch * batch_size, (epoch + 1) * batch_size)
            x_batch = train_X[indices].to(DEVICE)
            y_batch = train_Y[indices].to(DEVICE)

            # Sequential processing of batch
            for t in range(seq_len):
                out = model(x_batch[:, t], training=True)

            logits = out['logits']
            loss = criterion(logits, y_batch)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            model.detach_states()

            losses.append(loss.item())
            T_means.append(out['audit']['T_mean'])
            h_bimodals.append(out['audit']['h_bimodal'])

        # Evaluate
        model.eval()
        correct = 0
        with torch.no_grad():
            for i in range(0, n_test, batch_size):
                model.reset()
                end = min(i + batch_size, n_test)
                x_batch = patterns[torch.randint(0, n_patterns, (end-i,))].to(DEVICE) + 0.8 * torch.randn(end-i, seq_len, n_input, device=DEVICE)
                y_batch = torch.randint(0, n_patterns, (end-i,), device=DEVICE) # This is wrong in original, let's fix it

        # Fixed evaluation logic
        correct = 0
        for i in range(n_test):
            model.reset()
            label = torch.randint(0, n_patterns, (1,)).item()
            x_seq = (patterns[label] + 0.8 * torch.randn(seq_len, n_input)).to(DEVICE)
            with torch.no_grad():
                for t in range(seq_len):
                    out = model(x_seq[t:t+1], training=False)
            if out['logits'].argmax().item() == label:
                correct += 1

        accuracy = correct / n_test * 100

        results[name] = {
            'final_accuracy': accuracy,
            'final_loss': losses[-1],
            'T_mean_final': T_means[-1],
            'h_bimodal_final': h_bimodals[-1],
            'loss_curve': losses[-10:],
        }

        print(f"\n  {name} Diffusion:")
        print(f"    Accuracy: {accuracy:.1f}%")
        print(f"    Final loss: {losses[-1]:.4f}")
    return results


def test_C_training_comparison():
    """Test C: Full training comparison with metrics."""
    print("\n" + "=" * 60)
    print("TEST C: Training Comparison (Supervised)")
    print("=" * 60)

    n_classes = 8
    n_input = 658
    n_epochs = 100
    batch_size = 32

    results = {}

    for name in ["Local", "Spectral"]:
        model = SKYNET_V28_PHYSICAL_CYBORG(
            n_input=n_input, n_actions=n_classes, device=DEVICE
        ).to(DEVICE)

        if name == "Local":
            model.organ.diffusion = LocalDiffusion1D(64).to(DEVICE)

        optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
        criterion = nn.CrossEntropyLoss()

        torch.manual_seed(123)
        data_X = []
        data_Y = []
        for _ in range(512):
            label = torch.randint(0, n_classes, (1,)).item()
            x = torch.zeros(n_input)
            x[label * 80:(label + 1) * 80] = torch.randn(80) + 1.0
            data_X.append(x)
            data_Y.append(label)

        data_X = torch.stack(data_X)
        data_Y = torch.tensor(data_Y)

        loss_history = []
        acc_history = []
        T_history = []
        bimodal_history = []

        for epoch in range(n_epochs):
            model.train()
            epoch_loss = 0
            correct = 0

            # Shuffle
            perm = torch.randperm(len(data_X))
            X_shuffled = data_X[perm]
            Y_shuffled = data_Y[perm]

            for i in range(0, len(X_shuffled), batch_size):
                model.reset()
                x_batch = X_shuffled[i:i+batch_size].to(DEVICE)
                y_batch = Y_shuffled[i:i+batch_size].to(DEVICE)

                out = model(x_batch, training=True)
                loss = criterion(out['logits'], y_batch)

                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                model.detach_states()

                epoch_loss += loss.item() * x_batch.shape[0]
                correct += (out['logits'].argmax(dim=-1) == y_batch).sum().item()

            avg_loss = epoch_loss / len(data_X)
            acc = correct / len(data_X) * 100
            loss_history.append(avg_loss)
            acc_history.append(acc)
            T_history.append(out['audit']['T_mean'])
            bimodal_history.append(out['audit']['h_bimodal'])

        results[name] = {
            'final_accuracy': acc_history[-1],
            'final_loss': loss_history[-1],
            'T_mean_curve': T_history,
            'h_bimodal_curve': bimodal_history,
            'convergence_epoch_90': next(
                (i for i, a in enumerate(acc_history) if a >= 90), n_epochs
            ),
        }

        print(f"\n  {name} Diffusion:")
        print(f"    Final accuracy: {acc_history[-1]:.1f}%")

    return results


def save_results(results_A, results_B, results_C):
    """Save experiment results."""
    log_path = LOG_DIR / 'exp30_spectral_diffusion.log'

    report = {
        'experiment': 'Exp30: Spectral Diffusion vs Local',
        'timestamp': datetime.now().isoformat(),
        'device': DEVICE,
        'test_A_propagation': results_A,
        'test_B_pattern': results_B,
        'test_C_training': results_C,
    }

    with open(log_path, 'w') as f:
        f.write(json.dumps(report, indent=2, default=str))

    print(f"\n[SAVED] {log_path}")

    # Generate plot
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle('Exp30: Spectral vs Local Diffusion', fontsize=14)

        # A: Propagation speed
        ax = axes[0, 0]
        names = ['Local', 'Spectral']
        steps = [results_A[n]['steps_to_reach_63'] for n in names]
        ax.bar(names, steps, color=['#2196F3', '#FF5722'])
        ax.set_ylabel('Steps to reach pos 63')
        ax.set_title('A. Propagation Speed')
        for i, v in enumerate(steps):
            ax.text(i, v + 1, str(v), ha='center', fontweight='bold')

        # B: Pattern recognition accuracy
        ax = axes[0, 1]
        accs = [results_B[n]['final_accuracy'] for n in names]
        ax.bar(names, accs, color=['#2196F3', '#FF5722'])
        ax.set_ylabel('Accuracy (%)')
        ax.set_title('B. Pattern Recognition')
        ax.set_ylim(0, 105)
        for i, v in enumerate(accs):
            ax.text(i, v + 1, f'{v:.1f}%', ha='center', fontweight='bold')

        # C: Training curves
        ax = axes[1, 0]
        for n, c in zip(names, ['#2196F3', '#FF5722']):
            ax.plot(results_C[n]['T_mean_curve'], color=c, label=n)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('T_mean')
        ax.set_title('C. Temperature Evolution')
        ax.legend()

        ax = axes[1, 1]
        for n, c in zip(names, ['#2196F3', '#FF5722']):
            ax.plot(results_C[n]['h_bimodal_curve'], color=c, label=n)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('h_bimodal')
        ax.set_title('C. Bimodal Index')
        ax.legend()

        plt.tight_layout()
        png_path = LOG_DIR / 'exp30_spectral_diffusion.png'
        plt.savefig(png_path, dpi=150)
        print(f"[SAVED] {png_path}")
        plt.close()
    except ImportError:
        print("[SKIP] matplotlib not available for plotting")


if __name__ == "__main__":
    print("=" * 60)
    print("EXP30: SPECTRAL DIFFUSION vs LOCAL DIFFUSION")
    print("=" * 60)

    results_A = test_A_propagation()
    results_B = test_B_pattern_recognition()
    results_C = test_C_training_comparison()
    save_results(results_A, results_B, results_C)

    print("\n" + "=" * 60)
    print("EXP30 COMPLETE")
    print("=" * 60)
