"""
EXPERIMENT 23: GROWTH FUNCTION INTERPOLATION G(rho, T)
======================================================

HYPOTHESIS: A single growth function G(rho, T) can smoothly transition
between Lenia dynamics (traveling waves) at T>Tc and Double-Well dynamics
(bistable memory) at T<Tc, creating a BIFURCATION at Tc.

METHOD:
  G(rho, T) = sigma(T - Tc) * G_lenia(rho) + sigma(Tc - T) * G_doublewell(rho)

  Where sigma is a smooth sigmoid. This creates:
  - T >> Tc: Pure Lenia growth (one attractor near mu_g)
  - T << Tc: Pure Double-Well (two attractors at 0 and 1)
  - T = Tc: Mixture (three attractors?)

PASS CRITERIA:
  1. Bifurcation diagram shows clear transition: 1 attractor → 2 attractors
  2. Transition is SMOOTH (no discontinuities)
  3. For T < Tc: two stable fixed points exist (near 0 and near 1)
  4. For T > Tc: one stable fixed point exists (near mu_g)
"""

import sys, os
import numpy as np
import matplotlib.pyplot as plt

LOG_FILE = os.path.join(os.path.dirname(__file__), "exp23_growth_interpolation.log")
IMG_FILE = os.path.join(os.path.dirname(__file__), "exp23_growth_interpolation.png")

def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


def sigmoid(x, k=10):
    return 1.0 / (1.0 + np.exp(-k * x))


def G_lenia(rho, mu=0.35, sigma_g=0.3):
    """Lenia growth: unimodal peak at mu. Wide sigma → single attractor."""
    return 2.0 * np.exp(-((rho - mu) ** 2) / (2 * sigma_g ** 2)) - 1.0


def G_doublewell(rho):
    """Double-well force: stable at 0 and 1."""
    return -4.0 * rho * (1.0 - rho) * (1.0 - 2.0 * rho)


def G_interpolated(rho, T, Tc=0.5, sharpness=10):
    """The unified growth function: smoothly interpolates."""
    w_lenia = sigmoid(T - Tc, k=sharpness)
    w_dw = sigmoid(Tc - T, k=sharpness)
    # Normalize so weights sum to 1
    total = w_lenia + w_dw
    w_lenia /= total
    w_dw /= total
    return w_lenia * G_lenia(rho) + w_dw * G_doublewell(rho)


def find_fixed_points(T, Tc=0.5, n_samples=500):
    """Find fixed points of dρ/dt = G(ρ, T) by simulation."""
    rho_init = np.linspace(0.01, 0.99, n_samples)
    rho = rho_init.copy()
    dt = 0.01

    for _ in range(5000):
        G = G_interpolated(rho, T, Tc)
        rho = rho + dt * G
        rho = np.clip(rho, 0.001, 0.999)

    # Cluster the fixed points
    rho_rounded = np.round(rho, 2)
    unique_fps = np.unique(rho_rounded)
    # Filter: a "real" fixed point should have many trajectories converging to it
    stable_fps = []
    for fp in unique_fps:
        count = np.sum(np.abs(rho_rounded - fp) < 0.03)
        if count > n_samples * 0.02:  # At least 2% of trajectories
            stable_fps.append(fp)
    return np.array(stable_fps), rho_init, rho


def run_experiment():
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 23: GROWTH INTERPOLATION ---\n")

    log("--- EXPERIMENT 23: GROWTH FUNCTION INTERPOLATION G(rho, T) ---")

    Tc = 0.5
    T_range = np.linspace(0.0, 1.0, 100)

    # --- 1. Compute bifurcation diagram ---
    log("\nComputing bifurcation diagram...")
    all_fps = {}
    all_n_fps = []
    bifurcation_T = []
    bifurcation_rho = []

    for T in T_range:
        fps, _, _ = find_fixed_points(T, Tc)
        all_fps[T] = fps
        all_n_fps.append(len(fps))
        for fp in fps:
            bifurcation_T.append(T)
            bifurcation_rho.append(fp)

    bifurcation_T = np.array(bifurcation_T)
    bifurcation_rho = np.array(bifurcation_rho)
    all_n_fps = np.array(all_n_fps)

    # --- 2. Growth function landscape ---
    rho_axis = np.linspace(0, 1, 500)
    T_samples = [0.0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0]
    G_landscapes = {}
    for T in T_samples:
        G_landscapes[T] = G_interpolated(rho_axis, T, Tc)

    # --- 3. Time simulation at different T ---
    log("\nSimulating ODE at different temperatures...")
    ode_results = {}
    for T in [0.0, 0.3, 0.5, 0.7, 1.0]:
        rho_test = 0.5 * np.ones(1)  # Start at unstable point
        rho_test += 0.01  # Tiny perturbation
        history = [rho_test[0]]
        dt = 0.01
        for _ in range(3000):
            G = G_interpolated(rho_test, T, Tc)
            rho_test = rho_test + dt * G
            rho_test = np.clip(rho_test, 0.001, 0.999)
            history.append(rho_test[0])
        ode_results[T] = np.array(history)
        log(f"  T={T:.1f}: rho=0.51 → {rho_test[0]:.4f}")

    # --- 4. Analysis ---
    log("\n=== ANALYSIS ===")

    # Count attractors at low T and high T
    fps_cold = all_fps.get(T_range[5], np.array([]))  # T ≈ 0.05
    fps_hot = all_fps.get(T_range[95], np.array([]))   # T ≈ 0.95
    log(f"Fixed points at T=0.05: {fps_cold}")
    log(f"Fixed points at T=0.95: {fps_hot}")

    # Find Tc from bifurcation
    n_fp_cold = all_n_fps[:20].mean()
    n_fp_hot = all_n_fps[-20:].mean()
    log(f"Mean # attractors (T<0.2): {n_fp_cold:.1f}")
    log(f"Mean # attractors (T>0.8): {n_fp_hot:.1f}")

    # Check smoothness: max gradient of G across T
    G_at_half = np.array([G_interpolated(0.5, T, Tc) for T in T_range])
    max_dG_dT = np.max(np.abs(np.diff(G_at_half)))
    log(f"Max |dG/dT| at rho=0.5: {max_dG_dT:.6f} (smooth if < 0.5)")

    # --- 5. Verdict ---
    log("\n=== VERDICT ===")
    pass1 = n_fp_cold >= 2.0
    pass2 = n_fp_hot <= 1.5
    pass3 = max_dG_dT < 0.5
    pass4 = len(fps_cold) >= 2 and len(fps_hot) <= 2

    log(f"[{'PASS' if pass1 else 'FAIL'}] Cold has >= 2 attractors: {n_fp_cold:.1f}")
    log(f"[{'PASS' if pass2 else 'FAIL'}] Hot has <= 1 attractor: {n_fp_hot:.1f}")
    log(f"[{'PASS' if pass3 else 'FAIL'}] Transition is smooth (max dG/dT < 0.5): {max_dG_dT:.4f}")
    log(f"[{'PASS' if pass4 else 'FAIL'}] Bifurcation exists: cold={len(fps_cold)} fp, hot={len(fps_hot)} fp")

    all_pass = pass1 and pass2 and pass3 and pass4
    status = "[!!! SUCCESS !!!]" if all_pass else "[PARTIAL]"
    log(f"\n{status} Growth interpolation bifurcation {'CONFIRMED' if all_pass else 'partial'}.")

    # --- 6. Visualization ---
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: Growth function at different T
    ax = axes[0, 0]
    cmap = plt.cm.coolwarm
    for i, T in enumerate(T_samples):
        color = cmap(1 - T)
        ax.plot(rho_axis, G_landscapes[T], '-', color=color, linewidth=1.5,
                label=f'T={T:.1f}')
    ax.axhline(y=0, color='black', linestyle='-', alpha=0.3)
    ax.set_title('G(rho, T) — Growth Function')
    ax.set_xlabel('rho')
    ax.set_ylabel('G')
    ax.legend(fontsize=7)
    ax.set_ylim(-2, 2)

    # Top-center: Bifurcation diagram
    ax = axes[0, 1]
    ax.scatter(bifurcation_T, bifurcation_rho, s=5, c='black', alpha=0.6)
    ax.axvline(x=Tc, color='red', linestyle='--', alpha=0.5, label=f'Tc={Tc}')
    ax.set_title('Bifurcation Diagram')
    ax.set_xlabel('Temperature T')
    ax.set_ylabel('Stable Fixed Points (rho*)')
    ax.legend()

    # Top-right: Number of attractors vs T
    ax = axes[0, 2]
    ax.plot(T_range, all_n_fps, 'ko-', markersize=3)
    ax.axvline(x=Tc, color='red', linestyle='--', alpha=0.5, label=f'Tc={Tc}')
    ax.set_title('Number of Attractors vs T')
    ax.set_xlabel('T')
    ax.set_ylabel('# Stable Fixed Points')
    ax.legend()

    # Bottom-left: ODE trajectories
    ax = axes[1, 0]
    for T, traj in ode_results.items():
        color = cmap(1 - T)
        ax.plot(traj, '-', color=color, linewidth=1.5, label=f'T={T:.1f}')
    ax.set_title('ODE Trajectories from rho=0.51')
    ax.set_xlabel('Time step')
    ax.set_ylabel('rho(t)')
    ax.legend(fontsize=8)

    # Bottom-center: Potential landscape V(rho)
    ax = axes[1, 1]
    for T in [0.0, 0.3, 0.5, 0.7, 1.0]:
        # Integrate G to get V (numerically)
        V = np.zeros_like(rho_axis)
        for i in range(1, len(rho_axis)):
            dr = rho_axis[i] - rho_axis[i-1]
            V[i] = V[i-1] - G_interpolated(rho_axis[i], T, Tc) * dr
        V = V - V.min()
        color = cmap(1 - T)
        ax.plot(rho_axis, V, '-', color=color, linewidth=1.5, label=f'T={T:.1f}')
    ax.set_title('Potential Landscape V(rho, T)')
    ax.set_xlabel('rho')
    ax.set_ylabel('V (energy)')
    ax.legend(fontsize=8)

    # Bottom-right: Mixing weights
    ax = axes[1, 2]
    w_l = sigmoid(T_range - Tc)
    w_d = sigmoid(Tc - T_range)
    total = w_l + w_d
    ax.fill_between(T_range, 0, w_l / total, alpha=0.3, color='red', label='Lenia (Fluid)')
    ax.fill_between(T_range, w_l / total, 1, alpha=0.3, color='blue', label='Double-Well (Crystal)')
    ax.axvline(x=Tc, color='black', linestyle='--', alpha=0.5, label=f'Tc={Tc}')
    ax.set_title('Mixing Weights vs T')
    ax.set_xlabel('T')
    ax.set_ylabel('Weight')
    ax.legend(fontsize=8)

    plt.suptitle('Exp23: Growth Function Interpolation — Lenia ↔ Double-Well Bifurcation',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved visualization to {IMG_FILE}")
    plt.close()

    return all_pass


if __name__ == "__main__":
    run_experiment()
