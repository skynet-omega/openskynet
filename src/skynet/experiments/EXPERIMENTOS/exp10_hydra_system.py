
import sys
import os
import numpy as np
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.animation as animation

# Ensure we can find operators
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))
from operators import apply_asymmetric_laplacian, apply_laplacian

class HydraSystem:
    def __init__(self, size=(10, 25)):
        self.rows, self.cols = size
        G = nx.grid_2d_graph(self.rows, self.cols)
        
        # Define Path: Tunnel at rows 4-5, cols 5-15. Rooms at start/end.
        self.walls = []
        for r in range(self.rows):
            for c in range(self.cols):
                if 5 <= c <= 15: # The Tunnel Section
                    if r != 4 and r != 5:
                        self.walls.append((r, c))
        
        G.remove_nodes_from(self.walls)
        self.mapping = {node: i for i, node in enumerate(G.nodes())}
        self.reverse = {i: node for node, i in self.mapping.items()}
        self.nodes = list(self.mapping.values())
        self.adj = {self.mapping[n]: set(self.mapping[nb] for nb in G.neighbors(n)) for n in G.nodes()}
        
        # State
        self.biomass = {n: 0.0 for n in self.nodes}
        self.phero = {n: 0.0 for n in self.nodes}
        self.memory = {n: 0.0 for n in self.nodes}
        
        # Initial Population: Entry room
        for r in range(self.rows):
            for c in range(4):
                if (r,c) in self.mapping:
                    self.biomass[self.mapping[(r,c)]] = 8.0
        
    def get_adjacency_list(self): return self.adj

    def step(self, t, signal_type='A'):
        # 1. INPUT (Signal at Entry)
        # Apply signal to biomass passing through col 3
        signal_val = 10.0 if signal_type == 'A' else -10.0
        for n in self.nodes:
            r, c = self.reverse[n]
            if c == 3 and self.biomass[n] > 1.0:
                self.memory[n] = np.clip(self.memory[n] + signal_val * 0.2, -20.0, 20.0)

        # 2. MEMORY & LOGIC
        # Memory stays with biomass
        lap_m = apply_laplacian(self.memory, self)
        for n in self.nodes:
            m = self.memory[n]
            b = self.biomass[n]
            # Scent sticks to biomass and decays slowly
            dm = (lap_m.get(n, 0) * 0.4) - (0.005 * m)
            self.memory[n] = np.clip(m + dm * 0.2, -20.0, 20.0)

        # INTEGRATED LOGIC JUNCTION (Col 16+)
        junction_mem = 0.0
        active_biomass = 0.0
        for n in self.nodes:
            r, c = self.reverse[n]
            if c >= 16:
                junction_mem += self.memory[n] * self.biomass[n]
                active_biomass += self.biomass[n]
        
        avg_mem = junction_mem / (active_biomass + 1e-6)
        
        # Determine Pheromone Targets
        self.phero = {n: 0.0 for n in self.nodes}
        target_a = self.mapping[(1, 24)] if (1, 24) in self.mapping else None
        target_b = self.mapping[(8, 24)] if (8, 24) in self.mapping else None
        
        if avg_mem > 1.5 and target_a: self.phero[target_a] = 80.0
        elif avg_mem < -1.5 and target_b: self.phero[target_b] = 80.0
        else: # Unfiltered scent (neutral flow)
            mid = self.mapping[(4, 24)] if (4, 24) in self.mapping else None
            if mid: self.phero[mid] = 10.0

        # 3. SWARM PHYSICS (Agency)
        lap_p = apply_laplacian(self.phero, self)
        for n in self.nodes:
            # Signal diffusion
            self.phero[n] = np.clip(self.phero[n] + (lap_p.get(n,0)*1.8 - 0.1*self.phero[n])*0.2, 0, 100)
            
        # Advection Weights
        w = {}
        for u in self.nodes:
            for v in self.adj[u]:
                grad = self.phero[v] - self.phero[u]
                w[(u, v)] = 0.1 + max(0, grad) * 40.0
                
        # Flow Biomass & Memory
        adv_b = apply_asymmetric_laplacian(self.biomass, self, w)
        adv_m = apply_asymmetric_laplacian(self.memory, self, w)
        
        for n in self.nodes:
            # Biomass Dynamics
            b = self.biomass[n]
            g = 2.0 * np.exp(-((b - 5.0)**2) / 2.0) - 0.5
            self.biomass[n] = np.clip(b + (adv_b.get(n,0)*8.0 + g - 0.02*b)*0.2, 0, 15.0)
            # Memory Advection (Signal carry)
            self.memory[n] = np.clip(self.memory[n] + adv_m.get(n,0)*1.0, -20, 20)

def run_hydra_experiment(signal='A'):
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp10_hydra_system.log"
    
    print(f"\n[HYDRA] Running Case Signal: {signal}")
    with open(log_file, "a") as f: f.write(f"\n[HYDRA] Running Case Signal: {signal}\n")
    
    system = HydraSystem()
    history = []
    
    for t in range(800):
        system.step(t, signal_type=signal)
        if t % 5 == 0:
            history.append({
                'biomass': system.biomass.copy(),
                'memory': system.memory.copy()
            })
            if t % 100 == 0:
                # Calculate collective decision
                nodes_junction = [n for n in system.nodes if system.reverse[n][1] >= 16]
                active = sum(system.biomass[n] for n in nodes_junction)
                mem = sum(system.memory[n]*system.biomass[n] for n in nodes_junction) / (active + 1e-6)
                msg = f" T={t} | Junction Collective State: {mem:.2f} | Active: {active:.1f}"
                print(msg)
                with open(log_file, "a") as f: f.write(msg + "\n")

    print("Generating Animation...")
    fig, (ax_b, ax_m) = plt.subplots(2, 1, figsize=(12, 8))
    pos = {n: (system.reverse[n][1], -system.reverse[n][0]) for n in system.nodes}
    
    def update(i):
        ax_b.clear(); ax_m.clear()
        data = history[i]
        b_vals = [data['biomass'][n] for n in system.nodes]
        m_vals = [data['memory'][n] for n in system.nodes]
        
        nx.draw_networkx_nodes(nx.Graph(system.adj), pos, node_size=30, node_color=b_vals, cmap='hot', ax=ax_b, vmin=0, vmax=10)
        ax_b.set_title(f"HYDRA Hardware: Swarm Flow | Signal={signal}")
        
        nx.draw_networkx_nodes(nx.Graph(system.adj), pos, node_size=30, node_color=m_vals, cmap='coolwarm', ax=ax_m, vmin=-10, vmax=10)
        ax_m.set_title(f"HYDRA Hardware: Persistent State (Memory)")
        
    ani = animation.FuncAnimation(fig, update, frames=len(history), interval=50)
    save_path = output_path + f'exp10_hydra_system_{signal}.gif'
    ani.save(save_path, writer='pillow', fps=15)
    print(f"Success! {save_path} saved.")
    with open(log_file, "a") as f: f.write(f"Success! {save_path} saved.\n")

if __name__ == "__main__":
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp10_hydra_system.log"
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 07: HYDRA SYSTEM ---\n")
        
    run_hydra_experiment(signal='A')
    run_hydra_experiment(signal='B')
