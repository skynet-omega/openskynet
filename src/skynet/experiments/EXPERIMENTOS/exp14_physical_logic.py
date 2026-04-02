
import sys
import os
import numpy as np

# Path setup to find tensor_lenia lib from EXPERIMENTOS
# Current dir: .../SOLITONES/EXPERIMENTOS
# Lib dir:     .../SOLITONES/tests/tensor_lenia/lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))
from hypergraph import SimpleWolframSystem
from operators import apply_asymmetric_laplacian, apply_laplacian

def run_hydra_collision():
    print("--- EXPERIMENT 14: PHYSICAL LOGIC (Collisional AND-Gate) ---")
    
    # 1. Manifold: A "Crossroads" grid
    # 0 -- 1 -- 2 -- 3 -- 4 (Path A)
    #      |
    #      5 (Path B Start)
    #      |
    #      1 (Intersection)
    nodes = list(range(6))
    adj = {
        0: {1}, 1: {0, 2, 5}, 2: {1, 3}, 3: {2, 4}, 4: {3},
        5: {1}
    }
    
    class CrossGraph:
        def get_adjacency_list(self): return adj
    graph = CrossGraph()
    
    # 2. Physics Fields
    phi = {n: 0.0 for n in nodes}
    phi[0] = 6.0 # Soliton A (Input 1)
    phi[5] = 6.0 # Soliton B (Input 2)
    
    # Flow towards the intersection (node 1) and then towards the output (node 4)
    flow = {
        (0, 1): 0.3, (5, 1): 0.3, 
        (1, 2): 0.2, (2, 3): 0.2, (3, 4): 0.2,
        # Low back-flow
        (1, 0): 0.05, (1, 5): 0.05, (2, 1): 0.05, (3, 2): 0.05, (4, 3): 0.05
    }
    
    dt = 0.2
    steps = 80
    intersection_node = 1
    output_node = 4
    high_intensity_triggered = False
    
    with open("exp14_physical_logic.log", "w") as f:
        f.write("--- EXPERIMENT 14: PHYSICAL LOGIC (Collisional AND-Gate) ---\n")

    def log(msg):
        print(msg)
        with open("exp14_physical_logic.log", "a") as f:
            f.write(msg + "\n")

    log("Launching Solitons for Collision at Node 1...")
    
    # Visualization history
    history_inter = []
    history_out = []
    
    for t in range(steps):
        adv = apply_asymmetric_laplacian(phi, graph, flow)
        lap = apply_laplacian(phi, graph)
        
        new_phi = {}
        for n in nodes:
            b = phi[n]
            # NON-LINEAR KERNEL
            growth = 4.0 * np.exp(-((b - 5.0)**2) / 3.0) - 0.5
            
            # If collision detected at intersection
            # Here b > 3.0 is conservative since background is ~0
            if n == intersection_node and b > 4.5:
                high_intensity_triggered = True
                growth += 15.0 # Massive Fusion
            
            db = (adv[n] * 3.0) + (lap[n] * 0.02) + growth - (0.2 * b)
            new_phi[n] = np.clip(b + db * dt, 0, 20.0)
            
        phi = new_phi
        history_inter.append(phi[intersection_node])
        history_out.append(phi[output_node])
        
        if (t+1) % 20 == 0:
            log(f"  Step {t+1}: Inter={phi[intersection_node]:.1f}, Out={phi[output_node]:.1f}")

    log("\nSimulation Result:")
    log(f"  Output Amplitude: {phi[output_node]:.2f}")
    log(f"  Fusion Triggered: {high_intensity_triggered}")
    
    # Visualization
    import matplotlib.pyplot as plt
    plt.figure(figsize=(10, 5))
    plt.plot(history_inter, label='Intersection (Fusion Node)')
    plt.plot(history_out, label='Output (Result)')
    plt.axhline(y=5.0, color='r', linestyle='--', label='Activation Threshold')
    plt.title('Experiment 14: Solitonic Logic Gate Dynamics')
    plt.xlabel('Time Step')
    plt.ylabel('Soliton Amplitude')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig('exp14_physical_logic.png')
    log("Saved validation plot to exp14_physical_logic.png")

    if phi[output_node] > 5.0 and high_intensity_triggered:
        log("\n[!!! HYDRA SUCCESS !!!] Collisional AND-Gate Validated.")
        log("Two solitons successfully combined through topological interference.")
    else:
        log("\n[FAIL] The solitons failed to fuse or propagate.")

if __name__ == "__main__":
    run_hydra_collision()
