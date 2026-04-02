
import sys
import os
import statistics

# Path setup to find tensor_lenia lib from EXPERIMENTOS
sys.path.append(os.path.join(os.path.dirname(__file__), '../tests/tensor_lenia/lib'))

from hypergraph import SimpleWolframSystem
from curvature import calculate_forman_ricci

def run_ricci_distribution_experiment(steps=12):
    
    log_path = os.path.join(os.path.dirname(__file__), "exp16_ricci_curvature.log")
    with open(log_path, "w") as f:
        f.write("--- EXPERIMENT 16: RICCI CURVATURE (Geometric Intelligence) ---\n")

    def log(msg):
        print(msg)
        with open(log_path, "a") as f:
            f.write(msg + "\n")

    log(f"Running Ricci Curvature Distribution Experiment for {steps} steps...")
    
    # Initialize
    initial_edges = [[1, 2], [1, 3]]
    system = SimpleWolframSystem()
    system.initialize(initial_edges)
    
    # Evolve
    for i in range(steps):
        system.step()
        
    log(f"System evolved. Nodes: {system.next_node_id - 1}, Edges: {len(system.edges)}")
    
    # Measure Curvature
    log("Calculating Forman-Ricci Curvature (this is O(E^2) roughly, might be slow)...")
    curvatures = calculate_forman_ricci(system)
    
    vals = list(curvatures.values())
    
    min_c = min(vals)
    max_c = max(vals)
    avg_c = statistics.mean(vals)
    std_c = statistics.stdev(vals) if len(vals) > 1 else 0
    
    log(f"Curvature Statistics:")
    log(f"  Min Ricci: {min_c:.4f}")
    log(f"  Max Ricci: {max_c:.4f}")
    log(f"  Avg Ricci: {avg_c:.4f}")
    log(f"  Std Dev:   {std_c:.4f}")
    
    # Histogram
    freqs = {}
    # Binning roughly integer values since Forman is often integer-like
    for c in vals:
        bin_c = round(c)
        freqs[bin_c] = freqs.get(bin_c, 0) + 1
        
    log("\nCurvature Distribution (Rounded):")
    sorted_freqs = sorted(freqs.items())
    for c, count in sorted_freqs:
        bar = "#" * int(count / len(vals) * 50) 
        if not bar and count > 0: bar = "."
        log(f"  {c:3d}: {count:5d} {bar}")

    # Visualization
    import matplotlib.pyplot as plt
    plt.figure(figsize=(8, 5))
    plt.hist(vals, bins=20, color='teal', alpha=0.7, edgecolor='black')
    plt.title('Experiment 16: Curvature Distribution of the Neural Manifold')
    plt.xlabel('Ricci Curvature')
    plt.ylabel('Frequency (Node Count)')
    plt.axvline(avg_c, color='red', linestyle='dashed', linewidth=1, label=f'Mean: {avg_c:.2f}')
    plt.legend()
    plt.grid(True, alpha=0.3)
    output_path = os.path.join(os.path.dirname(__file__), 'exp16_ricci_curvature.png')
    plt.savefig(output_path)
    log(f"Saved curvature histogram to {output_path}")

    # Interpretation
    # Negative curvature -> Hyperbolic (saddle points, expansion)
    # Positive curvature -> Spherical (clumps, slow growth)
    # Zero -> Flat (grid)
    
    if std_c > 0.1:
        log("\n[SUCCESS] Manifold has varied curvature structure.")
    else:
        log("\n[FAIL] Manifold is geometrically flat.")

if __name__ == "__main__":
    run_ricci_distribution_experiment()
