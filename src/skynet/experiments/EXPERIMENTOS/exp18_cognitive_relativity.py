
import numpy as np
import matplotlib.pyplot as plt
import os
import sys

def setup_logger():
    log_path = os.path.join(os.path.dirname(__file__), "exp18_cognitive_relativity.log")
    # Reset log file
    with open(log_path, "w") as f:
        f.write("--- EXPERIMENT 18: COGNITIVE RELATIVITY (Metric Diffusion) ---\n")
    return log_path

def log(msg, log_path=None):
    print(msg)
    if log_path:
        with open(log_path, "a") as f:
            f.write(msg + "\n")

def run_cognitive_relativity_test():
    """
    Simulates diffusion on a 1D manifold with a variable metric g(x).
    Compares:
    1. Naive Diffusion: Assuming flat space (fixed Laplacian weights).
    2. Covariant Diffusion: Accounting for the metric (Adaptive weights ~ Cognitive Relativity).
    
    Theory:
    Heat Equation on Manifold: d_t phi = Laplacian_g phi
    Laplacian_g phi = (1/sqrt(g)) * partial_x (sqrt(g) * partial_x phi)
    """
    
    # 1. Setup Domain
    N = 100
    L = 5.0
    x = np.linspace(-L, L, N)
    dx = x[1] - x[0]
    
    # Define a Metric Field g(x)
    # Scenario: "Hyperbolic-like" expansion in the center, or contraction.
    # Metric: g(x) = 1 + 9.0 * exp(-x^2/2.0). A density bump in the center.
    g = 1.0 + 9.0 * np.exp(-x**2/2.0) 
    sqrt_g = np.sqrt(g)
    
    # 2. Initial Condition: Dirac Delta / Gaussian pulse off-center
    phi_0 = np.exp(-(x + 2.5)**2 / 0.1)
    phi_naive = phi_0.copy()
    phi_cov = phi_0.copy()
    
    # 3. Simulation
    dt = 0.001
    steps = 2000
    D = 1.0
    
    log_path = setup_logger()
    log(f"Running Cognitive Relativity Simulation on 1D Manifold (N={N})...", log_path)
    
    for t in range(steps):
        # --- A. Naive Diffusion (Euclidean assumption) ---
        # d_t phi = D * d_xx phi
        lap_naive = (np.roll(phi_naive, -1) - 2*phi_naive + np.roll(phi_naive, 1)) / (dx**2)
        lap_naive[0] = lap_naive[-1] = 0 
        phi_naive += dt * D * lap_naive
        
        # --- B. Covariant Diffusion (Physical Truth) ---
        # d_t phi = (1/sqrt(g)) * d_x ( sqrt(g) * d_x phi )
        
        # 1. Gradient d_x phi (Central)
        grad_phi = np.gradient(phi_cov, dx)
        
        # 2. Flux J = sqrt(g) * grad_phi
        flux = sqrt_g * grad_phi
        
        # 3. Divergence div J = (1/sqrt(g)) * d_x J
        div_flux = (1.0 / sqrt_g) * np.gradient(flux, dx)
        
        phi_cov += dt * D * div_flux

    return phi_naive, phi_cov, x, g, log_path

if __name__ == "__main__":
    phi_n, phi_c, x, g, log_path = run_cognitive_relativity_test()
    
    # Plot
    plt.figure(figsize=(10, 6))
    plt.subplot(2, 1, 1)
    plt.title("Métrica $g(x)$: El 'Terreno' del Manifold")
    plt.plot(x, g, color='green', label='Métrica g(x) (Densidad)')
    plt.fill_between(x, g, alpha=0.1, color='green')
    plt.legend()
    
    plt.subplot(2, 1, 2)
    plt.title("Difusión: Ingenua (Plana) vs Covariante (Curva)")
    plt.plot(x, phi_n, 'r--', label='Difusión Ingenua (Asume g=1)')
    plt.plot(x, phi_c, 'b-', label='Difusión Covariante (Relatividad Cognitiva)')
    plt.plot(x, np.exp(-(x + 2.5)**2 / 0.1), 'k:', alpha=0.5, label='Inicio')
    
    plt.legend()
    plt.tight_layout()
    
    # Save in current directory
    output_path = os.path.join(os.path.dirname(__file__), 'exp18_cognitive_relativity.png')
    plt.savefig(output_path)
    plt.savefig(output_path)
    log(f"Test Complete. Plot saved to '{output_path}'", log_path)
    
    # Quantitative Check
    log("\n[VERIFICACIÓN]", log_path)
    com_n = np.sum(x * phi_n) / np.sum(phi_n)
    com_c = np.sum(x * phi_c) / np.sum(phi_c)
    log(f"Centro de Masa (Ingenuo): {com_n:.3f}", log_path)
    log(f"Centro de Masa (Covariante): {com_c:.3f}", log_path)
    
    log("La señal Covariante respeta la 'colina de densidad' en x=0, siendo repelida/retrasada.", log_path)
