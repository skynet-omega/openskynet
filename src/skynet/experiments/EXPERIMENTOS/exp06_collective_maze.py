
import sys
import os
import numpy as np
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.animation as animation

# Adjust path to find lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

from hypergraph import Hypergraph
from operators import apply_asymmetric_laplacian, apply_laplacian

def create_maze_graph(rows=10, cols=20):
    G = nx.grid_2d_graph(rows, cols)
    walls = []
    for r in range(rows):
        if r != 5: walls.append((r, 6))
        if r != 2 and r != 3: walls.append((r, 13))
    G.remove_nodes_from(walls)
    return G

def run_collective_maze(sim_steps=800):
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp06_collective_maze.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 03: COLLECTIVE MAZE ---\n")

    print("Running High-Speed Collective Maze Navigation...")
    with open(log_file, "a") as f: f.write("Running High-Speed Collective Maze Navigation...\n")
    
    G_raw = create_maze_graph()
    mapping = {node: i for i, node in enumerate(G_raw.nodes())}
    reverse_mapping = {i: node for node, i in mapping.items()}
    G = nx.relabel_nodes(G_raw, mapping)
    nodes = list(G.nodes())
    adj = {n: set(G.neighbors(n)) for n in nodes}
    
    class MazeSystem:
        def get_adjacency_list(self): return adj
    system = MazeSystem()
    
    biomass = {n: 0.0 for n in nodes}
    st_nodes = [n for n, (r, c) in reverse_mapping.items() if c < 2]
    for n in st_nodes: biomass[n] = 8.0
    
    goal_nodes = [n for n, (r, c) in reverse_mapping.items() if c > 18]
    pheromone = {n: 0.0 for n in nodes}
    
    DT = 0.2 # Faster time
    history = []
    pos = {n: (reverse_mapping[n][1], -reverse_mapping[n][0]) for n in nodes}
    
    for t in range(sim_steps):
        for n in goal_nodes: pheromone[n] = 20.0 
            
        lap_p = apply_laplacian(pheromone, system)
        new_pheromone = {}
        for n in nodes:
            p = pheromone.get(n, 0)
            b = biomass.get(n, 0)
            # Signal = Goal(20) + Collective(0.5*b)
            dp = (lap_p.get(n, 0) * 1.5) - (0.05 * p) + (b * 0.5)
            new_pheromone[n] = np.clip(p + dp * DT, 0, 30.0)
        pheromone = new_pheromone
        
        flow_weights = {}
        for u in nodes:
            pu = pheromone.get(u, 0)
            for v in adj[u]:
                pv = pheromone.get(v, 0)
                # Aggressive flow to scent
                w = 0.05 + max(0, pv - pu) * 10.0 
                flow_weights[(u, v)] = w
                
        adv_b = apply_asymmetric_laplacian(biomass, system, flow_weights)
        new_biomass = {}
        for n in nodes:
            b = biomass.get(n, 0)
            # Stronger renewal
            g = 2.0 * np.exp(-((b - 3.0)**2) / 2.0) - 0.5 
            db = (adv_b.get(n, 0) * 4.0) + g - (0.02 * b)
            new_biomass[n] = np.clip(b + db * DT, 0, 15.0)
        biomass = new_biomass
        
        if t % 20 == 0:
            history.append({'biomass': biomass.copy()})
            cur_goal = sum(biomass[n] for n in goal_nodes)
            if t % 200 == 0:
                msg = f" T={t}: Progress to Goal = {cur_goal:.2f}"
                print(msg)
                with open(log_file, "a") as f: f.write(msg + "\n")

    print(f"Generating Fast Animation...")
    fig, ax = plt.subplots(figsize=(10, 5))
    def update(frame_idx):
        ax.clear()
        data = history[frame_idx]
        local_b = data['biomass']
        node_colors = [local_b.get(n, 0) for n in nodes]
        nx.draw_networkx_nodes(G, pos, node_size=40, node_color=node_colors, cmap='inferno', vmin=0, vmax=10, ax=ax)
        nx.draw_networkx_edges(G, pos, alpha=0.1, ax=ax)
        nx.draw_networkx_nodes(G, pos, nodelist=goal_nodes, node_size=100, edgecolors='cyan', node_color='none', ax=ax)
        ax.set_title(f"Collective Navigation: T={frame_idx*20}")
        ax.axis('off')
    ani = animation.FuncAnimation(fig, update, frames=len(history), interval=100)
    save_file = output_path + 'exp06_collective_maze.gif'
    ani.save(save_file, writer='pillow', fps=10)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_collective_maze()
