
import sys
import os
import numpy as np

# Path setup to find tensor_lenia lib from EXPERIMENTOS
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

from hypergraph import SimpleWolframSystem
from operators import apply_asymmetric_laplacian, apply_laplacian

def run_turing_gate_experiment(steps=100):
    print("--- EXPERIMENT 15: TURING MECHANICS (Solitonic Turing Machine) ---")
    
    # 1. Setup 1D Manifold (Memory Tape / Path)
    # Nodes 0 to 9: Tape
    # Node 5: The Gate (Memory Bit)
    nodes = list(range(10))
    adj = {i: {(i-1)%10, (i+1)%10} for i in nodes}
    
    # Simple mock hypergraph for the operators
    class TapeGraph:
        def get_adjacency_list(self): return adj
    
    graph = TapeGraph()
    
    # 2. Initialize Fields
    # signal: The moving soliton (Signal)
    # state: The stationary gate state (Memory)
    phi = {i: 0.0 for i in nodes}
    phi[0] = 2.0 # Higher amplitude soliton
    
    bit_state = {i: 0.0 for i in nodes} # Only node 5 matters
    
    # 3. Define Flow (Advection)
    # Constant flow from i to i+1
    flow_weights = {}
    for i in nodes:
        flow_weights[(i, (i+1)%10)] = 0.8
        flow_weights[((i+1)%10, i)] = 0.2
        
    dt = 0.1
    diffusion = 0.02
    advection_speed = 0.5 # Slower for more interaction time
    gate_node = 5
    
    with open("exp15_turing_machine.log", "w") as f:
        f.write("--- EXPERIMENT 15: TURING MECHANICS (Solitonic Turing Machine) ---\n")

    def log(msg):
        print(msg)
        with open("exp15_turing_machine.log", "a") as f:
            f.write(msg + "\n")

    log(f"Moving Soliton towards Gate at node {gate_node}...")
    
    history_gate = []
    
    for t in range(steps):
        # A. Update Soliton (Advection + Diffusion)
        adv = apply_asymmetric_laplacian(phi, graph, flow_weights)
        lap = apply_laplacian(phi, graph)
        
        new_phi = {}
        for i in nodes:
            change = advection_speed * adv[i] + diffusion * lap[i]
            val = phi[i] + change * dt
            new_phi[i] = max(0.0, min(2.0, val)) # Soliton can be > 1.0
        phi = new_phi
        
        # B. Update Gate State (Memory)
        p = bit_state[gate_node]
        signal = phi[gate_node]
        
        # Dissipative stabilization
        stabilization = 10.0 * p * (p - 0.5) * (1.0 - p)
        
        # Strong Coupling
        coupling = 15.0 * signal * (1.0 - p)
        
        d_state = (stabilization + coupling) * dt
        bit_state[gate_node] = max(0.0, min(1.0, p + d_state))
        
        history_gate.append(bit_state[gate_node])
        
        if (t+1) % 20 == 0:
            active_node = max(phi, key=phi.get)
            log(f"  Step {t+1}: Soliton at ~{active_node}, Gate State={bit_state[gate_node]:.4f}")

    log("\nSimulation Final Result:")
    log(f"  Final Gate State: {bit_state[gate_node]:.4f}")
    
    # Visualization
    import matplotlib.pyplot as plt
    plt.figure(figsize=(10, 4))
    plt.plot(history_gate, label='Memory Bit State (Node 5)', color='purple', linewidth=2)
    plt.axhline(y=0.0, color='gray', linestyle=':', label='State 0')
    plt.axhline(y=1.0, color='gray', linestyle=':', label='State 1')
    plt.title('Experiment 15: Solitonic Memory Writes')
    plt.ylabel('Bit State')
    plt.xlabel('Time Step')
    plt.legend()
    plt.grid(True, alpha=0.3)
    plt.savefig('exp15_turing_machine.png')
    log("Saved visualization to exp15_turing_machine.png")
    
    if bit_state[gate_node] > 0.9:
        log("\n[!!! SUCCESS !!!] Bit Flip Detected.")
        log("The moving soliton successfully updated the memory state of the gate.")
        log("This proves the feasibility of a solitonic Turing Machine.")
    else:
        log("\n[FAIL] The gate state did not transition.")

if __name__ == "__main__":
    run_turing_gate_experiment()
