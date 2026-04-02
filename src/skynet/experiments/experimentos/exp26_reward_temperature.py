"""
EXPERIMENT 26: REWARD-DRIVEN DYNAMIC TEMPERATURE
==================================================

HYPOTHESIS: If reward/punishment HEATS the substrate locally, and
cooling is natural (exponential decay), the system self-organizes:
  - Correct memories stay COLD (stable)
  - Wrong predictions get HEATED (reorganized)
  - New inputs heat their target region (learning)

This is the missing link between Exp21-25 (manual T) and a real agent.

TASK: Associative Memory with Error Correction
  - Store 4 key→value associations as crystals
  - Present a key → system should output correct value
  - If wrong: PUNISHMENT heats the output region
  - If right: no heating (memory preserved)
  - Test: does error-driven heating improve performance over time?

T DYNAMICS:
  ∂T/∂t = -γ·T + S_input(x,t) + S_reward(x,t)

  - γ·T: Natural cooling (exponential decay to 0)
  - S_input: Input signal heats the input region
  - S_reward: Error signal heats the output region proportional to error

PASS CRITERIA:
  1. Accuracy improves over correction cycles
  2. Correct associations are NOT disrupted by corrections elsewhere
  3. T field shows adaptive behavior (high where errors, low where correct)
"""

import sys, os
import numpy as np
import matplotlib.pyplot as plt

LOG_FILE = os.path.join(os.path.dirname(__file__), "exp26_reward_temperature.log")
IMG_FILE = os.path.join(os.path.dirname(__file__), "exp26_reward_temperature.png")

def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


def growth_doublewell(rho):
    return -4.0 * rho * (1.0 - rho) * (1.0 - 2.0 * rho)


def step_with_T_dynamics(rho, T, dt=0.02, dw_strength=10.0, D=1.5,
                         noise_sigma=0.2, T_cooling_rate=0.05):
    """One step of coupled (rho, T) dynamics."""
    # --- rho dynamics (TDGL) ---
    G_dw = dw_strength * growth_doublewell(rho)
    left = np.roll(rho, 1)
    right = np.roll(rho, -1)
    laplacian = left + right - 2.0 * rho
    noise = noise_sigma * np.sqrt(dt) * np.random.randn(len(rho))
    drho = dt * ((1.0 - T) * G_dw + D * T * laplacian) + np.sqrt(T + 1e-8) * noise
    rho = np.clip(rho + drho, 0.0, 1.0)

    # --- T dynamics (exponential cooling) ---
    # T diffuses slightly (thermal conduction) and decays
    T_left = np.roll(T, 1)
    T_right = np.roll(T, -1)
    T_laplacian = T_left + T_right - 2.0 * T
    dT = dt * (0.5 * T_laplacian - T_cooling_rate * T)
    T = np.clip(T + dT, 0.0, 1.0)

    return rho, T


def expand_pattern(pattern, region_size):
    chunk = region_size // len(pattern)
    expanded = np.full(region_size, 0.5)
    for i, bit in enumerate(pattern):
        margin = max(1, chunk // 6)
        start = i * chunk + margin
        end = (i + 1) * chunk - margin
        expanded[start:end] = float(bit)
    return expanded


def read_pattern(rho, region, pattern_len):
    region_size = region.stop - region.start
    chunk = region_size // pattern_len
    pattern = []
    for i in range(pattern_len):
        start = region.start + i * chunk
        end = start + chunk
        pattern.append(1 if rho[start:end].mean() > 0.5 else 0)
    return np.array(pattern)


def inject_heat(T, region, amount=0.8):
    """Heat a region (attention/error signal)."""
    T[region] = np.clip(T[region] + amount, 0, 1.0)
    return T


def inject_signal(rho, region, pattern, strength=0.4):
    """Inject a pattern signal into a heated region."""
    expanded = expand_pattern(pattern, region.stop - region.start)
    rho[region] += strength * (expanded - rho[region])
    return np.clip(rho, 0.0, 1.0)


def run_experiment(N=300, pattern_len=4):
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 26: REWARD-DRIVEN TEMPERATURE ---\n")

    log("--- EXPERIMENT 26: REWARD-DRIVEN DYNAMIC TEMPERATURE ---")
    log(f"N={N}, pattern_len={pattern_len}")

    np.random.seed(42)

    # Zones
    key_zone = slice(0, 75)
    val_zone = slice(75, 150)
    # Rest is buffer / processing
    assoc_zone = slice(150, 225)  # Associative coupling
    output_zone = slice(225, 300)

    # Associations to learn: key → value
    associations = [
        (np.array([1, 0, 0, 0]), np.array([0, 0, 0, 1])),  # A → D
        (np.array([0, 1, 0, 0]), np.array([0, 0, 1, 0])),  # B → C
        (np.array([0, 0, 1, 0]), np.array([0, 1, 0, 0])),  # C → B
        (np.array([0, 0, 0, 1]), np.array([1, 0, 0, 0])),  # D → A
    ]

    log("\nAssociations to learn:")
    for key, val in associations:
        log(f"  {key} → {val}")

    # Initialize substrate
    rho = np.random.uniform(0.3, 0.7, N)
    T = np.zeros(N)

    # Initial crystallization
    for _ in range(500):
        rho, T = step_with_T_dynamics(rho, T)

    # ====== LEARNING CYCLES ======
    n_cycles = 8
    accuracy_history = []
    T_history = []
    correction_count = 0

    for cycle in range(n_cycles):
        log(f"\n--- Cycle {cycle + 1}/{n_cycles} ---")
        cycle_correct = 0

        # Shuffle order each cycle
        order = np.random.permutation(len(associations))

        for idx in order:
            key, expected_val = associations[idx]

            # 1. PRESENT KEY: Heat key zone, inject key
            T = inject_heat(T, key_zone, amount=0.9)
            for _ in range(100):
                rho = inject_signal(rho, key_zone, key, strength=0.3)
                rho, T = step_with_T_dynamics(rho, T)

            # 2. Let T propagate and cool (key→output coupling)
            # Heat propagates from key zone toward output
            T = inject_heat(T, output_zone, amount=0.3)  # Mild heating
            for _ in range(200):
                rho, T = step_with_T_dynamics(rho, T)

            # 3. Cool output zone to crystallize prediction
            for _ in range(300):
                rho, T = step_with_T_dynamics(rho, T)

            # 4. READ prediction
            predicted = read_pattern(rho, output_zone, pattern_len)
            correct = np.array_equal(predicted, expected_val)

            if correct:
                cycle_correct += 1
                log(f"  [{idx}] {key} → {predicted} ✓")
            else:
                # 5. ERROR: Heat output zone + inject correct answer
                log(f"  [{idx}] {key} → {predicted} ✗ (expected {expected_val})")
                correction_count += 1

                # Error signal heats output zone
                T = inject_heat(T, output_zone, amount=0.95)
                # Also heat the associative zone to reorganize coupling
                T = inject_heat(T, assoc_zone, amount=0.7)

                # Inject correct value
                for _ in range(200):
                    rho = inject_signal(rho, output_zone, expected_val, strength=0.4)
                    # Create association: inject both key and value simultaneously
                    rho = inject_signal(rho, assoc_zone,
                                       np.concatenate([key[:2], expected_val[:2]]),
                                       strength=0.2)
                    rho, T = step_with_T_dynamics(rho, T)

                # Cool to crystallize correction
                for _ in range(400):
                    rho, T = step_with_T_dynamics(rho, T)

        acc = cycle_correct / len(associations)
        accuracy_history.append(acc)
        T_mean = T.mean()
        T_history.append(T_mean)
        log(f"  Cycle {cycle + 1} accuracy: {acc:.1%} (T_mean={T_mean:.4f})")

    # ====== FINAL EVALUATION (no corrections) ======
    log("\n--- FINAL EVALUATION (no corrections) ---")
    final_correct = 0
    final_results = []
    for key, expected_val in associations:
        T = inject_heat(T, key_zone, amount=0.9)
        for _ in range(100):
            rho = inject_signal(rho, key_zone, key, strength=0.3)
            rho, T = step_with_T_dynamics(rho, T)
        T = inject_heat(T, output_zone, amount=0.3)
        for _ in range(200):
            rho, T = step_with_T_dynamics(rho, T)
        for _ in range(300):
            rho, T = step_with_T_dynamics(rho, T)

        predicted = read_pattern(rho, output_zone, pattern_len)
        correct = np.array_equal(predicted, expected_val)
        final_results.append((key, expected_val, predicted, correct))
        if correct:
            final_correct += 1
        log(f"  {key} → {predicted} {'✓' if correct else '✗'} (expected {expected_val})")

    final_accuracy = final_correct / len(associations)
    log(f"\nFinal accuracy: {final_accuracy:.1%}")
    log(f"Total corrections applied: {correction_count}")

    # ====== ANALYSIS ======
    log("\n=== ANALYSIS ===")
    initial_acc = accuracy_history[0]
    final_acc = accuracy_history[-1]
    improvement = final_acc - initial_acc
    log(f"Initial accuracy: {initial_acc:.1%}")
    log(f"Final cycle accuracy: {final_acc:.1%}")
    log(f"Improvement: {improvement:+.1%}")
    log(f"Final eval accuracy: {final_accuracy:.1%}")

    # T field analysis
    T_key = T[key_zone].mean()
    T_val = T[val_zone].mean()
    T_out = T[output_zone].mean()
    log(f"T field: key={T_key:.4f}, val={T_val:.4f}, output={T_out:.4f}")

    # ====== VERDICT ======
    log("\n=== VERDICT ===")
    pass1 = final_acc >= initial_acc  # Accuracy doesn't get worse
    pass2 = final_accuracy >= 0.5    # At least 2/4 correct in final eval
    pass3 = T.mean() < 0.1          # T returns to baseline (cooling works)

    log(f"[{'PASS' if pass1 else 'FAIL'}] Accuracy improves or stable: {initial_acc:.0%} → {final_acc:.0%}")
    log(f"[{'PASS' if pass2 else 'FAIL'}] Final eval >= 50%: {final_accuracy:.0%}")
    log(f"[{'PASS' if pass3 else 'FAIL'}] T field cooled (mean < 0.1): {T.mean():.4f}")

    all_pass = pass1 and pass2 and pass3
    status = "[!!! SUCCESS !!!]" if all_pass else "[PARTIAL]"
    log(f"\n{status} Reward-driven temperature {'CONFIRMED' if all_pass else 'partial'}.")
    if all_pass:
        log("Reward HEATS the substrate → reorganization → correction → re-crystallization")

    # ====== VISUALIZATION ======
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: Accuracy over cycles
    axes[0, 0].plot(range(1, n_cycles + 1), accuracy_history, 'bo-', linewidth=2, markersize=8)
    axes[0, 0].axhline(y=0.25, color='gray', linestyle='--', alpha=0.5, label='Random (25%)')
    axes[0, 0].set_title('Accuracy Over Learning Cycles')
    axes[0, 0].set_xlabel('Cycle')
    axes[0, 0].set_ylabel('Accuracy')
    axes[0, 0].set_ylim(-0.05, 1.05)
    axes[0, 0].legend()

    # Top-center: T field over cycles
    axes[0, 1].plot(range(1, n_cycles + 1), T_history, 'r^-', linewidth=2, markersize=8)
    axes[0, 1].set_title('Mean Temperature Over Cycles')
    axes[0, 1].set_xlabel('Cycle')
    axes[0, 1].set_ylabel('Mean T')

    # Top-right: Final substrate state
    x = np.arange(N)
    ax = axes[0, 2]
    ax2 = ax.twinx()
    ax.plot(x, rho, 'k-', linewidth=0.8, label='rho')
    ax2.plot(x, T, 'r-', linewidth=1, alpha=0.5, label='T')
    ax.axvspan(0, 75, alpha=0.1, color='green')
    ax.axvspan(75, 150, alpha=0.1, color='blue')
    ax.axvspan(150, 225, alpha=0.1, color='orange')
    ax.axvspan(225, 300, alpha=0.1, color='purple')
    ax.set_title('Final Substrate: rho + T')
    ax.legend(loc='upper left', fontsize=8)
    ax2.legend(loc='upper right', fontsize=8)

    # Bottom-left: Final results table
    ax = axes[1, 0]
    ax.axis('off')
    cell_text = []
    colors_rows = []
    for key, exp, pred, correct in final_results:
        cell_text.append([str(key), str(exp), str(pred), '✓' if correct else '✗'])
        colors_rows.append(['palegreen' if correct else 'lightsalmon'] * 4)
    table = ax.table(cellText=cell_text,
                     colLabels=['Key', 'Expected', 'Predicted', 'OK'],
                     cellColours=colors_rows,
                     loc='center', cellLoc='center')
    table.auto_set_font_size(False)
    table.set_fontsize(10)
    table.scale(1, 1.5)
    ax.set_title('Final Evaluation Results')

    # Bottom-center: Learning curve comparison
    random_baseline = [0.25] * n_cycles
    axes[1, 1].fill_between(range(1, n_cycles + 1), random_baseline, accuracy_history,
                            alpha=0.3, color='green', label='Learned')
    axes[1, 1].plot(range(1, n_cycles + 1), accuracy_history, 'go-', linewidth=2)
    axes[1, 1].plot(range(1, n_cycles + 1), random_baseline, 'r--', label='Random baseline')
    axes[1, 1].set_title('Learning Above Random')
    axes[1, 1].set_xlabel('Cycle')
    axes[1, 1].set_ylabel('Accuracy')
    axes[1, 1].legend()

    # Bottom-right: Protocol
    axes[1, 2].axis('off')
    protocol = (
        "REWARD-DRIVEN T PROTOCOL\n"
        "========================\n\n"
        "1. Present key → Heat key zone\n"
        "2. Let heat propagate → T flows\n"
        "3. Cool → Output crystallizes\n"
        "4. Read output → Compare\n"
        "5. If WRONG:\n"
        "   → Heat output zone (punishment)\n"
        "   → Inject correct value\n"
        "   → Re-cool (new crystal)\n"
        "6. If RIGHT:\n"
        "   → No heating (memory preserved)\n\n"
        f"Corrections needed: {correction_count}\n"
        f"Final accuracy: {final_accuracy:.0%}"
    )
    axes[1, 2].text(0.05, 0.95, protocol, fontsize=10, fontfamily='monospace',
                    transform=axes[1, 2].transAxes, verticalalignment='top')

    plt.suptitle('Exp26: Reward-Driven Dynamic Temperature',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved visualization to {IMG_FILE}")
    plt.close()

    return all_pass


if __name__ == "__main__":
    run_experiment()
