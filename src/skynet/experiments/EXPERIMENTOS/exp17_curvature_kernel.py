
import sys
import os
import numpy as np
import matplotlib.pyplot as plt
import networkx as nx

# Path setup to find tensor_lenia lib from EXPERIMENTOS
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

try:
    from hypergraph import SimpleWolframSystem
    from curvature import calculate_forman_ricci
except ImportError:
    # Fallback if libs are missing/moved, implement minimal versions for standalone test
    class SimpleWolframSystem:
        def __init__(self):
            self.edges = []
            self.next_node_id = 1
        def initialize(self, edges):
            self.edges = [tuple(e) for e in edges]
            self.next_node_id = max(max(e) for e in edges) + 1
        def step(self):
            # Simple rule: {{x, y}} -> {{x, z}, {y, z}, {x, y}} (Triangulation/Clustering)
            new_edges = []
            if not self.edges: return
            # Apply to just one edge per step for simplicity or all
            targets = self.edges[:] 
            self.edges = []
            for (x, y) in targets:
                z = self.next_node_id
                self.next_node_id += 1
                new_edges.extend([(x, z), (y, z), (x, y)])
            self.edges = new_edges

    def calculate_forman_ricci(system):
        # Forman curvature for edge e=(u,v):
        # Ric(e) = 4 - deg(u) - deg(v) (Simplest loose approximation)
        G = nx.Graph()
        G.add_edges_from(system.edges)
        ricci = {}
        for u, v in G.edges():
            ricci[(u, v)] = 4 - G.degree(u) - G.degree(v)
        return ricci

def run_curvature_kernel_experiment(steps=50):
    log_path = os.path.join(os.path.dirname(__file__), "exp17_curvature_kernel.log")
    with open(log_path, "w") as f:
        f.write("--- EXPERIMENT 17: CURVATURE-ADAPTIVE KERNEL (The Missing Link) ---\n")
        f.write("Hypothesis: Matching Lenia Kernel to Ricci Curvature minimizes signal dispersion.\n")

    def log(msg):
        print(msg)
        with open(log_path, "a") as f: f.write(msg + "\n")

    # 1. Generate Substrate (Wolfram Graph)
    log("Generating Causal Substrate...")
    system = SimpleWolframSystem()
    # Rule {{x, y}, {x, z}} requires a common starting node. 
    # Initialize with a Star (Hub) to trigger growth.
    system.initialize([(1, 2), (1, 3)]) 
    # Evolve a bit to get complexity
    for i in range(5):
        system.step()
    
    # Convert to NetworkX for simulation
    G = nx.Graph()
    G.add_edges_from(system.edges)
    nodes = list(G.nodes())
    n_map = {n: i for i, n in enumerate(nodes)}
    N = len(nodes)
    log(f"Substrate generated: {N} nodes, {len(G.edges())} edges.")

    # 2. Measure Curvature
    log("Measuring Ricci Curvature...")
    # This returns Node Curvatures {node_id: R}
    node_curvatures = calculate_forman_ricci(system) 
    
    # 3. Define Kernels
    adj = np.zeros((N, N))
    kernel_euclidean = np.zeros((N, N))
    kernel_relativistic = np.zeros((N, N))
    
    beta = 1.0 # Sensitivity to curvature
    
    for u, v in G.edges():
        if u not in n_map or v not in n_map: continue
        i, j = n_map[u], n_map[v]
        
        # Base connectivity
        adj[i, j] = adj[j, i] = 1.0
        
        # Euclidean: Uniform diffusion
        kernel_euclidean[i, j] = kernel_euclidean[j, i] = 1.0
        
        # Relativistic: Adjusted by curvature (Homeostatic Regulation)
        # Estimate Edge Curvature from Node Curvature
        ric_u = node_curvatures.get(u, 0)
        ric_v = node_curvatures.get(v, 0)
        ric_edge = (ric_u + ric_v) / 2.0
        
        # HYPOTHESIS V2: Homeostasis
        # Ric < 0 (Expansion/Divergence): Space pulls apart. 
        # To keep the soliton together, we must REDUCE diffusion (Weight < 1).
        # Ric > 0 (Contraction/Clumping): Space pushes together.
        # To avoid collapse, we must INCREASE diffusion (Weight > 1).
        
        weight = np.exp(beta * ric_edge) # Removed negative sign
        kernel_relativistic[i, j] = kernel_relativistic[j, i] = weight

    # Normalize kernels (Row-stochastic-ish)
    # Simple averaging
    deg_e = kernel_euclidean.sum(axis=1, keepdims=True) + 1e-9
    P_euclidean = kernel_euclidean / deg_e
    
    deg_r = kernel_relativistic.sum(axis=1, keepdims=True) + 1e-9
    P_relativistic = kernel_relativistic / deg_r

    # 4. Simulation: Signal Retention
    # Initialize a sharp spike signal
    phi_0 = np.zeros(N)
    phi_0[0] = 10.0 # Injection at node 0
    
    phi_e = phi_0.copy()
    phi_r = phi_0.copy()
    
    entropy_e = []
    entropy_r = []
    
    log("Simulating Diffusion (Steps=50)...")
    
    def calc_entropy(phi):
        p = np.abs(phi)
        p = p / (np.sum(p) + 1e-9)
        return -np.sum(p * np.log(p + 1e-9))

    for t in range(steps):
        # Measurables
        entropy_e.append(calc_entropy(phi_e))
        entropy_r.append(calc_entropy(phi_r))
        
        # Update (Simple Diffusion: phi_new = phi + dt * (P.phi - phi))
        dt = 0.1
        
        # Euclidean Step
        diffusion_e = P_euclidean @ phi_e - phi_e
        phi_e += dt * diffusion_e
        
        # Relativistic Step
        diffusion_r = P_relativistic @ phi_r - phi_r
        phi_r += dt * diffusion_r
        
        if t % 10 == 0:
            log(f"T={t}: H_E={entropy_e[-1]:.3f} vs H_R={entropy_r[-1]:.3f}")

    # 5. Analysis
    # Lower entropy increase = Better signal coherence/retention (Soliton property)
    final_gain = entropy_e[-1] - entropy_r[-1]
    
    plt.figure(figsize=(10, 6))
    plt.plot(entropy_e, label='Euclidean Kernel (Standard Lenia)', linestyle='--')
    plt.plot(entropy_r, label='Relativistic Kernel (Curvature Adaptive)', linewidth=2)
    plt.title('Experiment 17: Signal Entropy (Dispersion) over Time')
    plt.ylabel('Entropy (Higher = More Dispersed)')
    plt.xlabel('Time Steps')
    plt.legend()
    plt.grid(True, alpha=0.3)
    output_path = os.path.join(os.path.dirname(__file__), 'exp17_curvature_comparison.png')
    plt.savefig(output_path)
    log(f"Saved plot to {output_path}")
    
    if final_gain > 0:
        log("\n[SUCCESS] Relativistic Kernel preserved signal structure better.")
        log(f"Entropy reduction: {final_gain:.4f} nats.")
        log("Conclusion: Adjusting 'Lenia' kernel to 'Wolfram' curvature stabilizes information flow.")
    else:
        log("\n[FAIL] No significant advantage found.")

if __name__ == "__main__":
    run_curvature_kernel_experiment()
