
import numpy as np
import matplotlib.pyplot as plt
import os

# ==============================================================================
# 🧩 V8 THERMODYNAMICS PROOF OF CONCEPT
# "The Engine that runs on Stress"
# ==============================================================================

def setup_logger():
    log_path = os.path.join(os.path.dirname(__file__), "poc_v8_thermodynamics.log")
    with open(log_path, "w") as f:
        f.write("--- V8 PoC: ACCEL/BRAKE DYNAMICS ---\n")
    return log_path

def log(msg, log_path=None):
    print(msg)
    if log_path:
        with open(log_path, "a") as f:
            f.write(msg + "\n")

def run_thermodynamic_test():
    log_path = setup_logger()
    
    # 1. PARAMETERS
    dt = 0.1
    steps = 500
    
    # Physics (Hamiltonian)
    # H = 0.5*p^2 + 0.5*k*q^2
    k = 1.0 
    
    # V8 Mechanisms
    base_gain = 1.0
    base_friction = 0.05
    
    # State
    q = 0.5
    p = 0.0
    
    # Shadow State for Lyapunov
    q_shadow = q + 1e-6
    p_shadow = p
    
    # History
    history = {
        'q': [], 'p': [], 'energy': [], 
        'gain': [], 'friction': [], 'lyapunov': [],
        'stress': []
    }
    
    log("Starting V8 Thermodynamic Stress Test...", log_path)
    log("Phase 1: CALM (T=0-150)\nPhase 2: STRESS (T=150-300)\nPhase 3: DANGER (T=300-500)", log_path)
    
    for t in range(steps):
        # --- A. STRESS INJECTION (Simulating Input Varianace) ---
        if t < 150:
            stress_level = 0.1 # Calm
        elif t < 300:
            stress_level = 2.0 # High Stress (Metabolic Trigger)
        else:
            stress_level = 5.0 # Danger (Epilepsy Trigger)
            
        noise = np.random.randn() * stress_level
        
        # --- B. METABOLIC ACCELERATOR (The "Gain") ---
        # Logic: If Stress is high, Gain increases to "think harder"
        # Formula: Gain = 1 + tanh(Stress/Factor)
        metabolic_gain = 1.0 + np.tanh(stress_level * 0.5) * 4.0 
        
        # Input Signal amplified by Metabolism
        force_in = noise * metabolic_gain
        
        # --- C. LYAPUNOV BRAKE (The "Thermostat") ---
        # Measure Divergence between Trajectory and Shadow
        dist_sq = (q - q_shadow)**2 + (p - p_shadow)**2
        dist = np.sqrt(dist_sq + 1e-12)
        expansion = np.log(dist / 1e-6)
        
        # Reset Shadow (Renormalization)
        q_shadow = q + (q_shadow - q) / dist * 1e-6
        p_shadow = p + (p_shadow - p) / dist * 1e-6
        
        # Controller: If expanding (Chaos), ADD Friction
        # Logic: Non-linear response. If exp > 0, Friction explodes.
        # Friction = Base + (e^(Expand * 2) - 1)
        if expansion > 0:
            brake_force = (np.exp(expansion * 2.0) - 1.0) * 0.5
        else:
            brake_force = 0.0
            
        # --- NEW: ENERGY BRAKE (Safety Valve) ---
        # If kinetic energy is insane, clamp it.
        # This solves the "Linear Runaway" problem where Lyapunov is 0 but q -> infinity
        kinetic = 0.5 * p**2
        safety_brake = max(0, (kinetic - 50.0) * 0.1) # Soft clamp above E_kin=50
            
        lyapunov_friction = base_friction + brake_force + safety_brake
        
        # Clamp friction to avoid freezing completely (or physics breaking)
        # Max 2.0 was too low for Gain 5.0. Need Max 10.0
        friction = min(10.0, lyapunov_friction)
        
        # --- D. PHYSICAL STEP (Hamiltonian) ---
        # 1. Potential Force
        f_q = -k * np.tanh(q) # Non-linear spring
        
        # 2. Symplectic Update
        p_new = p + (f_q + force_in) * dt
        p_new = p_new * (1.0 - friction * dt) # Dissipation
        
        q_new = q + p_new * dt
        
        # Shadow Step (Identical Physics)
        f_q_s = -k * np.tanh(q_shadow)
        p_s_new = p_shadow + (f_q_s + force_in) * dt
        p_s_new = p_s_new * (1.0 - friction * dt)
        q_s_new = q_shadow + p_s_new * dt
        
        # Update
        q, p = q_new, p_new
        q_shadow, p_shadow = q_s_new, p_s_new
        
        # Energy
        energy = 0.5 * p**2 + 0.5 * k * q**2
        
        # Record
        history['q'].append(q)
        history['p'].append(p)
        history['energy'].append(energy)
        history['gain'].append(metabolic_gain)
        history['friction'].append(friction)
        history['lyapunov'].append(expansion)
        history['stress'].append(stress_level)
        
        if t % 50 == 0:
            log(f"T={t} | Stress={stress_level:.1f} | Gain={metabolic_gain:.2f} | Fric={friction:.2f} | E={energy:.2f}", log_path)

    # --- ANALYSIS ---
    avg_e_calm = np.mean(history['energy'][:150])
    avg_e_stress = np.mean(history['energy'][150:300])
    avg_e_danger = np.mean(history['energy'][300:])
    
    max_e = np.max(history['energy'])
    
    log("\n--- RESULTS ---", log_path)
    log(f"Avg Energy (Calm):   {avg_e_calm:.4f}", log_path)
    log(f"Avg Energy (Stress): {avg_e_stress:.4f} (Should be higher)", log_path)
    log(f"Avg Energy (Danger): {avg_e_danger:.4f} (Should be stable/capped)", log_path)
    log(f"Max Energy:          {max_e:.4f}", log_path)
    
    success = True
    if avg_e_stress < avg_e_calm:
        log("[FAIL] Metabolism didn't accelerate.", log_path)
        success = False
    if max_e > 1000.0 or np.isnan(max_e):
        log("[FAIL] Explosion! Lyapunov brake failed.", log_path)
        success = False
        
    if success:
        log("[SUCCESS] V8 Engine maintained 'High Energy Stasis'.", log_path)

    # --- PLOTTING ---
    fig, axs = plt.subplots(3, 1, figsize=(10, 10), sharex=True)
    
    # 1. State & Energy
    axs[0].plot(history['q'], label='State (q)', color='blue', alpha=0.6)
    axs[0].plot(history['energy'], label='Total Energy', color='red', linewidth=2)
    axs[0].set_title("V8 Dynamics: Energy vs State")
    axs[0].legend()
    axs[0].grid(True, alpha=0.3)
    
    # 2. Controls (Gain vs Friction)
    axs[1].plot(history['gain'], label='Metabolic Gain (Input)', color='green')
    axs[1].plot(history['friction'], label='Lyapunov Friction (Brake)', color='orange')
    axs[1].set_title("Control Loop: Accel vs Brake")
    axs[1].legend()
    axs[1].grid(True, alpha=0.3)
    
    # 3. Stress Map
    axs[2].plot(history['stress'], label='Env Stress', color='grey', linestyle='--')
    axs[2].set_title("Environment Condition")
    axs[2].set_xlabel("Time Step")
    axs[2].legend()
    
    output_png = os.path.join(os.path.dirname(__file__), 'poc_v8_thermodynamics.png')
    plt.tight_layout()
    plt.savefig(output_png)
    log(f"Saved plot to {output_png}", log_path)

if __name__ == "__main__":
    run_thermodynamic_test()
