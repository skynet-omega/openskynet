
import numpy as np
import matplotlib.pyplot as plt
import os
import sys

def setup_logger():
    log_path = os.path.join(os.path.dirname(__file__), "exp20_chaos_control.log")
    with open(log_path, "w") as f:
        f.write("--- EXPERIMENT 20: CHAOS CONTROL (Lyapunov Feedback) ---\n")
        f.write("Hypothesis: Local feedback on dissipation keeps the system at the Edge of Chaos ($\lambda \\approx 0$).\n")
    return log_path

def log(msg, log_path=None):
    print(msg)
    if log_path:
        with open(log_path, "a") as f:
            f.write(msg + "\n")

def run_chaos_control():
    log_path = setup_logger()
    
    # We use a Logistic Map as a proxy for a local neuron/soliton dynamics
    # x_{t+1} = r * x_t * (1 - x_t)
    # 'r' is the control parameter (analogous to ActivationGain/Dissipation).
    # r=4.0 is Chaos. r=3.0 is Oscillation/Stable. r<1 is Death.
    
    # Control Mechanism:
    # Adjust 'r' based on "Lyapunov Drift"
    # r_{t+1} = r_t - alpha * (Div - Target)
    
    steps = 200
    target_divergence = 0.3 # Target "Separation" (positive but small -> Edge of Chaos)
    # Actually, for edge of chaos we often want Lyapunov ~ 0.
    
    # Let's simulate TWO trajectories very close to each other to measure Divergence
    x1 = 0.5
    x2 = 0.50000001
    epsilon = 1e-8
    
    r = 3.9 # Start in Deep Chaos
    
    r_history = []
    x_history = []
    div_history = []
    
    log(f"Starting Chaos Control. Initial r={r}, Target Divergence ~ Edge of Chaos", log_path)
    
    control_gain = 0.1
    
    for t in range(steps):
        # 1. Update System
        x1_next = r * x1 * (1 - x1)
        x2_next = r * x2 * (1 - x2)
        
        # 2. Measure Local Lyapunov (Analytical)
        # f(x) = r x (1-x) => f'(x) = r(1 - 2x)
        derivative = r * (1 - 2 * x1)
        # Avoid log(0)
        local_lyapunov = np.log(abs(derivative) + 1e-9)
        
        div_history.append(local_lyapunov)
        x_history.append(x1)
        r_history.append(r)
        
        # Update State
        x1 = x1_next
        
        # 4. CONTROL LOOP (Homeostat)
        # Failure Mode A: Chaos (Lyapunov > 0) -> Need MORE Dissipation (Lower r)
        # Failure Mode B: Death (Lyapunov < 0) -> Need LESS Dissipation (Higher r)
        
        # Target Lyapunov = 0 (Criticality)
        error = local_lyapunov - 0.05 # Small positive target for dynamic life
        
        # Feedback:
        # If Error > 0 (Too chaotic), Reduce r
        # If Error < 0 (Too static), Increase r
        r_new = r - control_gain * error
        
        # Clamp r to physical bounds [0, 4]
        r = max(2.5, min(4.0, r_new))
        
        if t % 20 == 0:
            log(f"T={t}: x={x1:.3f}, r={r:.3f}, lambda={local_lyapunov:.3f}", log_path)

    # Target is 0. But for logistic map, chaos starts at 3.56 (Lambda=0).
    # We want to hover there.
    avg_lambda = np.mean(div_history[-50:])
    final_r = r_history[-1]
    
    log(f"\nFinal Steady State:", log_path)
    log(f"  Final r: {final_r:.4f} (Expected ~3.57 for Edge of Chaos)", log_path)
    log(f"  Mean Lyapunov: {avg_lambda:.4f} (Target ~ 0.0)", log_path)
    
    if abs(avg_lambda) < 0.2 and final_r > 3.0:
        log("  [SUCCESS] System self-tuned to Criticality.", log_path)
    else:
        log("  [FAIL] Control failed to stabilize.", log_path)
        
    # Plot
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8))
    
    ax1.plot(x_history, color='k', linewidth=0.5)
    ax1.set_title("Trajectory x(t)")
    ax1.set_ylabel("State")
    
    ax2.plot(r_history, color='r')
    ax2.axhline(y=3.5699, color='g', linestyle='--', label='Feigenbaum Point (Edge)')
    ax2.set_title("Control Parameter r(t)")
    ax2.set_ylabel("r (Growth Rate)")
    ax2.legend()
    
    plt.tight_layout()
    output_png = os.path.join(os.path.dirname(__file__), 'exp20_chaos_control.png')
    plt.savefig(output_png)
    log(f"Saved plot to {output_png}", log_path)

if __name__ == "__main__":
    run_chaos_control()
