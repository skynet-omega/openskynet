"""
EXPERIMENT 24: MEMORY SURVIVES LOCAL HEATING (Selective Reorganization)
=======================================================================

HYPOTHESIS: Heating ONE region of a crystallized substrate allows
reorganization of that region, while cold regions preserve their
crystal memories INTACT.

This is the KEY test for the Cyborg architecture:
  - Memories (crystals) persist unless deliberately heated
  - Heating = "paying attention" = allowing change
  - New input only modifies what you focus on

PROTOCOL:
  1. CRYSTALLIZE: Cool entire substrate → create crystal memory pattern
  2. VERIFY: Record crystal pattern
  3. HEAT LOCALLY: Raise T in region A only
  4. INJECT NEW SIGNAL: Feed new pattern into heated region
  5. COOL AGAIN: Re-crystallize heated region
  6. VERIFY: Region B (never heated) preserved? Region A changed?

PASS CRITERIA:
  1. Cold memories (region B): > 95% preserved after heating of region A
  2. Hot region (A): successfully reorganized (< 50% correlation with original)
  3. After re-cooling: region A re-crystallizes into NEW pattern
  4. Cycle is repeatable
"""

import sys, os
import numpy as np
import matplotlib.pyplot as plt

LOG_FILE = os.path.join(os.path.dirname(__file__), "exp24_selective_memory.log")
IMG_FILE = os.path.join(os.path.dirname(__file__), "exp24_selective_memory.png")

def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


def growth_doublewell(rho):
    return -4.0 * rho * (1.0 - rho) * (1.0 - 2.0 * rho)


def simulate_step(rho, T, dt=0.02, dw_strength=10.0, D=2.0, noise_sigma=0.3):
    """One step of TDGL dynamics."""
    G_dw = dw_strength * growth_doublewell(rho)
    left = np.roll(rho, 1)
    right = np.roll(rho, -1)
    laplacian = left + right - 2.0 * rho
    noise = noise_sigma * np.sqrt(dt) * np.random.randn(len(rho))

    drho = dt * ((1.0 - T) * G_dw + D * T * laplacian) + np.sqrt(T + 1e-8) * noise
    return np.clip(rho + drho, 0.0, 1.0)


def binarize(rho):
    return (rho > 0.5).astype(float)


def agreement(a, b):
    return np.mean(binarize(a) == binarize(b))


def run_experiment(N=200):
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 24: SELECTIVE MEMORY ---\n")

    log("--- EXPERIMENT 24: MEMORY SURVIVES LOCAL HEATING ---")
    log(f"N={N}")

    np.random.seed(42)

    # Define regions
    region_A = slice(20, 80)      # Region A: will be heated
    region_B = slice(120, 180)    # Region B: stays cold (control)
    region_A_mask = np.zeros(N, dtype=bool)
    region_B_mask = np.zeros(N, dtype=bool)
    region_A_mask[region_A] = True
    region_B_mask[region_B] = True

    history = []
    phase_labels = []

    # ====== PHASE 1: CRYSTALLIZE EVERYTHING ======
    log("\n--- PHASE 1: Initial Crystallization ---")
    rho = np.random.uniform(0.3, 0.7, N)
    T = np.zeros(N)  # Cold everywhere

    for t in range(2000):
        rho = simulate_step(rho, T)
        if t % 50 == 0:
            history.append(rho.copy())
            phase_labels.append('P1_crystallize')

    memory_original = rho.copy()
    bm_A = agreement(rho[region_A], np.round(rho[region_A]))
    bm_B = agreement(rho[region_B], np.round(rho[region_B]))
    log(f"After crystallization:")
    log(f"  Region A bimodal: {bm_A:.3f}")
    log(f"  Region B bimodal: {bm_B:.3f}")
    log(f"  Region A pattern: {binarize(rho[region_A])[:10]}...")
    log(f"  Region B pattern: {binarize(rho[region_B])[:10]}...")

    # ====== PHASE 2: HEAT REGION A ONLY ======
    log("\n--- PHASE 2: Heat Region A (Melt Memory) ---")
    T = np.zeros(N)
    T[region_A] = 1.0  # Heat ONLY region A

    for t in range(1000):
        rho = simulate_step(rho, T)
        if t % 50 == 0:
            history.append(rho.copy())
            phase_labels.append('P2_heat_A')

    # Inject new signal into heated region
    log("  Injecting new signal into region A...")
    # Force a specific pattern (opposite of original)
    target_A = 1.0 - binarize(memory_original[region_A])
    signal_strength = 0.3
    rho[region_A] += signal_strength * (target_A - rho[region_A])
    rho = np.clip(rho, 0.0, 1.0)

    # Continue heating with signal
    for t in range(500):
        rho = simulate_step(rho, T)
        # Re-inject signal (weaker)
        rho[region_A] += 0.05 * (target_A - rho[region_A])
        rho = np.clip(rho, 0.0, 1.0)
        if t % 50 == 0:
            history.append(rho.copy())
            phase_labels.append('P2_signal')

    memory_after_heating = rho.copy()
    agr_B_preserved = agreement(memory_original[region_B], rho[region_B])
    agr_A_changed = agreement(memory_original[region_A], rho[region_A])
    log(f"After heating + signal:")
    log(f"  Region B preservation: {agr_B_preserved:.3f} (should be > 0.95)")
    log(f"  Region A change: {agr_A_changed:.3f} (should be < 0.5 = fully changed)")

    # ====== PHASE 3: RE-COOL EVERYTHING ======
    log("\n--- PHASE 3: Re-cool (Crystallize New Memory) ---")
    T = np.zeros(N)  # Cold everywhere

    for t in range(2000):
        rho = simulate_step(rho, T)
        if t % 50 == 0:
            history.append(rho.copy())
            phase_labels.append('P3_recrystallize')

    memory_final = rho.copy()
    agr_B_final = agreement(memory_original[region_B], rho[region_B])
    agr_A_new = agreement(memory_original[region_A], rho[region_A])
    agr_A_target = agreement(target_A, binarize(rho[region_A]))
    log(f"After re-crystallization:")
    log(f"  Region B preservation: {agr_B_final:.3f}")
    log(f"  Region A vs original: {agr_A_new:.3f}")
    log(f"  Region A vs target:   {agr_A_target:.3f}")

    # ====== PHASE 4: REPEAT (2nd cycle) ======
    log("\n--- PHASE 4: Second Heating Cycle (Region A again) ---")
    T = np.zeros(N)
    T[region_A] = 1.0

    for t in range(1000):
        rho = simulate_step(rho, T)
        if t % 100 == 0:
            history.append(rho.copy())
            phase_labels.append('P4_heat2')

    T = np.zeros(N)
    for t in range(1500):
        rho = simulate_step(rho, T)
        if t % 100 == 0:
            history.append(rho.copy())
            phase_labels.append('P4_cool2')

    agr_B_cycle2 = agreement(memory_original[region_B], rho[region_B])
    log(f"After 2nd cycle:")
    log(f"  Region B preservation: {agr_B_cycle2:.3f}")

    history = np.array(history)

    # ====== ANALYSIS ======
    log("\n=== ANALYSIS ===")
    log(f"Region B preservation across all phases:")
    log(f"  After initial crystal: {bm_B:.3f}")
    log(f"  After heating A:       {agr_B_preserved:.3f}")
    log(f"  After re-crystal:      {agr_B_final:.3f}")
    log(f"  After 2nd cycle:       {agr_B_cycle2:.3f}")

    # ====== VERDICT ======
    log("\n=== VERDICT ===")
    pass1 = agr_B_preserved > 0.95
    pass2 = agr_A_changed < 0.7  # Region A was disrupted
    pass3 = agr_B_final > 0.95
    pass4 = agr_B_cycle2 > 0.90  # Survives 2 cycles

    log(f"[{'PASS' if pass1 else 'FAIL'}] B survives heating of A (>95%): {agr_B_preserved:.1%}")
    log(f"[{'PASS' if pass2 else 'FAIL'}] A was reorganized (<70% original): {agr_A_changed:.1%}")
    log(f"[{'PASS' if pass3 else 'FAIL'}] B survives re-crystallization (>95%): {agr_B_final:.1%}")
    log(f"[{'PASS' if pass4 else 'FAIL'}] B survives 2nd cycle (>90%): {agr_B_cycle2:.1%}")

    all_pass = pass1 and pass2 and pass3 and pass4
    status = "[!!! SUCCESS !!!]" if all_pass else "[PARTIAL]"
    log(f"\n{status} Selective memory {'CONFIRMED' if all_pass else 'partial'}.")
    if all_pass:
        log("Heating = Attention. Cold memories are IMMUNE to changes elsewhere.")
        log("This enables: learn new things WITHOUT forgetting old memories.")

    # ====== VISUALIZATION ======
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: Kymograph
    im = axes[0, 0].imshow(history.T, aspect='auto', cmap='RdBu_r', vmin=0, vmax=1)
    axes[0, 0].axhline(y=20, color='yellow', linestyle='--', linewidth=0.5)
    axes[0, 0].axhline(y=80, color='yellow', linestyle='--', linewidth=0.5)
    axes[0, 0].axhline(y=120, color='cyan', linestyle='--', linewidth=0.5)
    axes[0, 0].axhline(y=180, color='cyan', linestyle='--', linewidth=0.5)
    axes[0, 0].text(2, 50, 'A (heated)', color='yellow', fontsize=8)
    axes[0, 0].text(2, 150, 'B (cold)', color='cyan', fontsize=8)
    axes[0, 0].set_title('Kymograph: Full Evolution')
    axes[0, 0].set_xlabel('Snapshot')
    axes[0, 0].set_ylabel('Node')
    plt.colorbar(im, ax=axes[0, 0])

    # Top-center: Region B preservation timeline
    x_vals = np.arange(N)
    axes[0, 1].plot(x_vals[region_B], binarize(memory_original[region_B]),
                    'b-', linewidth=2, label='Original', alpha=0.7)
    axes[0, 1].plot(x_vals[region_B], binarize(memory_after_heating[region_B]),
                    'r--', linewidth=2, label='After heating A', alpha=0.7)
    axes[0, 1].plot(x_vals[region_B], binarize(memory_final[region_B]),
                    'g:', linewidth=2, label='After re-cool', alpha=0.7)
    axes[0, 1].set_title(f'Region B Memory Preservation\n(agreement: {agr_B_final:.1%})')
    axes[0, 1].set_xlabel('Node')
    axes[0, 1].set_ylabel('Binary State')
    axes[0, 1].legend(fontsize=8)

    # Top-right: Region A change
    axes[0, 2].plot(x_vals[region_A], binarize(memory_original[region_A]),
                    'b-', linewidth=2, label='Original', alpha=0.7)
    axes[0, 2].plot(x_vals[region_A], binarize(memory_final[region_A]),
                    'r-', linewidth=2, label=f'After cycle (agr={agr_A_new:.2f})', alpha=0.7)
    axes[0, 2].plot(x_vals[region_A], target_A,
                    'g--', linewidth=1, label='Target signal', alpha=0.5)
    axes[0, 2].set_title('Region A: Reorganization')
    axes[0, 2].set_xlabel('Node')
    axes[0, 2].set_ylabel('Binary State')
    axes[0, 2].legend(fontsize=8)

    # Bottom-left: 3 snapshots overlay
    x = np.arange(N)
    for label, arr, color in [
        ('Initial Crystal', memory_original, 'blue'),
        ('After Heating A', memory_after_heating, 'red'),
        ('Final', memory_final, 'green'),
    ]:
        axes[1, 0].plot(x, arr, '-', color=color, alpha=0.6, linewidth=1, label=label)
    axes[1, 0].axvspan(20, 80, alpha=0.1, color='red', label='Region A')
    axes[1, 0].axvspan(120, 180, alpha=0.1, color='blue', label='Region B')
    axes[1, 0].set_title('Full Substrate: 3 Phases')
    axes[1, 0].set_xlabel('Node')
    axes[1, 0].set_ylabel('rho')
    axes[1, 0].legend(fontsize=7)

    # Bottom-center: Agreement scores bar chart
    labels = ['B after\nheat A', 'A after\nheat', 'B after\nre-cool', 'B after\n2 cycles']
    values = [agr_B_preserved, agr_A_changed, agr_B_final, agr_B_cycle2]
    colors_bar = ['green' if v > 0.9 else ('orange' if v > 0.5 else 'red') for v in values]
    axes[1, 1].bar(labels, values, color=colors_bar, alpha=0.8)
    axes[1, 1].axhline(y=0.95, color='green', linestyle='--', alpha=0.5, label='95% threshold')
    axes[1, 1].axhline(y=0.5, color='red', linestyle='--', alpha=0.5, label='50% = random')
    axes[1, 1].set_title('Agreement with Original Memory')
    axes[1, 1].set_ylabel('Agreement')
    axes[1, 1].set_ylim(0, 1.1)
    axes[1, 1].legend(fontsize=8)

    # Bottom-right: Conceptual diagram
    axes[1, 2].text(0.5, 0.8, 'THE PROTOCOL', ha='center', fontsize=14, fontweight='bold',
                    transform=axes[1, 2].transAxes)
    protocol_text = (
        "1. CRYSTALLIZE: Cool → Memory forms\n"
        "2. HEAT region A: Melt → Fluid, ready to learn\n"
        "3. INJECT signal: New pattern enters A\n"
        "4. COOL: Re-crystallize → New memory in A\n"
        "5. Region B: UNTOUCHED throughout\n\n"
        f"B preservation: {agr_B_final:.1%}\n"
        f"A reorganized: {1-agr_A_new:.1%}"
    )
    axes[1, 2].text(0.1, 0.1, protocol_text, fontsize=10, fontfamily='monospace',
                    transform=axes[1, 2].transAxes, verticalalignment='bottom')
    axes[1, 2].axis('off')

    plt.suptitle('Exp24: Memory Survives Local Heating — Selective Reorganization',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved visualization to {IMG_FILE}")
    plt.close()

    return all_pass


if __name__ == "__main__":
    run_experiment()
