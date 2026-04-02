
import sys
import os
import random
import numpy as np
import networkx as nx
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from scipy.spatial.distance import pdist, squareform

# Adjust path to find lib
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

from hypergraph import SimpleWolframSystem
from operators import apply_asymmetric_laplacian, apply_laplacian

# --- PHYSICS PARAMETERS ---
# We make the physics more "Quantum" (Probabilistic & Rotation)
GROWTH_MU = 2.0      # Lower threshold to survive (was 3.5)
GROWTH_SIGMA = 1.0   
DT = 0.05            
CROSS_DIFFUSION = 0.8 
CHIRALITY = 0.3      # "Spin" factor to break symmetry

def gaussian_growth(rho, mu=GROWTH_MU, sigma=GROWTH_SIGMA, amplitude=1.5):
    return amplitude * (2.0 * np.exp(-((rho - mu)**2) / (2 * sigma**2)) - 1.0)

def estimate_fractal_dimension(G, biomass):
    """
    Estimates the Effective Dimension of the swarm using Box-Counting (simplified).
    Or Correlation Dimension on the Graph.
    
    Approach: Expansion Rate.
    N(r) ~ r^d  => d = log(N(r)) / log(r)
    We pick a center node (highest mass) and count neighbors at distance r=1, r=2, r=3.
    """
    # Find center
    nodes = list(G.nodes())
    if not nodes: return 0
    center = max(nodes, key=lambda n: biomass.get(n, 0))
    
    layers = {0: {center}}
    visited = {center}
    
    # BFS for layers
    max_radius = 4
    counts = []
    
    current_layer = {center}
    adj = dict(G.adjacency())
    
    for r in range(1, max_radius + 1):
        next_layer = set()
        for u in current_layer:
            for v in adj.get(u, []):
                if v not in visited:
                    visited.add(v)
                    next_layer.add(v)
        current_layer = next_layer
        count = len(visited) # Cumulative count N(r)
        counts.append((r, count))
        
    # Fit N(r) = C * r^d
    # log(N) = log(C) + d * log(r)
    # Simple slope between r=1 and r=4
    if len(counts) < 2: return 0.0
    
    log_r = np.log([c[0] for c in counts])
    log_N = np.log([c[1] for c in counts])
    
    if len(log_r) > 1:
        d, _ = np.polyfit(log_r, log_N, 1)
        return d
    return 0.0

def update_dynamic_metric_chiral(signal_field, system):
    """
    Metric Tensor with Chirality (Spin).
    The flow weights are not just Gradient (Downhill) but also Rotational.
    This simulates 'Spin-Orbit Coupling' in the graph.
    """
    flow_weights = {}
    adj = system.get_adjacency_list()
    raw_weights = {}
    max_w = 0.0
    
    for u in adj:
        val_u = signal_field.get(u, 0)
        neighbors = sorted(list(adj[u]))
        
        for i, v in enumerate(neighbors):
            val_v = signal_field.get(v, 0)
            
            # 1. Gradient (Attraction)
            w_grad = max(0, val_v - val_u)
            
            # 2. Gravity (Clustering)
            w_grav = (val_u + val_v) * 0.1
            
            # 3. Chirality (Rotation)
            # We favor flow to neighbors in a specific 'direction' (e.g., index parity)
            # creating a vortex around the center.
            # Local "Spin": favor neighbor i if (i + u) is even/odd?
            # Or simplified: Rotational bias based on IDs
            w_spin = 0.0
            if u < v:
                 w_spin = CHIRALITY * val_u # Bias one direction
            
            w = w_grad + w_grav + w_spin
            raw_weights[(u, v)] = w
            max_w = max(max_w, w)
            
    if max_w > 0.001:
        for k, w in raw_weights.items():
            flow_weights[k] = w / max_w
    else:
        for k in raw_weights: flow_weights[k] = 0.01
            
    return flow_weights

def run_scientific_swarm(wolfram_steps=9, sim_steps=200):
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = output_path + "exp13_active_swarm.log"
    
    with open(log_file, "w") as f:
        f.write("--- LEGACY EXP 10: ACTIVE SWARM (TENSOR LENIA) ---\n")
    
    print(f"Initializing Swarm & Measuring Dimensionality...")
    with open(log_file, "a") as f: f.write("Initializing Swarm & Measuring Dimensionality...\n")
    
    system = SimpleWolframSystem()
    system.initialize([[1, 2], [1, 3], [1, 4]])
    for i in range(wolfram_steps):
        system.step()
    
    nodes = list(system.get_adjacency_list().keys())
    G = nx.Graph()
    for e in system.edges:
        if len(e) >= 2: G.add_edge(e[0], e[1])
        
    print(f"Substrate Ready. Nodes: {len(nodes)}")
    
    biomass = {n: np.random.uniform(0, 1.0) for n in nodes} 
    pheromone = {n: 0.0 for n in nodes}
    
    pos = nx.spring_layout(G, seed=42)
    history = []
    dimensions = []
    
    print("Simulating (Chiral Metric + Real-time Dimensionality Analysis)...")
    with open(log_file, "a") as f: f.write("Simulating (Chiral Metric + Real-time Dimensionality Analysis)...\n")
    
    for t in range(sim_steps):
        # Physics
        lap_p = apply_laplacian(pheromone, system)
        new_pheromone = {}
        for n in nodes:
            p = pheromone.get(n, 0)
            b = biomass.get(n, 0)
            dp = (lap_p.get(n, 0) * 0.8) - (0.2 * p) + (b * CROSS_DIFFUSION)
            new_pheromone[n] = max(0, p + dp * DT)
        pheromone = new_pheromone
        
        # Chiral Metric Update
        flow_weights = update_dynamic_metric_chiral(pheromone, system)
        
        adv_b = apply_asymmetric_laplacian(biomass, system, flow_weights)
        new_biomass = {}
        for n in nodes:
            b = biomass.get(n, 0)
            g = gaussian_growth(b) 
            db = (adv_b.get(n, 0) * 2.0) + g - (0.1 * b)
            val = max(0, b + db * DT)
            new_biomass[n] = min(val, 10.0) 
        biomass = new_biomass
        
        # Measurement: Fractal Dimension
        if t % 5 == 0:
            dim = estimate_fractal_dimension(G, biomass)
            dimensions.append(dim)
            if t % 20 == 0:
                msg = f" T={t}: MaxMass={max(biomass.values()):.2f}, Dimension={dim:.2f}"
                print(msg)
                with open(log_file, "a") as f: f.write(msg + "\n")

        # Update Layout
        for u, v in G.edges():
            w = flow_weights.get((u,v), 0) + flow_weights.get((v,u), 0)
            G[u][v]['weight'] = w + 0.05 
        pos = nx.spring_layout(G, pos=pos, weight='weight', iterations=3, k=0.3)
        
        if t % 4 == 0:
            history.append({
                'biomass': biomass.copy(),
                'weights': flow_weights.copy(),
                'pos': pos.copy(),
                'dim': dim
            })

    # Visualization
    print(f"Generating Scientific Animation...")
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 6))
    
    def update(frame_idx):
        ax1.clear()
        ax2.clear()
        
        data = history[frame_idx]
        local_biomass = data['biomass']
        local_weights = data['weights']
        current_pos = data['pos']
        current_dim = data['dim']
        
        # Plot 1: Graph
        node_colors = [local_biomass.get(n, 0) for n in G.nodes()]
        edges = G.edges()
        linewidths = [ (local_weights.get((u,v),0)+local_weights.get((v,u),0))*2.0 + 0.1 for u,v in edges]
        
        nx.draw_networkx_nodes(G, current_pos, node_size=40, node_color=node_colors, cmap='magma', vmin=0, vmax=5.0, ax=ax1)
        nx.draw_networkx_edges(G, current_pos, width=linewidths, alpha=0.4, ax=ax1, edge_color='#666666')
        ax1.set_title(f"Spin-Lenia Swarm (T={frame_idx*4})")
        ax1.axis('off')
        
        # Plot 2: Dimensionality
        # Show time series of Dimension
        dims_so_far = dimensions[:(frame_idx*4)//5 + 1] # approx mapping
        if len(dims_so_far) > 0:
            ax2.plot(dims_so_far, color='cyan')
            ax2.set_title(f"Emergent Fractal Dimension: {current_dim:.2f}")
            ax2.set_xlabel("Time (x5)")
            ax2.set_ylabel("Dimension D")
            ax2.set_ylim(0, 3.0)
            ax2.grid(True, color='#444444')
            ax2.set_facecolor('#222222')
        
    ani = animation.FuncAnimation(fig, update, frames=len(history), interval=50)
    save_file = output_path + 'exp13_active_swarm.gif'
    ani.save(save_file, writer='pillow', fps=15)
    print(f"Saved {save_file}")
    with open(log_file, "a") as f: f.write(f"Saved {save_file}\n")

if __name__ == "__main__":
    run_scientific_swarm()
