
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

def run_causal_expansion(sim_steps=500): 
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp05_causal_expansion.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 02: CAUSAL EXPANSION ---\n")

    print("Initializing Causal Lenia: The Autopoiesis Test (Level 3)...")
    with open(log_file, "a") as f: f.write("Initializing Causal Lenia: The Autopoiesis Test (Level 3)...\n")
    
    # 1. Create two disconnected islands
    G = nx.Graph()
    # Island A (Swarm Birthplace)
    for i in range(15):
        for j in range(10):
            G.add_edge(f"A_{i}_{j}", f"A_{i+1}_{j}")
            G.add_edge(f"A_{i}_{j}", f"A_{i}_{j+1}")
            
    # Island B (Goal Island)
    offset = 25 
    for i in range(5):
        for j in range(5):
            G.add_edge(f"B_{i}_{j}", f"B_{i+1}_{j}")
            G.add_edge(f"B_{i}_{j}", f"B_{i}_{j+1}")
    
    mapping = {node: i for i, node in enumerate(G.nodes())}
    reverse_mapping = {i: node for node, i in mapping.items()}
    G = nx.relabel_nodes(G, mapping)
    nodes = list(G.nodes())
    adj = {n: set(G.neighbors(n)) for n in nodes}
    
    class DynamicSystem:
        def __init__(self, adj): self.adj = adj
        def get_adjacency_list(self): return self.adj
    system = DynamicSystem(adj)
    
    # 2. Fields
    biomass = {n: 0.0 for n in nodes}
    st_nodes = [n for n, name in reverse_mapping.items() if str(name).startswith("A_0_")]
    for n in st_nodes: biomass[n] = 8.0
    
    goal_nodes = [n for n, name in reverse_mapping.items() if str(name).startswith("B_4_")]
    pheromone = {n: 0.0 for n in nodes}
    
    history = []
    DT = 0.1
    EXPANSION_THRESHOLD = 2.0 
    
    msg = f"System Ready. Swarm must expand the universe to reach Island B."
    print(msg)
    with open(log_file, "a") as f: f.write(msg + "\n")

    for t in range(sim_steps):
        for n in goal_nodes: pheromone[n] = 20.0
        
        lap_p = apply_laplacian(pheromone, system)
        new_pheromone = {}
        for n in nodes:
            p = pheromone.get(n, 0)
            b = biomass.get(n, 0)
            dp = (lap_p.get(n, 0) * 1.5) - (0.1 * p) + (b * 0.1)
            new_pheromone[n] = np.clip(p + dp * DT, 0, 30.0)
        pheromone = new_pheromone
        
        # C. TRIGGER: CAUSAL EXPANSION (Matter creates Space)
        new_bridges = []
        for n in nodes:
            if biomass[n] > EXPANSION_THRESHOLD:
                my_island = str(reverse_mapping[n])[0]
                if my_island == 'A': 
                    targets = [tn for tn, tname in reverse_mapping.items() if str(tname).startswith('B')]
                    if targets and random.random() < (biomass[n] * 0.02): 
                        target = random.choice(targets)
                        if target not in adj[n]:
                            new_bridges.append((n, target))
        
        for u, v in new_bridges:
            adj[u].add(v)
            adj[v].add(u)
            
        # D. Metric with PRESSURE Flow + SCENT
        flow_weights = {}
        for u in nodes:
            bu = biomass.get(u, 0)
            pu = pheromone.get(u, 0)
            for v in adj[u]:
                bv = biomass.get(v, 0)
                pv = pheromone.get(v, 0)
                # Pressure forces exploration, Scent forces migration
                w = 0.1 + max(0, pv - pu) * 8.0 + max(0, bu - bv) * 1.5
                flow_weights[(u, v)] = w
                
        adv_b = apply_asymmetric_laplacian(biomass, system, flow_weights)
        new_biomass = {}
        for n in nodes:
            b = biomass.get(n, 0)
            g = 2.0 * np.exp(-((b - 3.0)**2) / 2.0) - 0.5 
            db = (adv_b.get(n, 0) * 3.0) + g - (0.02 * b)
            new_biomass[n] = np.clip(b + db * DT, 0, 15.0)
        biomass = new_biomass
        
        if t % 10 == 0:
            history.append({
                'biomass': biomass.copy(),
                'adj': {k: v.copy() for k, v in adj.items()}
            })
            if t % 100 == 0:
                cur_edges = sum(len(v) for v in adj.values()) // 2
                msg = f" T={t}: Goal Mass={sum(biomass[n] for n in goal_nodes):.2f}, Edges={cur_edges}"
                print(msg)
                with open(log_file, "a") as f: f.write(msg + "\n")

    print(f"Generating Causal Expansion Animation...")
    fig, ax = plt.subplots(figsize=(12, 6))
    node_pos = {}
    for n, name in reverse_mapping.items():
        if str(name).startswith("A_"):
            parts = str(name).split("_")
            node_pos[n] = (int(parts[1]), -int(parts[2]))
        else:
            parts = str(name).split("_")
            node_pos[n] = (int(parts[1]) + offset, -int(parts[2]))

    def update(frame_idx):
        ax.clear()
        data = history[frame_idx]
        local_b = data['biomass']
        local_adj = data['adj']
        
        for u, neighbors in local_adj.items():
            for v in neighbors:
                if u < v:
                    color = 'cyan' if str(reverse_mapping[u])[0] != str(reverse_mapping[v])[0] else '#333333'
                    alpha = 0.6 if color == 'cyan' else 0.2
                    ax.plot([node_pos[u][0], node_pos[v][0]], [node_pos[u][1], node_pos[v][1]], color=color, alpha=alpha, lw=0.6)
        
        node_colors = [local_b.get(n, 0) for n in nodes]
        ax.scatter([node_pos[n][0] for n in nodes], [node_pos[n][1] for n in nodes], c=node_colors, cmap='magma', vmin=0, vmax=10, s=30, zorder=3)
        ax.set_title(f"Level 3: Spacetime Autogenesis (T={frame_idx*10})")
        ax.set_facecolor('#050505')
        ax.axis('off')
        
    ani = animation.FuncAnimation(fig, update, frames=len(history), interval=100)
    save_file = output_path + 'exp05_causal_expansion.gif'
    ani.save(save_file, writer='pillow', fps=10)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_causal_expansion()
