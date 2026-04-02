
import sys
import os
import numpy as np
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.animation as animation
import random

# Adjust path to find lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

from hypergraph import SimpleWolframSystem
from operators import apply_asymmetric_laplacian, apply_laplacian

def run_competitive_survival(sim_steps=400):
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp04_competitive_survival.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 01: COMPETITIVE SURVIVAL ---\n")

    print("Initializing Species Rivalry: The War of Geometries (Level 4)...")
    with open(log_file, "a") as f: f.write("Initializing Species Rivalry: The War of Geometries (Level 4)...\n")
    
    # 1. Environment: Large Grid Arena
    rows, cols = 15, 30
    G_raw = nx.grid_2d_graph(rows, cols)
    mapping = {node: i for i, node in enumerate(G_raw.nodes())}
    reverse_mapping = {i: node for node, i in mapping.items()}
    G = nx.relabel_nodes(G_raw, mapping)
    
    nodes = list(G.nodes())
    adj = {n: set(G.neighbors(n)) for n in nodes}
    
    class ArenaSystem:
        def get_adjacency_list(self): return adj
    system = ArenaSystem()
    
    # 2. Fields (Two Species)
    mass_red = {n: 0.0 for n in nodes}   # Species RED: Fast, Aggressive
    mass_blue = {n: 0.0 for n in nodes}  # Species BLUE: Slow, Stable
    
    # Starting Positions
    for n, (r, c) in reverse_mapping.items():
        if c < 2: mass_red[n] = 5.0
        if c > cols - 3: mass_blue[n] = 5.0
        
    # Central Resource Hub (Pheromone Source)
    resource_nodes = [n for n, (r, c) in reverse_mapping.items() if (cols/2-2 < c < cols/2+2 and rows/2-2 < r < rows/2+2)]
    
    pheromone = {n: 0.0 for n in nodes}
    
    # Physics Params
    DT = 0.1
    
    # Red: High Diffusion, High Speed
    # Blue: High Growth, High Bridge Strength
    
    history = []
    pos = {n: (reverse_mapping[n][1], -reverse_mapping[n][0]) for n in nodes}
    
    msg = f"Arena Ready: {len(nodes)} locations. Hub at Center."
    print(msg)
    with open(log_file, "a") as f: f.write(msg + "\n")

    for t in range(sim_steps):
        # A. Resource Production
        for n in resource_nodes:
            pheromone[n] = 15.0
            
        # B. Diffusion (Signal)
        lap_p = apply_laplacian(pheromone, system)
        new_pheromone = {}
        for n in nodes:
            p = pheromone.get(n, 0)
            b_total = mass_red.get(n, 0) + mass_blue.get(n, 0)
            dp = (lap_p.get(n, 0) * 1.0) - (0.1 * p) + (b_total * 0.1)
            new_pheromone[n] = np.clip(p + dp * DT, 0, 20.0)
        pheromone = new_pheromone
        
        # C. Competitive Metric (Metric Warping)
        # Each species creates its own preferred flow field
        weights_red = {}
        weights_blue = {}
        
        for u in nodes:
            pu = pheromone.get(u, 0)
            mr_u = mass_red.get(u, 0)
            mb_u = mass_blue.get(u, 0)
            
            for v in adj[u]:
                pv = pheromone.get(v, 0)
                mr_v = mass_red.get(v, 0)
                mb_v = mass_blue.get(v, 0)
                
                # Scent attraction
                scent = max(0, pv - pu)
                
                # INTERFERENCE: Mass of one species blocks the other (Contact Inhibition)
                # If Blue is already at v, Red finds it hard to flow there.
                weights_red[(u,v)] = 0.1 + (scent * 5.0) / (1.0 + mb_v)
                weights_blue[(u,v)] = 0.1 + (scent * 5.0) / (1.0 + mr_v)
        
        # D. Evolution (Reaction-Advection-Diffusion)
        # Species RED: Fast flow (multiplier 4.0)
        adv_red = apply_asymmetric_laplacian(mass_red, system, weights_red)
        # Species BLUE: Slow flow (multiplier 1.5) but stable growth
        adv_blue = apply_asymmetric_laplacian(mass_blue, system, weights_blue)
        
        new_red = {}
        new_blue = {}
        
        for n in nodes:
            r = mass_red.get(n, 0)
            b = mass_blue.get(n, 0)
            
            # Growth: Lenia Niche
            # Red has a wider, more energetic niche but faster decay
            gr = 1.8 * np.exp(-((r - 2.5)**2) / 1.5) - 0.6
            # Blue has a narrow, very stable niche
            gb = 2.5 * np.exp(-((b - 3.0)**2) / 0.8) - 0.4
            
            # Interspecies competition for energy at node n
            # If total mass > 10, they suffocate
            suffocation = 0.05 * (r + b)
            
            dr = (adv_red.get(n, 0) * 4.0) + gr - (0.1 * r) - suffocation
            db = (adv_blue.get(n, 0) * 1.5) + gb - (0.02 * b) - suffocation
            
            new_red[n] = np.clip(r + dr * DT, 0, 10.0)
            new_blue[n] = np.clip(b + db * DT, 0, 10.0)
            
        mass_red = new_red
        mass_blue = new_blue
        
        if t % 10 == 0:
            history.append({
                'red': mass_red.copy(),
                'blue': mass_blue.copy(),
                't': t
            })
            if t % 100 == 0:
                msg = f" T={t}: Red Population={sum(mass_red.values()):.1f}, Blue={sum(mass_blue.values()):.1f}"
                print(msg)
                with open(log_file, "a") as f: f.write(msg + "\n")

    # 4. Rendering
    print(f"Generating Competition Animation...")
    fig, ax = plt.subplots(figsize=(12, 6))
    
    def update(frame_idx):
        ax.clear()
        data = history[frame_idx]
        mr = data['red']
        mb = data['blue']
        
        # Color nodes by dominance
        # R=Red mass, B=Blue mass, G=0
        node_colors = []
        for n in nodes:
            r_val = np.clip(mr.get(n, 0) / 10.0, 0, 1)
            b_val = np.clip(mb.get(n, 0) / 10.0, 0, 1)
            # Mixed species look purple/gray
            node_colors.append((r_val, 0.2, b_val))
            
        nx.draw_networkx_nodes(G, pos, node_size=50, node_color=node_colors, ax=ax)
        nx.draw_networkx_edges(G, pos, alpha=0.05, ax=ax)
        
        # Labels
        red_pop = sum(mr.values())
        blue_pop = sum(mb.values())
        ax.set_title(f"Solitone War: Red (Aggressive) vs Blue (Stable) | T={data['t']}\nRed Mass: {red_pop:.1f} | Blue Mass: {blue_pop:.1f}")
        ax.axis('off')
        ax.set_facecolor('#050505')
        
    ani = animation.FuncAnimation(fig, update, frames=len(history), interval=100)
    save_file = output_path + 'exp04_competitive_survival.gif'
    ani.save(save_file, writer='pillow', fps=10)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_competitive_survival()
