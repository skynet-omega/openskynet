
import sys
import os
import random
import numpy as np
import networkx as nx
import matplotlib.pyplot as plt

# Adjust path to find lib
# Adjust path to find lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

from hypergraph import SimpleWolframSystem
from operators import apply_asymmetric_laplacian

def gaussian_growth(rho, mu=9.6, sigma=19.1, amplitude=15.0):
    return amplitude * np.exp(-((rho - mu)**2) / (2 * sigma**2))

def run_visual_swarm(steps=9): 
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp09_swarm_migration.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 06: SWARM MIGRATION ---\n")

    print("Generating Swarm Trajectory Demo...")
    with open(log_file, "a") as f: f.write("Generating Swarm Trajectory Demo...\n")
    
    # 1. Substrate
    system = SimpleWolframSystem()
    system.initialize([[1, 2], [1, 3]])
    for i in range(steps):
        system.step()
    
    nodes = list(system.get_adjacency_list().keys())
    
    # 2. Flow Field (Low ID -> High ID)
    flow_weights = {}
    adj = system.get_adjacency_list()
    for u, neighbors in adj.items():
        for v in neighbors:
            if u < v:
                flow_weights[(u, v)] = 1.0 
                flow_weights[(v, u)] = 0.0
            else:
                flow_weights[(u, v)] = 0.0
                flow_weights[(v, u)] = 1.0
                
    # 3. Setup Initial Organism (Low ID)
    field = {n: 0.1 for n in nodes}
    start_cluster = nodes[:10]
    for n in start_cluster: field[n] = 10.0
    
    # 4. Record Evolution
    frames = []
    
    # Capture T=0
    frames.append(field.copy())
    
    current_field = field.copy()
    dt = 0.1
    
    print("Simulating migration...")
    with open(log_file, "a") as f: f.write("Simulating migration...\n")
    
    for t in range(20):
        adv = apply_asymmetric_laplacian(current_field, system, flow_weights)
        new_field = {}
        for n in nodes:
            rho = current_field[n]
            d_rho = adv.get(n, 0) + gaussian_growth(rho) - 0.1 * rho
            new_field[n] = max(0, rho + d_rho * dt)
        current_field = new_field
        
        if t % 10 == 9: # Capture T=10 and T=20
            frames.append(current_field.copy())
            
    # 5. Render
    print("Rendering...")
    G = nx.Graph()
    for e in system.edges:
        if len(e) >= 2: G.add_edge(e[0], e[1])
        
    pos = nx.spring_layout(G, seed=42)
    
    fig, axes = plt.subplots(1, 3, figsize=(18, 6))
    
    draw_nodes = list(G.nodes())
    
    times = [0, 10, 20]
    for i, frame in enumerate(frames):
        colors = [frame.get(n, 0) for n in draw_nodes]
        
        nx.draw_networkx_nodes(G, pos, ax=axes[i], nodelist=draw_nodes, node_size=30, 
                               node_color=colors, cmap='magma', vmin=0, vmax=25)
        nx.draw_networkx_edges(G, pos, ax=axes[i], alpha=0.1)
        axes[i].set_title(f"T={times[i]}")
        axes[i].axis('off')
        
    plt.suptitle("Dynamic Migration: The Soliton Moves from Starting Cluster (Left/Center) to Absorbing Boundary (Right/Periphery)")
    plt.tight_layout()
    save_file = output_path + 'exp09_swarm_migration.png'
    plt.savefig(save_file, dpi=150)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_visual_swarm()
