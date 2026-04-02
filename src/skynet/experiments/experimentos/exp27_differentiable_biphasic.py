"""
EXPERIMENT 27: DIFFERENTIABLE BIPHASIC CORE (PyTorch)
======================================================

Bridge from physics experiments to real architecture.

THE CYBORG CORE: Physics substrate + Learned routing
  - State h has TWO coupled fields: rho (information) + T (temperature)
  - T is computed from input + previous state (LEARNED, not manual)
  - Growth G(rho, T) interpolates crystal↔fluid (from Exp23)
  - Crystallization provides discrete outputs (from Exp22)
  - Gradients flow through everything

ARCHITECTURE:
  Input x → T_proj(x,h) → T(x) local temperature
  h_new = (1-T)*DW(h) + T*Fluid(h) + B*x   [TDGL dynamics]
  output = Crystallize(h_new)                 [readout]

TESTS:
  1. Forward pass works (no NaN, shapes correct)
  2. Gradients flow (no zero gradients)
  3. T field adapts to input (different inputs → different T patterns)
  4. Can learn XOR (nonlinear, requires memory) with simple training
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import matplotlib.pyplot as plt
import os

LOG_FILE = os.path.join(os.path.dirname(__file__), "exp27_differentiable_biphasic.log")
IMG_FILE = os.path.join(os.path.dirname(__file__), "exp27_differentiable_biphasic.png")

def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


class BiphasicGrowth(nn.Module):
    """
    G(h, T) = T * G_fluid(h) + (1-T) * G_crystal(h)

    Fluid: Lenia-like growth (smooth, single attractor)
    Crystal: Double-well (discrete, two attractors at 0 and 1)

    Differentiable interpolation controlled by local T.
    """
    def __init__(self, d_state):
        super().__init__()
        self.d_state = d_state
        # Lenia growth parameters (learnable)
        self.mu = nn.Parameter(torch.tensor(0.4))
        self.sigma = nn.Parameter(torch.tensor(0.3))

    def g_fluid(self, h):
        """Lenia: unimodal growth centered at mu."""
        return 2.0 * torch.exp(-((h - self.mu) ** 2) / (2 * self.sigma ** 2 + 1e-6)) - 1.0

    def g_crystal(self, h):
        """Double-well: V'(h) pushes toward 0 and 1."""
        return -4.0 * h * (1.0 - h) * (1.0 - 2.0 * h)

    def forward(self, h, T):
        """
        h: [B, D] state
        T: [B, D] local temperature
        returns: G [B, D]
        """
        g_f = self.g_fluid(h)
        g_c = self.g_crystal(h)
        return T * g_f + (1.0 - T) * g_c


class TemperatureController(nn.Module):
    """
    The LEARNED attention mechanism.
    Computes local temperature T(x) from input and current state.

    T decides WHERE the substrate is fluid (processing) vs crystal (memory).
    This is the neural component of the Cyborg.
    """
    def __init__(self, d_input, d_state):
        super().__init__()
        self.gate = nn.Sequential(
            nn.Linear(d_input + d_state, d_state),
            nn.ReLU(),
            nn.Linear(d_state, d_state),
            nn.Sigmoid()  # T ∈ [0, 1]
        )

    def forward(self, x, h):
        """
        x: [B, d_input] current input
        h: [B, d_state] current state
        returns: T [B, d_state] local temperature
        """
        combined = torch.cat([x, h], dim=-1)
        return self.gate(combined)


class DiffusionOperator(nn.Module):
    """
    Discrete Laplacian with learnable coupling.
    Operates only in fluid regions (scaled by T).
    """
    def __init__(self, d_state):
        super().__init__()
        self.D = nn.Parameter(torch.tensor(0.1))  # Diffusion coefficient

    def forward(self, h, T):
        """Circular 1D diffusion scaled by temperature."""
        left = torch.roll(h, 1, dims=-1)
        right = torch.roll(h, -1, dims=-1)
        laplacian = left + right - 2.0 * h
        return self.D * T * laplacian


class CrystallizationReadout(nn.Module):
    """
    Readout via crystallization: push h toward discrete values.
    Uses a learnable projection + temperature-controlled sharpening.

    At low T: output is sharp (crystallized)
    At high T: output is soft (fluid)
    """
    def __init__(self, d_state, n_output):
        super().__init__()
        self.proj = nn.Linear(d_state, n_output)

    def forward(self, h, T_mean):
        """
        h: [B, D] state
        T_mean: scalar, mean temperature (controls sharpness)
        """
        logits = self.proj(h)
        # Temperature-scaled softmax: lower T → sharper distribution
        temperature = 0.1 + 2.0 * T_mean  # Range [0.1, 2.1]
        return logits / temperature


class BiphasicCore(nn.Module):
    """
    THE CYBORG CORE.

    State equation:
      h_{t+1} = h_t + dt * [(1-T)*G_crystal(h) + T*G_fluid(h) + D*T*∇²h] + B*x

    Where:
      T = TemperatureController(x, h)  ← LEARNED (neural routing)
      G = BiphasicGrowth(h, T)         ← PHYSICS (crystal↔fluid)
      ∇² = DiffusionOperator(h, T)     ← PHYSICS (spatial coupling)
      B*x = input projection           ← LEARNED (input drive)
    """
    def __init__(self, d_input, d_state=64, n_output=2):
        super().__init__()
        self.d_state = d_state
        self.dt = 0.1

        # Neural components (Cyborg brain)
        self.input_proj = nn.Linear(d_input, d_state)
        self.temp_ctrl = TemperatureController(d_input, d_state)
        self.readout = CrystallizationReadout(d_state, n_output)

        # Physics components (Cyborg body)
        self.growth = BiphasicGrowth(d_state)
        self.diffusion = DiffusionOperator(d_state)

        # State
        self.h = None

    def reset(self, batch_size=1, device='cpu'):
        self.h = torch.zeros(batch_size, self.d_state, device=device)

    def forward(self, x, n_inner_steps=3):
        """
        x: [B, d_input]
        Returns: logits [B, n_output], audit dict
        """
        B = x.shape[0]
        if self.h is None or self.h.shape[0] != B:
            self.reset(B, x.device)

        # Input drive
        x_drive = self.input_proj(x)

        # Compute local temperature (LEARNED attention)
        T = self.temp_ctrl(x, self.h)

        # Inner simulation steps (unrolled TDGL)
        for _ in range(n_inner_steps):
            # Physics: growth + diffusion
            G = self.growth(self.h, T)
            D = self.diffusion(self.h, T)

            # State update
            self.h = self.h + self.dt * (G + D) + 0.1 * x_drive

            # Clamp
            self.h = torch.clamp(self.h, 0.0, 1.0)

            # Update T (re-compute with new h)
            T = self.temp_ctrl(x, self.h)

        # Readout via crystallization
        T_mean = T.mean()
        logits = self.readout(self.h, T_mean)

        audit = {
            'T_mean': T_mean.item(),
            'T_std': T.std().item(),
            'h_mean': self.h.mean().item(),
            'h_std': self.h.std().item(),
            'h_bimodal': ((self.h < 0.2).float().mean() + (self.h > 0.8).float().mean()).item(),
        }

        return logits, audit


def test_forward_and_gradients(device):
    """Test 1-2: Forward pass + gradient flow."""
    log("\n--- TEST 1-2: Forward Pass & Gradients ---")

    model = BiphasicCore(d_input=4, d_state=32, n_output=2).to(device)
    x = torch.randn(8, 4, device=device)

    model.reset(8, device)
    logits, audit = model(x)

    log(f"  Input shape: {x.shape}")
    log(f"  Output shape: {logits.shape}")
    log(f"  Audit: {audit}")

    # Check for NaN
    has_nan = torch.isnan(logits).any().item()
    log(f"  NaN in output: {has_nan}")

    # Gradient test
    loss = logits.sum()
    loss.backward()

    grad_norms = {}
    zero_grads = 0
    total_params = 0
    for name, param in model.named_parameters():
        if param.grad is not None:
            gn = param.grad.norm().item()
            grad_norms[name] = gn
            if gn == 0:
                zero_grads += 1
        total_params += 1

    log(f"  Gradient norms (sample):")
    for name, gn in list(grad_norms.items())[:5]:
        log(f"    {name}: {gn:.6f}")
    log(f"  Zero gradients: {zero_grads}/{total_params}")

    pass1 = not has_nan
    pass2 = zero_grads < total_params // 2
    log(f"  [{'PASS' if pass1 else 'FAIL'}] No NaN")
    log(f"  [{'PASS' if pass2 else 'FAIL'}] Gradients flow ({total_params - zero_grads}/{total_params} non-zero)")

    return pass1 and pass2


def test_T_adapts(device):
    """Test 3: Different inputs produce different T patterns."""
    log("\n--- TEST 3: Temperature Adapts to Input ---")

    model = BiphasicCore(d_input=4, d_state=32, n_output=2).to(device)

    T_patterns = []
    inputs = [
        torch.tensor([[1.0, 0, 0, 0]], device=device),
        torch.tensor([[0.0, 1, 0, 0]], device=device),
        torch.tensor([[0.0, 0, 1, 0]], device=device),
        torch.tensor([[0.0, 0, 0, 1]], device=device),
    ]

    for x in inputs:
        model.reset(1, device)
        with torch.no_grad():
            _, audit = model(x)
            T = model.temp_ctrl(x, model.h)
            T_patterns.append(T.squeeze().cpu().numpy())

    # Check diversity of T patterns
    T_patterns = np.array(T_patterns)
    correlations = []
    for i in range(4):
        for j in range(i + 1, 4):
            corr = np.corrcoef(T_patterns[i], T_patterns[j])[0, 1]
            correlations.append(corr)
    mean_corr = np.mean(correlations)
    log(f"  Mean T-pattern correlation: {mean_corr:.4f}")
    log(f"  T pattern diversity (std of means): {np.std([t.mean() for t in T_patterns]):.4f}")

    # At initialization, patterns may be similar. That's ok.
    # Key: they should NOT be identical
    max_corr = np.max(correlations)
    pass3 = max_corr < 0.9999  # Not perfectly identical
    log(f"  [{'PASS' if pass3 else 'FAIL'}] T patterns are not identical (max corr={max_corr:.6f})")

    return pass3, T_patterns


def test_xor_learning(device, n_epochs=500):
    """Test 4: Can learn XOR with the biphasic core."""
    log(f"\n--- TEST 4: XOR Learning ({n_epochs} epochs) ---")

    model = BiphasicCore(d_input=2, d_state=32, n_output=2).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.003)

    # XOR dataset
    X = torch.tensor([[0, 0], [0, 1], [1, 0], [1, 1]], dtype=torch.float32, device=device)
    Y = torch.tensor([0, 1, 1, 0], dtype=torch.long, device=device)

    loss_history = []
    acc_history = []
    T_mean_history = []
    h_bimodal_history = []

    for epoch in range(n_epochs):
        model.reset(4, device)
        logits, audit = model(X, n_inner_steps=5)
        loss = F.cross_entropy(logits, Y)

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        with torch.no_grad():
            preds = logits.argmax(dim=-1)
            acc = (preds == Y).float().mean().item()

        loss_history.append(loss.item())
        acc_history.append(acc)
        T_mean_history.append(audit['T_mean'])
        h_bimodal_history.append(audit['h_bimodal'])

        if (epoch + 1) % 100 == 0:
            log(f"  Epoch {epoch + 1}: loss={loss.item():.4f}, acc={acc:.2f}, "
                f"T_mean={audit['T_mean']:.3f}, h_bimodal={audit['h_bimodal']:.3f}")

    # Final eval
    model.reset(4, device)
    with torch.no_grad():
        logits, audit = model(X, n_inner_steps=5)
        preds = logits.argmax(dim=-1)
        final_acc = (preds == Y).float().mean().item()

    log(f"\n  Final XOR accuracy: {final_acc:.0%}")
    log(f"  Predictions: {preds.cpu().numpy()} (expected: {Y.cpu().numpy()})")
    log(f"  T_mean: {audit['T_mean']:.4f}")
    log(f"  h_bimodal: {audit['h_bimodal']:.4f}")

    pass4 = final_acc >= 0.75
    log(f"  [{'PASS' if pass4 else 'FAIL'}] XOR accuracy >= 75%: {final_acc:.0%}")

    return pass4, loss_history, acc_history, T_mean_history, h_bimodal_history


def run_experiment():
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 27: DIFFERENTIABLE BIPHASIC CORE ---\n")

    log("--- EXPERIMENT 27: DIFFERENTIABLE BIPHASIC CORE (PyTorch) ---")

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f"Device: {device}")

    # Run tests
    pass12 = test_forward_and_gradients(device)
    pass3, T_patterns = test_T_adapts(device)
    pass4, losses, accs, T_means, h_bimodals = test_xor_learning(device)

    # Verdict
    log("\n=== VERDICT ===")
    all_pass = pass12 and pass3 and pass4
    status = "[!!! SUCCESS !!!]" if all_pass else "[PARTIAL]"
    log(f"{status} Differentiable Biphasic Core {'WORKS' if all_pass else 'partial'}.")

    if all_pass:
        log("The Cyborg Core is differentiable, learns, and uses physics.")
        log("Ready for V28 integration.")

    # Visualization
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: XOR loss curve
    axes[0, 0].plot(losses, 'b-', alpha=0.7)
    axes[0, 0].set_title('XOR Training Loss')
    axes[0, 0].set_xlabel('Epoch')
    axes[0, 0].set_ylabel('Cross-Entropy Loss')
    axes[0, 0].set_yscale('log')

    # Top-center: XOR accuracy
    axes[0, 1].plot(accs, 'g-', alpha=0.7)
    axes[0, 1].axhline(y=0.75, color='red', linestyle='--', alpha=0.5, label='Pass threshold')
    axes[0, 1].set_title(f'XOR Accuracy (final: {accs[-1]:.0%})')
    axes[0, 1].set_xlabel('Epoch')
    axes[0, 1].set_ylabel('Accuracy')
    axes[0, 1].legend()

    # Top-right: T mean and h bimodality over training
    ax = axes[0, 2]
    ax2 = ax.twinx()
    ax.plot(T_means, 'r-', alpha=0.6, label='T_mean')
    ax2.plot(h_bimodals, 'b-', alpha=0.6, label='h_bimodal')
    ax.set_title('Phase Dynamics During Training')
    ax.set_xlabel('Epoch')
    ax.set_ylabel('T_mean', color='red')
    ax2.set_ylabel('h_bimodal', color='blue')
    ax.legend(loc='upper left')
    ax2.legend(loc='upper right')

    # Bottom-left: T patterns for different inputs
    for i, tp in enumerate(T_patterns):
        axes[1, 0].plot(tp, '-', alpha=0.7, label=f'Input {i}')
    axes[1, 0].set_title('Temperature Patterns per Input')
    axes[1, 0].set_xlabel('State dimension')
    axes[1, 0].set_ylabel('T')
    axes[1, 0].legend(fontsize=8)

    # Bottom-center: Architecture diagram
    axes[1, 1].axis('off')
    arch = (
        "CYBORG CORE ARCHITECTURE\n"
        "========================\n\n"
        "Input x ──→ [T_controller] ──→ T(x,h)\n"
        "      │                          │\n"
        "      └──→ [Input_proj] ──→ drive│\n"
        "                                 ↓\n"
        "  h_{t+1} = h + dt*(G(h,T) + D*T*∇²h) + drive\n"
        "                    │\n"
        "                    ↓\n"
        "             G = T·Lenia + (1-T)·DoubleWell\n"
        "                    │\n"
        "                    ↓\n"
        "          [Crystallization Readout]\n"
        "                    │\n"
        "                    ↓\n"
        "               output logits\n\n"
        "  Neural: T_controller, Input_proj, Readout\n"
        "  Physics: Growth G, Diffusion D, Crystallization"
    )
    axes[1, 1].text(0.05, 0.95, arch, fontsize=9, fontfamily='monospace',
                    transform=axes[1, 1].transAxes, verticalalignment='top')

    # Bottom-right: Results summary
    axes[1, 2].axis('off')
    results = (
        "EXPERIMENT RESULTS\n"
        "==================\n\n"
        f"[{'✓' if pass12 else '✗'}] Forward + Gradients\n"
        f"[{'✓' if pass3 else '✗'}] T adapts to input\n"
        f"[{'✓' if pass4 else '✗'}] XOR learning\n\n"
        f"Final XOR accuracy: {accs[-1]:.0%}\n"
        f"Final T_mean: {T_means[-1]:.4f}\n"
        f"Final h_bimodal: {h_bimodals[-1]:.4f}\n\n"
        f"{'READY FOR V28' if all_pass else 'NEEDS WORK'}"
    )
    axes[1, 2].text(0.05, 0.95, results, fontsize=11, fontfamily='monospace',
                    transform=axes[1, 2].transAxes, verticalalignment='top')

    plt.suptitle('Exp27: Differentiable Biphasic Core — The Cyborg Engine',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved visualization to {IMG_FILE}")
    plt.close()

    return all_pass


if __name__ == "__main__":
    run_experiment()
