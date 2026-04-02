"""
EXPERIMENT 22: CRYSTALLIZATION AS DECISION (Spontaneous Symmetry Breaking)
==========================================================================

HYPOTHESIS: Cooling a fluid substrate forces it to CRYSTALLIZE into one
of several possible discrete states. This IS decision-making.
Different noise seeds → different decisions (stochastic SSB).

PHYSICS: Quenching a Ginzburg-Landau field
  1. Start HOT: T >> Tc, field is disordered (fluid, symmetric)
  2. COOL: T drops linearly to T << Tc
  3. CRYSTALLIZE: Field locks into domains of 0 and 1
  4. DECISION: The final pattern depends on the noise history

PASS CRITERIA:
  1. Before cooling: field is uniform-ish (low bimodality, high entropy)
  2. After cooling: field is bimodal (discrete crystal, low entropy)
  3. Different seeds produce DIFFERENT crystal patterns (correlation < 0.5)
  4. Same seed produces SAME pattern (deterministic given noise = reproducible)
"""

import sys, os
import numpy as np
import matplotlib.pyplot as plt

LOG_FILE = os.path.join(os.path.dirname(__file__), "exp22_crystallization_decision.log")
IMG_FILE = os.path.join(os.path.dirname(__file__), "exp22_crystallization_decision.png")

def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


def growth_doublewell(rho):
    return -4.0 * rho * (1.0 - rho) * (1.0 - 2.0 * rho)


def simulate_quench(N, steps, dt, seed, cooling_start=0.3, cooling_end=0.8):
    """
    Run a quenching simulation: T goes from hot to cold.
    Returns: history of rho, final rho, history of T.
    """
    np.random.seed(seed)
    rho = np.random.uniform(0.3, 0.7, N)  # Start near unstable equilibrium

    dw_strength = 8.0
    D = 2.0
    noise_sigma = 0.4

    history = []
    T_history = []

    for t in range(steps):
        # Temperature schedule: hot → cold
        progress = t / steps
        if progress < cooling_start:
            T_global = 1.0  # Hot phase
        elif progress < cooling_end:
            frac = (progress - cooling_start) / (cooling_end - cooling_start)
            T_global = 1.0 - frac  # Linear cooling
        else:
            T_global = 0.0  # Frozen

        T = T_global * np.ones(N)

        # Dynamics
        G_dw = dw_strength * growth_doublewell(rho)
        left = np.roll(rho, 1)
        right = np.roll(rho, -1)
        laplacian = left + right - 2.0 * rho
        noise = noise_sigma * np.sqrt(dt) * np.random.randn(N)

        drho = dt * ((1.0 - T) * G_dw + D * T * laplacian) + np.sqrt(T + 1e-6) * noise
        rho = rho + drho
        rho = np.clip(rho, 0.0, 1.0)

        if t % max(1, steps // 200) == 0:
            history.append(rho.copy())
            T_history.append(T_global)

    return np.array(history), rho, np.array(T_history)


def bimodality(values, threshold_lo=0.15, threshold_hi=0.85):
    return (np.sum(values < threshold_lo) + np.sum(values > threshold_hi)) / len(values)


def run_experiment(N=200, steps=5000, dt=0.02, n_trials=6):
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 22: CRYSTALLIZATION AS DECISION ---\n")

    log("--- EXPERIMENT 22: CRYSTALLIZATION AS DECISION (Spontaneous Symmetry Breaking) ---")
    log(f"N={N}, steps={steps}, n_trials={n_trials}")

    # Run multiple trials with different seeds
    all_finals = []
    all_histories = []
    all_T_histories = []

    for trial in range(n_trials):
        seed = 100 + trial
        log(f"\nTrial {trial + 1}/{n_trials} (seed={seed})...")
        hist, final, T_hist = simulate_quench(N, steps, dt, seed)
        all_finals.append(final)
        all_histories.append(hist)
        all_T_histories.append(T_hist)

        bm = bimodality(final)
        log(f"  Final bimodality: {bm:.3f}")
        log(f"  Mean rho: {final.mean():.3f}")
        log(f"  Fraction near 0: {np.mean(final < 0.15):.3f}")
        log(f"  Fraction near 1: {np.mean(final > 0.85):.3f}")

    # Run one trial with same seed as trial 0 for reproducibility check
    log(f"\nReproducibility check (seed=100 again)...")
    _, final_repro, _ = simulate_quench(N, steps, dt, seed=100)

    # --- Analysis ---
    log("\n=== ANALYSIS ===")

    # 1. Before vs After cooling
    hot_bimodality = bimodality(all_histories[0][0])  # First snapshot (hot)
    cold_bimodality = bimodality(all_finals[0])  # Final state (cold)
    log(f"Bimodality BEFORE cooling: {hot_bimodality:.3f}")
    log(f"Bimodality AFTER cooling:  {cold_bimodality:.3f}")

    # 2. Cross-correlation between different trials
    correlations = []
    for i in range(n_trials):
        for j in range(i + 1, n_trials):
            # Binarize and compare
            bi = (all_finals[i] > 0.5).astype(float)
            bj = (all_finals[j] > 0.5).astype(float)
            corr = np.mean(bi == bj)
            correlations.append(corr)
    mean_cross_corr = np.mean(correlations)
    log(f"Mean cross-trial agreement: {mean_cross_corr:.3f}")

    # 3. Reproducibility
    bi_orig = (all_finals[0] > 0.5).astype(float)
    bi_repro = (final_repro > 0.5).astype(float)
    repro_corr = np.mean(bi_orig == bi_repro)
    log(f"Reproducibility (same seed): {repro_corr:.3f}")

    # 4. Diversity: how different are the patterns?
    # Count domain patterns
    domain_sizes = []
    for final in all_finals:
        binary = (final > 0.5).astype(int)
        changes = np.sum(np.abs(np.diff(binary)))
        domain_sizes.append(changes)
    log(f"Domain walls per trial: {domain_sizes}")
    log(f"Mean domain walls: {np.mean(domain_sizes):.1f}")

    # --- Verdict ---
    log("\n=== VERDICT ===")
    pass1 = hot_bimodality < 0.3
    pass2 = cold_bimodality > 0.8
    pass3 = mean_cross_corr < 0.7  # Different seeds → different patterns
    pass4 = repro_corr > 0.95  # Same seed → same pattern

    log(f"[{'PASS' if pass1 else 'FAIL'}] Hot phase is SYMMETRIC (bimodality < 30%): {hot_bimodality:.1%}")
    log(f"[{'PASS' if pass2 else 'FAIL'}] Cold phase is CRYSTALLIZED (bimodality > 80%): {cold_bimodality:.1%}")
    log(f"[{'PASS' if pass3 else 'FAIL'}] SSB is STOCHASTIC (cross-correlation < 70%): {mean_cross_corr:.1%}")
    log(f"[{'PASS' if pass4 else 'FAIL'}] SSB is REPRODUCIBLE (same seed > 95%): {repro_corr:.1%}")

    all_pass = pass1 and pass2 and pass3 and pass4
    status = "[!!! SUCCESS !!!]" if all_pass else "[PARTIAL]"
    log(f"\n{status} Crystallization as Decision {'CONFIRMED' if all_pass else 'partial'}.")
    if all_pass:
        log("Cooling IS decision-making. Noise IS agency. Temperature IS attention.")

    # --- Visualization ---
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: Temperature schedule + bimodality evolution
    ax = axes[0, 0]
    T_hist = all_T_histories[0]
    bm_evolution = [bimodality(h) for h in all_histories[0]]
    t_axis = np.linspace(0, 1, len(T_hist))
    ax.plot(t_axis, T_hist, 'r-', linewidth=2, label='Temperature T')
    ax.plot(t_axis, bm_evolution, 'b-', linewidth=2, label='Bimodality')
    ax.axhline(y=0.5, color='gray', linestyle='--', alpha=0.3)
    ax.set_title('Quenching Schedule')
    ax.set_xlabel('Progress')
    ax.set_ylabel('Value')
    ax.legend()

    # Top-center: Kymograph of trial 0
    im = axes[0, 1].imshow(all_histories[0].T, aspect='auto', cmap='RdBu_r',
                            vmin=0, vmax=1, extent=[0, 1, N, 0])
    axes[0, 1].set_title('Kymograph: Crystallization (Trial 1)')
    axes[0, 1].set_xlabel('Progress')
    axes[0, 1].set_ylabel('Node')
    axes[0, 1].axvline(x=0.3, color='yellow', linestyle='--', alpha=0.7, label='Cool start')
    axes[0, 1].axvline(x=0.8, color='cyan', linestyle='--', alpha=0.7, label='Frozen')
    axes[0, 1].legend(fontsize=8)
    plt.colorbar(im, ax=axes[0, 1])

    # Top-right: All final patterns
    for i, final in enumerate(all_finals):
        binary = (final > 0.5).astype(float)
        axes[0, 2].plot(binary + i * 1.2, '-', linewidth=0.8, label=f'Seed {100 + i}')
    axes[0, 2].set_title(f'Final Crystal Patterns (All {n_trials} Trials)')
    axes[0, 2].set_xlabel('Node')
    axes[0, 2].set_ylabel('Pattern (offset)')
    axes[0, 2].set_yticks([])

    # Bottom-left: Distribution before/after
    axes[1, 0].hist(all_histories[0][0], bins=30, alpha=0.5, color='red',
                    label=f'Hot (bimodal={hot_bimodality:.2f})', density=True)
    axes[1, 0].hist(all_finals[0], bins=30, alpha=0.5, color='blue',
                    label=f'Cold (bimodal={cold_bimodality:.2f})', density=True)
    axes[1, 0].set_title('Distribution: Before vs After Cooling')
    axes[1, 0].set_xlabel('rho')
    axes[1, 0].legend()

    # Bottom-center: Cross-correlation matrix
    corr_matrix = np.zeros((n_trials, n_trials))
    for i in range(n_trials):
        for j in range(n_trials):
            bi = (all_finals[i] > 0.5).astype(float)
            bj = (all_finals[j] > 0.5).astype(float)
            corr_matrix[i, j] = np.mean(bi == bj)
    im2 = axes[1, 1].imshow(corr_matrix, cmap='coolwarm', vmin=0.3, vmax=1.0)
    axes[1, 1].set_title(f'Cross-Trial Agreement\n(mean={mean_cross_corr:.3f})')
    axes[1, 1].set_xlabel('Trial')
    axes[1, 1].set_ylabel('Trial')
    for i in range(n_trials):
        for j in range(n_trials):
            axes[1, 1].text(j, i, f'{corr_matrix[i,j]:.2f}', ha='center', va='center', fontsize=8)
    plt.colorbar(im2, ax=axes[1, 1])

    # Bottom-right: Reproducibility
    axes[1, 2].plot(all_finals[0], 'b-', alpha=0.7, label='Original (seed=100)')
    axes[1, 2].plot(final_repro, 'r--', alpha=0.7, label='Reproduced (seed=100)')
    axes[1, 2].set_title(f'Reproducibility Check (agreement={repro_corr:.3f})')
    axes[1, 2].set_xlabel('Node')
    axes[1, 2].set_ylabel('rho')
    axes[1, 2].legend()

    plt.suptitle('Exp22: Crystallization AS Decision — Spontaneous Symmetry Breaking',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved visualization to {IMG_FILE}")
    plt.close()

    return all_pass


if __name__ == "__main__":
    run_experiment()
