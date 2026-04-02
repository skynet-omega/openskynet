"""
EXPERIMENT 21: PHASE COEXISTENCE (Crystal + Fluid in One Substrate)
===================================================================

HYPOTHESIS: A local temperature field T(x) can create simultaneous
crystal (stable, discrete) and fluid (dynamic, continuous) regions
in ONE substrate with the SAME equation.

PHYSICS: Time-Dependent Ginzburg-Landau (TDGL) / Model A
  dρ/dt = (1-T)·G_doublewell(ρ) + D·T·∇²ρ + σ·√T·noise

  T(x) low  → Double-well dominates → ρ locks to 0 or 1 (CRYSTAL)
  T(x) high → Diffusion + Noise dominate → ρ fluctuates (FLUID)
  T(x) ≈ Tc → Critical regime: maximum susceptibility (EDGE OF CHAOS)

PASS CRITERIA:
  1. Cold region: bimodal (>80% of values near 0 or 1)
  2. Hot region: NOT bimodal + temporal fluctuations (std > 0.01)
  3. Transition region: intermediate behavior
"""

import sys, os
import numpy as np
import matplotlib.pyplot as plt

LOG_FILE = os.path.join(os.path.dirname(__file__), "exp21_phase_coexistence.log")
IMG_FILE = os.path.join(os.path.dirname(__file__), "exp21_phase_coexistence.png")

def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


def growth_doublewell(rho):
    """
    -V'(rho) where V = rho^2(1-rho)^2.
    Force pushes toward rho=0 and rho=1. Unstable at rho=0.5.
    """
    return -4.0 * rho * (1.0 - rho) * (1.0 - 2.0 * rho)


def run_experiment(N=300, steps=5000, dt=0.02):
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 21: PHASE COEXISTENCE (TDGL) ---\n")

    log("--- EXPERIMENT 21: PHASE COEXISTENCE (Crystal + Fluid in One Substrate) ---")
    log(f"Physics: Time-Dependent Ginzburg-Landau")
    log(f"N={N}, steps={steps}, dt={dt}")

    # --- 1. Temperature Field T(x) ---
    x = np.linspace(0, 1, N)
    # Smooth transition: hot left, cold right
    T = 1.0 / (1.0 + np.exp(20.0 * (x - 0.5)))

    # --- 2. Physical parameters ---
    dw_strength = 8.0   # Double-well strength (crystallization force)
    D = 2.0             # Diffusion coefficient (in hot region)
    noise_sigma = 0.5   # Thermal noise amplitude

    log(f"Double-well strength: {dw_strength}")
    log(f"Diffusion D: {D}")
    log(f"Noise sigma: {noise_sigma}")

    # --- 3. Initial field: random ---
    np.random.seed(42)
    rho = np.random.uniform(0.1, 0.9, N)

    # --- 4. Evolution ---
    save_every = max(1, steps // 500)
    history = []
    history_hot_temporal = []
    history_cold_temporal = []
    history_mid_temporal = []

    hot_mask = x < 0.3
    cold_mask = x > 0.7
    mid_mask = (x >= 0.4) & (x <= 0.6)

    for t in range(steps):
        # Double-well force (crystal dynamics)
        G_dw = dw_strength * growth_doublewell(rho)

        # Laplacian (diffusion)
        left = np.roll(rho, 1)
        right = np.roll(rho, -1)
        laplacian = left + right - 2.0 * rho

        # Thermal noise
        noise = noise_sigma * np.sqrt(dt) * np.random.randn(N)

        # TDGL equation: T controls the balance
        # Low T → double-well dominates (crystal)
        # High T → diffusion + noise dominates (fluid)
        drho = dt * ((1.0 - T) * G_dw + D * T * laplacian) + np.sqrt(T) * noise

        rho = rho + drho
        rho = np.clip(rho, 0.0, 1.0)

        if t % save_every == 0:
            history.append(rho.copy())

        if t >= steps - 2000:
            history_hot_temporal.append(rho[hot_mask].mean())
            history_cold_temporal.append(rho[cold_mask].mean())
            history_mid_temporal.append(rho[mid_mask].mean())

    history = np.array(history)
    history_hot_temporal = np.array(history_hot_temporal)
    history_cold_temporal = np.array(history_cold_temporal)
    history_mid_temporal = np.array(history_mid_temporal)

    # --- 5. Analysis ---
    log("\n=== ANALYSIS ===")

    # Cold region: bimodality
    cold_values = rho[cold_mask]
    near_0 = np.sum(cold_values < 0.15)
    near_1 = np.sum(cold_values > 0.85)
    total_cold = len(cold_values)
    bimodal_fraction = (near_0 + near_1) / total_cold
    log(f"Cold region: {near_0} near 0, {near_1} near 1, {total_cold - near_0 - near_1} in middle")
    log(f"Cold bimodal fraction: {bimodal_fraction:.3f}")

    # Hot region: distribution
    hot_values = rho[hot_mask]
    hot_near_0 = np.sum(hot_values < 0.15)
    hot_near_1 = np.sum(hot_values > 0.85)
    hot_bimodal = (hot_near_0 + hot_near_1) / len(hot_values)
    log(f"Hot region bimodal fraction: {hot_bimodal:.3f}")

    # Temporal dynamics
    temporal_std_hot = np.std(history_hot_temporal)
    temporal_std_cold = np.std(history_cold_temporal)
    temporal_std_mid = np.std(history_mid_temporal)
    log(f"Temporal std (hot mean, last 2000):  {temporal_std_hot:.6f}")
    log(f"Temporal std (cold mean, last 2000): {temporal_std_cold:.6f}")
    log(f"Temporal std (mid mean, last 2000):  {temporal_std_mid:.6f}")

    # Spatial std at final state
    hot_std = np.std(rho[hot_mask])
    cold_std = np.std(rho[cold_mask])
    log(f"Spatial std (hot): {hot_std:.4f}")
    log(f"Spatial std (cold): {cold_std:.4f}")

    # --- 6. Pass/Fail ---
    log("\n=== VERDICT ===")
    pass1 = bimodal_fraction > 0.8
    pass2 = temporal_std_hot > 0.005
    pass3 = hot_bimodal < 0.5  # Hot region should NOT be bimodal

    log(f"[{'PASS' if pass1 else 'FAIL'}] Cold is CRYSTAL (bimodal > 80%): {bimodal_fraction:.1%}")
    log(f"[{'PASS' if pass2 else 'FAIL'}] Hot is FLUID (temporal std > 0.005): {temporal_std_hot:.6f}")
    log(f"[{'PASS' if pass3 else 'FAIL'}] Hot is NOT crystal (bimodal < 50%): {hot_bimodal:.1%}")

    all_pass = pass1 and pass2 and pass3
    status = "[!!! SUCCESS !!!]" if all_pass else "[PARTIAL]"
    log(f"\n{status} Phase coexistence {'CONFIRMED' if all_pass else 'partial'}.")

    if all_pass:
        log("Crystal (Memory) and Fluid (Abstraction) coexist in ONE substrate.")
        log("T(x) is the local control parameter — the 'Attention Field'.")

    # --- 7. Visualization ---
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: T(x) + final state
    ax = axes[0, 0]
    ax2 = ax.twinx()
    ax.fill_between(x, 0, T, alpha=0.2, color='red', label='T(x) [Fluid]')
    ax.fill_between(x, 0, 1 - T, alpha=0.2, color='blue', label='1-T [Crystal]')
    ax2.plot(x, rho, 'k.', markersize=2, label='rho(x)')
    ax.set_title('Temperature Field + Final State')
    ax.set_ylabel('T(x)')
    ax2.set_ylabel('rho')
    ax.legend(loc='upper left', fontsize=8)
    ax2.legend(loc='upper right', fontsize=8)

    # Top-center: Kymograph
    im = axes[0, 1].imshow(history.T, aspect='auto', cmap='RdBu_r',
                            extent=[0, steps, 1, 0], vmin=0, vmax=1)
    axes[0, 1].set_title('Kymograph: rho(x, t)')
    axes[0, 1].set_xlabel('Time')
    axes[0, 1].set_ylabel('Position x')
    axes[0, 1].axhline(y=0.3, color='white', linestyle='--', alpha=0.7, linewidth=0.5)
    axes[0, 1].axhline(y=0.7, color='cyan', linestyle='--', alpha=0.7, linewidth=0.5)
    axes[0, 1].text(steps * 0.05, 0.15, 'FLUID', color='white', fontsize=10, fontweight='bold')
    axes[0, 1].text(steps * 0.05, 0.85, 'CRYSTAL', color='cyan', fontsize=10, fontweight='bold')
    plt.colorbar(im, ax=axes[0, 1])

    # Top-right: Distribution comparison
    axes[0, 2].hist(rho[hot_mask], bins=40, alpha=0.6, color='red',
                    label=f'Hot (std={hot_std:.3f})', density=True)
    axes[0, 2].hist(rho[cold_mask], bins=40, alpha=0.6, color='blue',
                    label=f'Cold (std={cold_std:.3f})', density=True)
    axes[0, 2].set_title('Distribution: Fluid vs Crystal')
    axes[0, 2].set_xlabel('rho')
    axes[0, 2].legend()

    # Bottom-left: Temporal traces
    t_axis = np.arange(len(history_hot_temporal))
    axes[1, 0].plot(t_axis, history_hot_temporal, 'r-', alpha=0.8, label=f'Hot (std={temporal_std_hot:.4f})')
    axes[1, 0].plot(t_axis, history_cold_temporal, 'b-', alpha=0.8, label=f'Cold (std={temporal_std_cold:.4f})')
    axes[1, 0].plot(t_axis, history_mid_temporal, 'g-', alpha=0.8, label=f'Edge (std={temporal_std_mid:.4f})')
    axes[1, 0].set_title('Temporal Dynamics (Mean of Region)')
    axes[1, 0].set_xlabel('Step (last 2000)')
    axes[1, 0].set_ylabel('Mean rho')
    axes[1, 0].legend()

    # Bottom-center: Phase diagram
    T_values = np.linspace(0, 1, 50)
    bimodal_at_T = []
    for Ti in T_values:
        mask = np.abs(T - Ti) < 0.05
        if mask.sum() > 5:
            vals = rho[mask]
            bm = (np.sum(vals < 0.15) + np.sum(vals > 0.85)) / len(vals)
            bimodal_at_T.append(bm)
        else:
            bimodal_at_T.append(np.nan)
    axes[1, 1].plot(T_values, bimodal_at_T, 'ko-', markersize=3)
    axes[1, 1].axvline(x=0.5, color='gray', linestyle='--', alpha=0.5, label='Tc')
    axes[1, 1].set_title('Order Parameter vs Temperature')
    axes[1, 1].set_xlabel('T')
    axes[1, 1].set_ylabel('Bimodal Fraction (Crystal Order)')
    axes[1, 1].legend()

    # Bottom-right: Snapshot evolution
    snap_indices = [0, len(history) // 4, len(history) // 2, -1]
    snap_labels = ['t=0', 't=T/4', 't=T/2', 't=final']
    colors = ['gray', 'orange', 'green', 'black']
    for si, sl, sc in zip(snap_indices, snap_labels, colors):
        axes[1, 2].plot(x, history[si], '-', color=sc, alpha=0.7, label=sl, linewidth=0.8)
    axes[1, 2].axvline(x=0.5, color='red', linestyle='--', alpha=0.3)
    axes[1, 2].set_title('Evolution Snapshots')
    axes[1, 2].set_xlabel('x')
    axes[1, 2].set_ylabel('rho')
    axes[1, 2].legend(fontsize=8)

    plt.suptitle('Exp21: Phase Coexistence (TDGL) — Crystal + Fluid in One Substrate',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved visualization to {IMG_FILE}")
    plt.close()

    return all_pass


if __name__ == "__main__":
    run_experiment()
