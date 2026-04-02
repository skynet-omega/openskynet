import torch
import torch.nn as nn
import numpy as np
import os
import sys

# Ensure we can import the engine
sys.path.append(os.path.join(os.path.dirname(__file__), '/home/daroch/SOLITONES/EXPERIMENTOS'))

try:
    from sparse_hydra import SparseHydraEngine
except ImportError:
    # Minimal Mock if engine not found, though it should be.
    class SparseHydraEngine:
        def __init__(self, size, batch_size, device):
            self.num_nodes = size[0]*size[1]
            self.biomass = torch.zeros(batch_size, self.num_nodes).to(device)
            self.L = torch.zeros(self.num_nodes, self.num_nodes).to(device)

print("\n--- EXPERIMENT 1: AUTOPOIESIS (Dynamic Topology) ---")
print("Validating Wolfram's Principle: 'Matter creates Space'")

def run_autopoiesis():
    # 1. Initialize a linear chain (High Diameter)
    nodes = 20
    adj = torch.zeros(nodes, nodes)
    for i in range(nodes-1):
        adj[i, i+1] = 1.0 # One-way flow
    
    # Biomass starts at 0
    biomass = torch.zeros(nodes)
    biomass[0] = 10.0 # Injection
    
    # Logging Setup
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = "exp01_autopoiesis.log"
    with open(output_path + log_file, "w") as f:
        f.write("--- EXPERIMENT 1: AUTOPOIESIS (Dynamic Topology) ---\n")
        f.write(f"Initial Graph Diameter (approx): {nodes} steps\n")
    
    # Visualization Setup
    import matplotlib.pyplot as plt
    import matplotlib.animation as animation
    fig, ax = plt.subplots(figsize=(10, 4))
    ims = []

    print(f"Initial Graph Diameter (approx): {nodes} steps")
    
    new_edges = 0
    
    # 2. Simulation Loop
    for t in range(50):
        # Flow (Simple Advection)
        flow = torch.matmul(adj, biomass) * 0.1
        biomass = biomass + flow
        
        # Decay
        biomass = biomass * 0.9
        
        # Injection
        biomass[0] = 10.0
        
        # DYNAMIC TOPOLOGY RULE
        # If a node is very active, it tries to bridge to a future node ("Wormhole")
        for i in range(nodes-4):
            if biomass[i] > 5.0 and adj[i, i+3] == 0:
                msg = f"[t={t}] 🌟 Autopoiesis Event! Biomass at node {i} ({biomass[i]:.2f}) creates shortcut to {i+3}"
                print(msg)
                with open(output_path + log_file, "a") as f: f.write(msg + "\n")
                
                adj[i, i+3] = 1.0 # Create wormhole
                new_edges += 1
        
        # Snapshot for GIF
        line, = ax.plot(biomass.numpy(), color='green')
        title = ax.text(0.5, 1.05, f"Time: {t}, Edges: {new_edges}", 
                        size=plt.rcParams["axes.titlesize"],
                        ha="center", transform=ax.transAxes)
        ims.append([line, title])

    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    
    ani = animation.ArtistAnimation(fig, ims, interval=100, blit=True, repeat_delay=1000)
    ani.save(output_path + "exp01_autopoiesis.gif", writer='pillow')
    print(f"🎥 Saved {output_path}exp01_autopoiesis.gif")

    final_msg = f"\nFinal State:\n- Edges created by Matter: {new_edges}\n"
    if new_edges > 0:
        final_msg += "✅ SUCCESS: The flow of matter re-wired the space."
    else:
        final_msg += "❌ FAILURE: Space remained static."
    
    print(final_msg)
    with open(output_path + log_file, "a") as f: f.write(final_msg + "\n")

if __name__ == "__main__":
    run_autopoiesis()
