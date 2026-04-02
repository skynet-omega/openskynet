
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

class IntegratedPC:
    def __init__(self, rows=30, cols=60):
        # SUBSTRATE: A dense interconnected grid
        G = nx.grid_2d_graph(rows, cols)
        self.mapping = {node: i for i, node in enumerate(G.nodes())}
        self.reverse_mapping = {i: node for node, i in self.mapping.items()}
        self.nodes = list(self.mapping.values())
        self.adj = {n: set(self.mapping[neighbor] for neighbor in G.neighbors(self.reverse_mapping[n])) for n in self.nodes}
        
        # 4 REGIONS OF PARALLEL PROCESSING
        # Sectorize by row ranges
        self.channels = []
        for i in range(4):
            r_start, r_end = i*(rows//4), (i+1)*(rows//4)
            ch = {
                'logic': [n for n, (r, c) in self.reverse_mapping.items() if r_start <= r < r_end and c < 5],
                'bus': [n for n, (r, c) in self.reverse_mapping.items() if r_start <= r < r_end and 5 <= c < cols-5],
                'memory': [n for n, (r, c) in self.reverse_mapping.items() if r_start <= r < r_end and c >= cols-5]
            }
            self.channels.append(ch)
            
        # State
        self.biomass = {n: 0.0 for n in self.nodes}
        self.pheromone = {n: 0.0 for n in self.nodes}
        
    def get_adjacency_list(self): return self.adj

    def step(self, dt=0.15):
        # 1. Faster Signal Diffusion for Parallelism
        lap_p = apply_laplacian(self.pheromone, self)
        new_p = {}
        for n in self.nodes:
            p = self.pheromone[n]
            b = self.biomass[n]
            # Fast diffusion to 'guide' the pulses
            dp = (lap_p.get(n, 0) * 2.0) - (0.15 * p) + (b * 0.2)
            new_p[n] = np.clip(p + dp * dt, 0, 30.0)
        self.pheromone = new_p
        
        # 2. Metric Flow (Gradient following)
        flow_weights = {}
        for u in self.nodes:
            pu = self.pheromone[u]
            for v in self.adj[u]:
                pv = self.pheromone[v]
                # High contrast for channel separation
                w = 0.05 + max(0, pv - pu) * 12.0
                flow_weights[(u, v)] = w
                
        # 3. Parallel Advection
        adv_b = apply_asymmetric_laplacian(self.biomass, self, flow_weights)
        new_b = {}
        for n in self.nodes:
            b = self.biomass[n]
            # Gaussian Growth (The ALU logic pulse)
            g = 2.5 * np.exp(-((b - 3.0)**2) / 1.5) - 0.5
            db = (adv_b.get(n, 0) * 4.0) + g - (0.05 * b)
            new_b[n] = np.clip(b + db * dt, 0, 15.0)
        self.biomass = new_b

def run_stress_test(steps=400):
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp12_parallel_stress.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 09: PARALLEL STRESS ---\n")

    print("STRESS TEST: Running 4 Parallel Soliton Tasks...")
    with open(log_file, "a") as f: f.write("STRESS TEST: Running 4 Parallel Soliton Tasks...\n")
    
    pc = IntegratedPC()
    
    # INPUT: Trigger 4 pulses in the 4 logic sectors
    for i in range(4):
        input_nodes = pc.channels[i]['logic'][:5]
        for n in input_nodes: pc.biomass[n] = 10.0
        
    # GOAL: Specific memory addresses in 4 sectors
    memory_addresses = [pc.channels[i]['memory'][:5] for i in range(4)]
    
    history = []
    
    for t in range(steps):
        # Set persistent memory "Beacons" (Signal)
        # Each channel wants its pulse to reach its register
        for i in range(4):
            for n in memory_addresses[i]:
                pc.pheromone[n] = 20.0
                
        pc.step()
        
        if t % 15 == 0:
            scores = [sum(pc.biomass[n] for n in memory_addresses[i]) for i in range(4)]
            history.append({
                'biomass': pc.biomass.copy(),
                't': t,
                'scores': scores
            })
            if t % 75 == 0:
                msg = f" T={t} | Parallel Register Hits: {['{:.1f}'.format(s) for s in scores]}"
                print(msg)
                with open(log_file, "a") as f: f.write(msg + "\n")

    # RENDERING
    print("Generating Parallel Stress Test Animation...")
    fig, ax = plt.subplots(figsize=(14, 7))
    pos = {n: (pc.reverse_mapping[n][1], -pc.reverse_mapping[n][0]) for n in pc.nodes}

    def update(frame_idx):
        ax.clear()
        data = history[frame_idx]
        local_b = data['biomass']
        
        node_colors = [local_b[n] for n in pc.nodes]
        ax.scatter([pos[n][0] for n in pc.nodes], [pos[n][1] for n in pc.nodes], 
                   c=node_colors, cmap='hot', vmin=0, vmax=10, s=25)
        
        # Draw channel separation lines (logical)
        for i in range(1, 4):
            ax.axhline(y=-i*(30//4)+0.5, color='gray', linestyle='--', alpha=0.3)
            
        ax.set_title(f"Parallel Soliton Stress Test | T={data['t']} | Success Score: {sum(data['scores']):.1f}")
        ax.set_facecolor('#080808')
        ax.axis('off')
        
    ani = animation.FuncAnimation(fig, update, frames=len(history), interval=100)
    save_file = output_path + 'exp12_parallel_stress.gif'
    ani.save(save_file, writer='pillow', fps=10)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_stress_test()
