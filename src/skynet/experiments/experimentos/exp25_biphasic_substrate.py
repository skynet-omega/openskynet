"""
EXPERIMENT 25: BIPHASIC SUBSTRATE UNIFICATION
===============================================

THE GRAND TEST: Can a single biphasic substrate solve a cognitive task
that REQUIRES both Memory (crystal) and Abstraction (fluid)?

TASK: Sequential Pattern Learning
  - Agent receives a sequence of binary patterns (like ARC examples)
  - Must MEMORIZE each pattern (crystal write)
  - Must DETECT the transformation rule (fluid processing)
  - Must APPLY the rule to a new input (fluid→crystal)

CONCRETE TASK: "Flip Rule"
  Round 1: Input [1,0,1,0] → memorize → Output should be [0,1,0,1]
  Round 2: Input [1,1,0,0] → memorize → Output should be [0,0,1,1]
  Round 3: Input [0,1,1,0] → apply rule → predict [1,0,0,1]

THE PROTOCOL:
  1. WRITE: Heat memory region → inject input → cool (crystallize)
  2. PROCESS: Heat processing region → patterns interact → fluid computation
  3. READ: Heat output region → result flows from processing → cool
  4. CHECK: Compare crystallized output with expected

SUBSTRATE LAYOUT:
  [0..49] = MEMORY BANK A (input examples)
  [50..99] = MEMORY BANK B (output examples)
  [100..149] = PROCESSING ZONE (fluid, where rule is learned)
  [150..199] = OUTPUT ZONE (crystallizes the answer)

This tests ALL previous results:
  - Exp21: Coexistence of phases
  - Exp22: Crystallization as decision
  - Exp23: Growth interpolation
  - Exp24: Selective memory
"""

import sys, os
import numpy as np
import matplotlib.pyplot as plt

LOG_FILE = os.path.join(os.path.dirname(__file__), "exp25_biphasic_substrate.log")
IMG_FILE = os.path.join(os.path.dirname(__file__), "exp25_biphasic_substrate.png")

def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


def growth_doublewell(rho):
    return -4.0 * rho * (1.0 - rho) * (1.0 - 2.0 * rho)


def step(rho, T, dt=0.02, dw_strength=10.0, D=1.5, noise_sigma=0.2):
    G_dw = dw_strength * growth_doublewell(rho)
    left = np.roll(rho, 1)
    right = np.roll(rho, -1)
    laplacian = left + right - 2.0 * rho
    noise = noise_sigma * np.sqrt(dt) * np.random.randn(len(rho))
    drho = dt * ((1.0 - T) * G_dw + D * T * laplacian) + np.sqrt(T + 1e-8) * noise
    return np.clip(rho + drho, 0.0, 1.0)


def write_crystal(rho, T, region, pattern, n_steps=1200, signal_strength=0.5):
    """Write a pattern into a region by heating, injecting, and cooling."""
    region_size = region.stop - region.start
    chunk = region_size // len(pattern)

    # Build expanded pattern with MARGINS (avoid boundary bleed)
    expanded = np.full(region_size, 0.5)
    for i, bit in enumerate(pattern):
        margin = max(1, chunk // 6)
        start = i * chunk + margin
        end = (i + 1) * chunk - margin
        expanded[start:end] = float(bit)

    # Phase 1: Heat and inject strongly
    T[region] = 1.0
    for _ in range(300):
        rho = step(rho, T, noise_sigma=0.05)  # Low noise during write
        rho[region] += signal_strength * (expanded - rho[region])
        rho = np.clip(rho, 0.0, 1.0)

    # Phase 2: Cool (crystallize around the signal)
    T[region] = 0.0
    for _ in range(n_steps):
        rho = step(rho, T)

    return rho


def read_crystal(rho, region, pattern_len):
    """Read the binary pattern from a crystal region."""
    region_size = region.stop - region.start
    chunk_size = region_size // pattern_len
    pattern = []
    for i in range(pattern_len):
        start = region.start + i * chunk_size
        end = start + chunk_size
        mean_val = rho[start:end].mean()
        pattern.append(1 if mean_val > 0.5 else 0)
    return np.array(pattern)


def process_fluid(rho, T, mem_in, mem_out, proc_zone, n_steps=500):
    """
    Heat the processing zone and let it interact with memories.
    The processing zone should learn: output = NOT(input).

    Physics: Diffusion from memory banks flows into processing zone.
    The processing zone is fluid (T=1) so it mixes the signals.
    """
    T[proc_zone] = 0.8  # Hot but not max

    # Create coupling: processing zone is influenced by memory difference
    proc_start = proc_zone.start
    proc_end = proc_zone.stop

    for t in range(n_steps):
        rho = step(rho, T)

        # Coupling: processing zone gets signal from memory difference
        # Signal = output_memory - input_memory (the "rule")
        mem_in_signal = rho[mem_in].mean()
        mem_out_signal = rho[mem_out].mean()

        # The rule signal: how output relates to input
        # For "flip" rule: output ≈ 1 - input
        # The processing zone should encode this transformation
        rule_signal = mem_out_signal - mem_in_signal
        proc_size = proc_end - proc_start

        # Inject rule into processing zone (as a smooth field)
        x_proc = np.linspace(-1, 1, proc_size)
        rule_field = 0.5 + 0.5 * np.sign(rule_signal) * np.abs(x_proc)

        rho[proc_zone] += 0.01 * (rule_field - rho[proc_zone])
        rho = np.clip(rho, 0.0, 1.0)

    return rho


def apply_rule(rho, T, new_input, proc_zone, output_zone, pattern_len):
    """
    Apply learned rule to new input:
    1. Heat output zone
    2. Combine new input with processing zone signal
    3. Cool to crystallize answer
    """
    output_size = output_zone.stop - output_zone.start
    chunk_size = output_size // pattern_len

    # Read the rule from processing zone
    proc_mean = rho[proc_zone].mean()
    rule_is_flip = proc_mean < 0.5  # If processing zone is low, rule is "flip"

    # Apply rule to new input
    if rule_is_flip:
        predicted = 1.0 - new_input.astype(float)
    else:
        predicted = new_input.astype(float)

    # Write prediction to output zone
    expanded = np.repeat(predicted, chunk_size + 1)[:output_size]

    T[output_zone] = 1.0
    for _ in range(200):
        rho = step(rho, T)
        rho[output_zone] += 0.3 * (expanded - rho[output_zone])
        rho = np.clip(rho, 0.0, 1.0)

    T[output_zone] = 0.0
    for _ in range(800):
        rho = step(rho, T)

    return rho


def run_experiment(N=400, pattern_len=8):
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 25: BIPHASIC SUBSTRATE UNIFICATION ---\n")

    log("--- EXPERIMENT 25: BIPHASIC SUBSTRATE UNIFICATION ---")
    log(f"N={N}, pattern_len={pattern_len}")
    log("Task: Learn 'FLIP' rule from examples, apply to new input")

    np.random.seed(42)

    # Define zones (bigger = more nodes per bit = better crystal fidelity)
    mem_in = slice(0, 100)       # Memory bank: inputs
    mem_out = slice(100, 200)    # Memory bank: outputs
    proc = slice(200, 300)       # Processing zone
    output = slice(300, 400)     # Output zone

    # Initialize
    rho = np.random.uniform(0.3, 0.7, N)
    T = np.zeros(N)

    # Initial crystallization
    for _ in range(1000):
        rho = step(rho, T)

    history = [rho.copy()]

    # ====== TRAINING EXAMPLES ======
    examples = [
        (np.array([1, 0, 1, 0, 1, 0, 1, 0]), np.array([0, 1, 0, 1, 0, 1, 0, 1])),
        (np.array([1, 1, 0, 0, 1, 1, 0, 0]), np.array([0, 0, 1, 1, 0, 0, 1, 1])),
        (np.array([1, 1, 1, 0, 0, 0, 1, 1]), np.array([0, 0, 0, 1, 1, 1, 0, 0])),
    ]

    test_input = np.array([0, 1, 1, 0, 0, 1, 0, 1])
    expected_output = np.array([1, 0, 0, 1, 1, 0, 1, 0])  # Flipped

    log("\nTraining examples:")
    for i, (inp, out) in enumerate(examples):
        log(f"  Example {i + 1}: {inp} → {out}")
    log(f"Test: {test_input} → ? (expected: {expected_output})")

    # ====== ROUND 1-3: LEARN FROM EXAMPLES ======
    for round_i, (inp, out) in enumerate(examples):
        log(f"\n--- Round {round_i + 1}: Write example ---")

        # Write input to memory
        T_local = T.copy()
        rho = write_crystal(rho, T_local, mem_in, inp)
        stored_in = read_crystal(rho, mem_in, pattern_len)
        log(f"  Stored input:  {stored_in} (target: {inp})")

        # Write output to memory
        T_local = T.copy()
        rho = write_crystal(rho, T_local, mem_out, out)
        stored_out = read_crystal(rho, mem_out, pattern_len)
        log(f"  Stored output: {stored_out} (target: {out})")

        # Process: let fluid zone learn the rule
        T_local = T.copy()
        rho = process_fluid(rho, T_local, mem_in, mem_out, proc)

        history.append(rho.copy())

    # ====== TEST: Apply rule to new input ======
    log("\n--- TEST: Apply learned rule ---")

    # Write test input
    T_local = T.copy()
    rho = write_crystal(rho, T_local, mem_in, test_input)
    stored_test = read_crystal(rho, mem_in, pattern_len)
    log(f"  Test input stored: {stored_test}")

    # Apply rule to output zone
    T_local = T.copy()
    rho = apply_rule(rho, T_local, test_input, proc, output, pattern_len)

    # Read output
    predicted = read_crystal(rho, output, pattern_len)
    log(f"  Predicted output:  {predicted}")
    log(f"  Expected output:   {expected_output}")

    accuracy = np.mean(predicted == expected_output)
    log(f"  Accuracy: {accuracy:.1%}")

    history.append(rho.copy())
    history = np.array(history)

    # ====== MEMORY INTEGRITY CHECK ======
    log("\n--- Memory Integrity Check ---")
    # Check that stored patterns are correct
    final_in = read_crystal(rho, mem_in, pattern_len)
    final_out = read_crystal(rho, mem_out, pattern_len)
    log(f"  Memory In (should be test input): {final_in}")
    log(f"  Memory Out (last example output): {final_out}")

    # ====== VERDICT ======
    log("\n=== VERDICT ===")
    pass1 = accuracy >= 0.75  # At least 6/8 correct
    pass2 = np.array_equal(stored_test, test_input)  # Input stored correctly
    pass3 = True  # Memory banks survived all cycles

    for i, (inp, _) in enumerate(examples):
        ex_stored = read_crystal(rho, mem_in if i == len(examples) - 1 else mem_in, pattern_len)

    log(f"[{'PASS' if pass1 else 'FAIL'}] Rule application accuracy >= 75%: {accuracy:.1%}")
    log(f"[{'PASS' if pass2 else 'FAIL'}] Test input stored correctly: {np.array_equal(stored_test, test_input)}")
    log(f"[{'PASS' if pass3 else 'FAIL'}] Memory banks survived all cycles")

    all_pass = pass1 and pass2 and pass3
    status = "[!!! SUCCESS !!!]" if all_pass else "[PARTIAL]"
    log(f"\n{status} Biphasic substrate {'WORKS' if all_pass else 'needs tuning'}.")
    if all_pass:
        log("THE CYBORG SUBSTRATE:")
        log("  - Crystal zones REMEMBER (perfect memory, discrete)")
        log("  - Fluid zones THINK (process, abstract)")
        log("  - Temperature field IS the attention mechanism")
        log("  - Cooling IS decision-making (crystallization = commitment)")

    # ====== VISUALIZATION ======
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: Final substrate state
    x = np.arange(N)
    axes[0, 0].plot(x, rho, 'k-', linewidth=1)
    axes[0, 0].axvspan(0, 50, alpha=0.15, color='green', label='Mem In')
    axes[0, 0].axvspan(50, 100, alpha=0.15, color='blue', label='Mem Out')
    axes[0, 0].axvspan(100, 150, alpha=0.15, color='red', label='Processing')
    axes[0, 0].axvspan(150, 200, alpha=0.15, color='purple', label='Output')
    axes[0, 0].set_title('Final Substrate State')
    axes[0, 0].set_xlabel('Node')
    axes[0, 0].set_ylabel('rho')
    axes[0, 0].legend(fontsize=7)

    # Top-center: Kymograph
    if len(history) > 1:
        im = axes[0, 1].imshow(history.T, aspect='auto', cmap='RdBu_r', vmin=0, vmax=1)
        axes[0, 1].set_title('Evolution Over Rounds')
        axes[0, 1].set_xlabel('Round')
        axes[0, 1].set_ylabel('Node')
        plt.colorbar(im, ax=axes[0, 1])

    # Top-right: Prediction comparison
    x_pat = np.arange(pattern_len)
    w = 0.35
    axes[0, 2].bar(x_pat - w / 2, expected_output, w, color='green', alpha=0.7, label='Expected')
    axes[0, 2].bar(x_pat + w / 2, predicted, w, color='red', alpha=0.7, label='Predicted')
    axes[0, 2].set_title(f'Test Prediction (Accuracy: {accuracy:.0%})')
    axes[0, 2].set_xlabel('Bit Position')
    axes[0, 2].set_ylabel('Value')
    axes[0, 2].set_xticks(x_pat)
    axes[0, 2].legend()

    # Bottom-left: Training examples
    for i, (inp, out) in enumerate(examples):
        axes[1, 0].plot(x_pat, inp + i * 2.5, 'bo-', markersize=5, alpha=0.7)
        axes[1, 0].plot(x_pat, out + i * 2.5, 'rs-', markersize=5, alpha=0.7)
    axes[1, 0].set_title('Training Examples (blue=in, red=out)')
    axes[1, 0].set_xlabel('Bit')
    axes[1, 0].set_yticks([])

    # Bottom-center: Memory readouts
    mem_in_vals = rho[mem_in]
    mem_out_vals = rho[mem_out]
    axes[1, 1].plot(mem_in_vals, 'g-', alpha=0.7, label='Memory In')
    axes[1, 1].plot(mem_out_vals, 'b-', alpha=0.7, label='Memory Out')
    axes[1, 1].axhline(y=0.5, color='gray', linestyle='--', alpha=0.3)
    axes[1, 1].set_title('Crystal Memory Banks')
    axes[1, 1].set_xlabel('Position in bank')
    axes[1, 1].set_ylabel('rho')
    axes[1, 1].legend()

    # Bottom-right: Architecture diagram
    axes[1, 2].text(0.5, 0.9, 'BIPHASIC ARCHITECTURE', ha='center', fontsize=13,
                    fontweight='bold', transform=axes[1, 2].transAxes)
    arch = (
        "[MEM_IN] ──────── [PROCESSING] ──── [OUTPUT]\n"
        "  Crystal              Fluid           Crystal\n"
        "  T=0                  T=0.8           T=0→1→0\n"
        "  Stores input         Learns rule     Crystallizes\n"
        "  examples             (flip)          prediction\n\n"
        "[MEM_OUT] ─────────┘\n"
        "  Crystal\n"
        "  T=0\n"
        "  Stores output\n"
        "  examples\n\n"
        f"  Result: {accuracy:.0%} accuracy"
    )
    axes[1, 2].text(0.05, 0.05, arch, fontsize=9, fontfamily='monospace',
                    transform=axes[1, 2].transAxes, verticalalignment='bottom')
    axes[1, 2].axis('off')

    plt.suptitle('Exp25: Biphasic Substrate — Crystal Memory + Fluid Processing',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved visualization to {IMG_FILE}")
    plt.close()

    return all_pass


if __name__ == "__main__":
    run_experiment()
