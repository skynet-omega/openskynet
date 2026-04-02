
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

class SolitonPC:
    def __init__(self, rows=20, cols=40):
        # 1. Create a Large Arena subdivided into 3 Sectors
        # [ LOGIC (Left) ] -- [ BUS (Center) ] -- [ MEMORY (Right) ]
        # Plasticity is global or centered in the BUS.
        
        G = nx.grid_2d_graph(rows, cols)
        self.mapping = {node: i for i, node in enumerate(G.nodes())}
        self.reverse_mapping = {i: node for node, i in self.mapping.items()}
        self.G = nx.relabel_nodes(G, self.mapping)
        self.nodes = list(self.G.nodes())
        self.adj = {n: set(self.G.neighbors(n)) for n in self.nodes}
        
        # Sector Definitions
        self.logic_nodes = [n for n, (r, c) in self.reverse_mapping.items() if c < cols//3]
        self.bus_nodes = [n for n, (r, c) in self.reverse_mapping.items() if cols//3 <= c < 2*cols//3]
        self.memory_nodes = [n for n, (r, c) in self.reverse_mapping.items() if c >= 2*cols//3]
        
        # State
        self.biomass = {n: 0.0 for n in self.nodes}
        self.pheromone = {n: 0.0 for n in self.nodes}
        self.edges_dynamic = {n: set(self.G.neighbors(n)) for n in self.nodes} # For Plasticity
        
        # Physics Parameters per Sector
        self.params = {
            'logic': {'decay': 0.1, 'growth': 2.0, 'width': 1.0, 'target': 2.5},
            'memory': {'decay': 0.005, 'growth': 0.5, 'width': 5.0, 'target': 2.0},
            'bus': {'decay': 0.05, 'growth': 1.0, 'width': 2.0, 'target': 2.5}
        }
        
    def get_sector(self, node):
        if node in self.logic_nodes: return 'logic'
        if node in self.memory_nodes: return 'memory'
        return 'bus'

    def step(self, dt=0.1):
        # A. Signal (Pheromone) Diffusion
        lap_p = apply_laplacian(self.pheromone, self)
        new_pheromone = {}
        for n in self.nodes:
            p = self.pheromone[n]
            b = self.biomass[n]
            sector = self.get_sector(n)
            # Memory sector preserves signal longer
            decay = 0.01 if sector == 'memory' else 0.1
            dp = (lap_p.get(n, 0) * 1.0) - (decay * p) + (b * 0.1)
            new_pheromone[n] = np.clip(p + dp * dt, 0, 20.0)
        self.pheromone = new_pheromone
        
        # B. PLASTICITY (Rewiring the Bus based on Activity)
        # If a bus node is active, it creates a bridge to the memory nodes
        for n in self.bus_nodes:
            if self.biomass[n] > 3.0:
                target = random.choice(self.memory_nodes)
                self.edges_dynamic[n].add(target)
                self.edges_dynamic[target].add(n)
        
        # C. Metric & Advection
        flow_weights = {}
        for u in self.nodes:
            pu = self.pheromone[u]
            for v in self.edges_dynamic[u]:
                pv = self.pheromone[v]
                # High gradient = strong data flow
                w = 0.05 + max(0, pv - pu) * 5.0
                flow_weights[(u, v)] = w
                
        adv_b = apply_asymmetric_laplacian(self.biomass, self, flow_weights)
        new_biomass = {}
        for n in self.nodes:
            b = self.biomass[n]
            sector = self.get_sector(n)
            p = self.params[sector]
            
            # Growth (Activation Function)
            g = p['growth'] * np.exp(-((b - p['target'])**2) / p['width']) - 0.5
            
            db = (adv_b.get(n, 0) * 2.0) + g - (p['decay'] * b)
            new_biomass[n] = np.clip(b + db * dt, 0, 10.0)
        self.biomass = new_biomass
        
    # Helper for operators
    def get_adjacency_list(self):
        return self.edges_dynamic

def run_pc_demo(steps=400):
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp11_soliton_pc.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 08: SOLITON PC ---\n")

    print("Initializing SOLITON PC Concept Validation...")
    with open(log_file, "a") as f: f.write("Initializing SOLITON PC Concept Validation...\n")
    
    pc = SolitonPC()
    
    # 1. INPUT: Trigger Logic Sector
    for n in random.sample(pc.logic_nodes, 10):
        pc.biomass[n] = 8.0
        
    # 2. GOAL: Excite a specific address in Memory via the Bus
    goal_address = random.sample(pc.memory_nodes, 5)
    
    history = []
    
    print("Simulating emergent compute...")
    with open(log_file, "a") as f: f.write("Simulating emergent compute...\n")

    for t in range(steps):
        # Set target in memory (The 'Write' command)
        for n in goal_address:
            pc.pheromone[n] = 15.0
            
        pc.step()
        
        if t % 10 == 0:
            history.append({
                'biomass': pc.biomass.copy(),
                'edges': {k: v.copy() for k, v in pc.edges_dynamic.items()},
                't': t
            })
            if t % 100 == 0:
                io_mass = sum(pc.biomass[n] for n in goal_address)
                msg = f" T={t}: Memory Write Buffer (IO) = {io_mass:.2f}"
                print(msg)
                with open(log_file, "a") as f: f.write(msg + "\n")

    # 3. Rendering
    print("Generating Soliton PC Animation...")
    fig, ax = plt.subplots(figsize=(12, 6))
    pos = {n: (pc.reverse_mapping[n][1], -pc.reverse_mapping[n][0]) for n in pc.nodes}

    def update(frame_idx):
        ax.clear()
        data = history[frame_idx]
        local_b = data['biomass']
        local_edges = data['edges']
        
        # Draw Background Grid
        # (Only draw dynamic edges for clarity)
        for u, neighbors in local_edges.items():
            for v in neighbors:
                if u < v:
                    # Color bus connections differently
                    color = 'cyan' if pc.get_sector(u) != pc.get_sector(v) else '#222222'
                    ax.plot([pos[u][0], pos[v][0]], [pos[u][1], pos[v][1]], color=color, alpha=0.3, lw=0.5)
        
        # Color nodes by biomass
        node_colors = [local_b[n] for n in pc.nodes]
        ax.scatter([pos[n][0] for n in pc.nodes], [pos[n][1] for n in pc.nodes], 
                   c=node_colors, cmap='plasma', vmin=0, vmax=5, s=20, zorder=3)
        
        # Sector Boundaries
        ax.axvline(x=40//3, color='white', linestyle='--', alpha=0.2)
        ax.axvline(x=2*40//3, color='white', linestyle='--', alpha=0.2)
        ax.text(5, 1, "LOGIC", color='white', ha='center')
        ax.text(20, 1, "PLASTIC BUS", color='white', ha='center')
        ax.text(35, 1, "MEMORY", color='white', ha='center')
        
        ax.set_title(f"Soliton PC (Emergent Neuromorphic): T={data['t']}")
        ax.set_facecolor('#050505')
        ax.axis('off')
        
    ani = animation.FuncAnimation(fig, update, frames=len(history), interval=100)
    save_file = output_path + 'exp11_soliton_pc.gif'
    ani.save(save_file, writer='pillow', fps=10)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_pc_demo()
