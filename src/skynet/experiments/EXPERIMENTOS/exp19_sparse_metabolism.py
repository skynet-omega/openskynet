
import numpy as np
import matplotlib.pyplot as plt
import networkx as nx
import os
import sys

def setup_logger():
    log_path = os.path.join(os.path.dirname(__file__), "exp19_sparse_metabolism.log")
    with open(log_path, "w") as f:
        f.write("--- EXPERIMENT 19: SPARSE METABOLISM (Energetic Efficiency) ---\n")
        f.write("Hypothesis: Metabolic pruning ($J < Cost$) collapses $O(N^2)$ graphs to $O(N)$ Small-Worlds.\n")
    return log_path

def log(msg, log_path=None):
    print(msg)
    if log_path:
        with open(log_path, "a") as f:
            f.write(msg + "\n")

def run_sparse_metabolism():
    log_path = setup_logger()
    
    # Parameters
    N = 50
    steps = 100
    initial_density = 0.5 # Start Dense (50% of all possible edges)
    
    # Metabolism
    metabolic_cost = 0.15 # Aggressive cost
    weight_decay = 0.2 # Strongly penalize large weights
    learning_rate = 0.3 # Moderate learning
    pruning_threshold = 0.01
    
    log(f"Initializing Dense Network (N={N}, Density={initial_density})...", log_path)
    
    # Create random dense graph
    G = nx.erdos_renyi_graph(N, initial_density)
    adj = nx.to_numpy_array(G)
    weights = adj.copy() # Edge weights (Conductance)
    
    edge_counts = []
    avg_fluxes = []
    
    # Simulate Activity (Sparse Signal Propagation)
    # Only stimulate a few nodes to see if unused paths die
    state = np.zeros(N)
    state[:5] = 1.0 # Only first 5 nodes valid
    
    log("Simulating 'Synaptic Darwinism' with Sparse Input...", log_path)
    
    for t in range(steps):
        # 1. Activation Spread
        # Simple non-linear recurrent step
        input_signal = weights @ state
        state = np.tanh(input_signal)
        
        # 2. Calculate Edge Flux (Traffic)
        # Flux_ij = |x_i - x_j| * W_ij (Current) OR just Activity correlation |x_i * x_j|
        # Let's use Hebbian Flux: |x_i * x_j|
        
        # Outer product of absolute states
        activity_matrix = np.abs(np.outer(state, state))
        flux = activity_matrix * (weights > 0) # Only on existing edges
        
        # 3. Metabolic Update
        # Change in Weight = Flux - Cost
        
        # Flatten for vectorized update on edges
        mask = weights > 0
        current_flux = flux[mask]
        
        # Update Rule:
        # dW = alpha * Flux - (BaseCost + Beta * W)
        weights[mask] += learning_rate * current_flux - (metabolic_cost + weight_decay * weights[mask])
        
        # Soft bound: Normalize if growing too large (Resource Constraint)
        # max_total = N * 2
        # current_total = np.sum(weights)
        # if current_total > max_total:
        #     weights *= (max_total / current_total)
        
        # Pruning (Death)
        # Hard pruning: Set negative weights to 0
        pruned_count = np.sum((weights[mask] <= 0))
        weights[weights < 0] = 0
        
        # Stats
        num_edges = np.sum(weights > 0) / 2 # Undirected
        avg_flux = np.mean(current_flux) if len(current_flux) > 0 else 0
        
        edge_counts.append(num_edges)
        avg_fluxes.append(avg_flux)
        
        if t % 10 == 0:
            log(f"T={t}: Edges={int(num_edges)} (Flux={avg_flux:.4f}) - Pruned {pruned_count} this step", log_path)
            
    # Final Analysis
    initial_edges = (N * (N-1)) * initial_density / 2
    final_edges = edge_counts[-1]
    reduction = 100 * (1 - final_edges/initial_edges)
    
    log(f"\nFinal Result:", log_path)
    log(f"  Initial Edges: {int(initial_edges)}", log_path)
    log(f"  Final Edges:   {int(final_edges)}", log_path)
    log(f"  Reduction:     {reduction:.1f}%", log_path)
    
    # Visual check of Small World property (if not empty)
    if final_edges > N:
        G_final = nx.from_numpy_array(weights)
        try:
            # Check giant component
            largest_cc = max(nx.connected_components(G_final), key=len)
            subG = G_final.subgraph(largest_cc)
            path_len = nx.average_shortest_path_length(subG)
            clustering = nx.average_clustering(subG)
            log(f"  Topology Check: PathLen={path_len:.2f}, Clustering={clustering:.2f}", log_path)
            log("  [SUCCESS] Network maintained connectivity while shedding mass.", log_path)
        except:
            log("  [WARNING] Network fragmented significantly.", log_path)
    else:
        log("  [FAIL] Network collapsed (too much pruning).", log_path)

    # Plot
    plt.figure(figsize=(10, 5))
    plt.plot(edge_counts, label='Active Edges (Metabolism)')
    plt.axhline(y=N, color='r', linestyle='--', label='O(N) Target')
    plt.title('Experiment 19: Metabolic Pruning ($O(N^2) \\to O(N)$)')
    plt.xlabel('Time Step')
    plt.ylabel('Count')
    plt.legend()
    plt.grid(True, alpha=0.3)
    
    output_png = os.path.join(os.path.dirname(__file__), 'exp19_sparse_metabolism.png')
    plt.savefig(output_png)
    log(f"Saved plot to {output_png}", log_path)

if __name__ == "__main__":
    run_sparse_metabolism()
