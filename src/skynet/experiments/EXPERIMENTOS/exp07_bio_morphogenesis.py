
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
from operators import apply_laplacian

def gaussian_growth(rho, mu=9.6, sigma=19.1, amplitude=15.0):
    return amplitude * np.exp(-((rho - mu)**2) / (2 * sigma**2))

def run_visual_bio(steps=9): # Use slightly smaller graph for cleaner viz
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp07_bio_morphogenesis.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 04: BIO MORPHOGENESIS ---\n")
        
    print("Generating Morphogenesis Visual Demo...")
    with open(log_file, "a") as f: f.write("Generating Morphogenesis Visual Demo...\n")
    
    # 1. Substrate
    system = SimpleWolframSystem()
    system.initialize([[1, 2], [1, 3]])
    for i in range(steps):
        system.step()
        
    nodes = list(system.get_adjacency_list().keys())
    msg = f"Graph Size: {len(nodes)} nodes"
    print(msg)
    with open(log_file, "a") as f: f.write(msg + "\n")
    
    # 2. Setup Field
    field = {n: random.uniform(0, 5) for n in nodes}
    
    # 3. Evolution
    dt = 0.1
    D = -0.05
    decay = 0.1
    
    # Capture Initial State
    initial_field_dict = field.copy() # Keep dict for lookup
    initial_field_list = list(field.values())
    
    print("Simulating evolution...")
    with open(log_file, "a") as f: f.write("Simulating evolution...\n")
    
    current_field = field.copy() # Fix: Don't re-declare 'field' inside loop
    
    for t in range(20):
        lap = apply_laplacian(current_field, system)
        new_field = {}
        for n in nodes:
            rho = current_field[n]
            d_rho = (-D * lap.get(n, 0) + gaussian_growth(rho) - decay * rho) * dt
            new_field[n] = max(0, rho + d_rho)
        current_field = new_field
        
    final_field = list(current_field.values())
    
    # 4. Rendering
    print("Rendering...")
    G = nx.Graph()
    for e in system.edges:
        if len(e) >= 2: G.add_edge(e[0], e[1]) # Only first 2

    # Layout
    pos = nx.spring_layout(G, seed=42)
    
    fig, axes = plt.subplots(1, 2, figsize=(16, 8))
    
    # Plot Initial
    # Important: Must map field values to G.nodes() order strictly
    draw_nodes = list(G.nodes())
    init_colors = [initial_field_dict[n] for n in draw_nodes]
    final_colors = [current_field[n] for n in draw_nodes]

    nx.draw_networkx_nodes(G, pos, ax=axes[0], nodelist=draw_nodes, node_size=30, 
                           node_color=init_colors, cmap='coolwarm', vmin=0, vmax=25)
    nx.draw_networkx_edges(G, pos, ax=axes[0], alpha=0.3)
    axes[0].set_title("Initial State: Random Noise")
    axes[0].axis('off')
    
    # Plot Final
    nx.draw_networkx_nodes(G, pos, ax=axes[1], nodelist=draw_nodes, node_size=30, 
                           node_color=final_colors, cmap='coolwarm', vmin=0, vmax=25)
    nx.draw_networkx_edges(G, pos, ax=axes[1], alpha=0.3)
    axes[1].set_title("Final State: 'Organs' (High Density Clusters)")
    axes[1].axis('off')
    
    plt.tight_layout()
    save_file = output_path + 'exp07_bio_morphogenesis.png'
    plt.savefig(save_file, dpi=150)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_visual_bio()
