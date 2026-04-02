import torch
import numpy as np
import matplotlib.pyplot as plt

print("\n--- EXPERIMENT 3: CHANNEL ISOLATION (Multitasking) ---")
print("Validating Biology/Mamba: 'Lateral Inhibition prevents Leaking'")

def run_parallel_channels():
    steps = 100
    # Channel A: Sine Wave
    # Channel B: Cosine Wave
    t = np.linspace(0, 4*np.pi, steps)
    
    input_a = np.sin(t)
    input_b = np.cos(t) # Orthogonal approx
    
    # System with Cross-Talk (Leakage)
    leakage_factor = 0.2
    inhibition_factor = 0.5 # Lateral Inhibition
    
    out_a = []
    out_b = []
    
    # State
    curr_a = 0
    curr_b = 0
    
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = "exp03_parallel_channels.log"
    with open(output_path + log_file, "w") as f:
        f.write("--- EXPERIMENT 3: CHANNEL ISOLATION (Multitasking) ---\n")
    
    # Visualization
    import matplotlib.animation as animation
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 6))
    ims = []

    for i in range(steps):
        # 1. Inputs arrive
        ia = input_a[i]
        ib = input_b[i]
        
        # 2. Physics with Leakage
        # Without inhibition, A leaks to B
        next_a = ia + leakage_factor * curr_b
        next_b = ib + leakage_factor * curr_a
        
        # 3. Lateral Inhibition (The Solitonic Fix)
        # "If I am strong, I suppress my neighbor"
        inhib_a = inhibition_factor * np.abs(curr_a)
        inhib_b = inhibition_factor * np.abs(curr_b)
        
        # Apply inhibition to the cross-talk
        final_a = next_a - (np.abs(next_b) * leakage_factor * inhibition_factor)
        final_b = next_b - (np.abs(next_a) * leakage_factor * inhibition_factor)
        
        curr_a = final_a
        curr_b = final_b
        
        out_a.append(curr_a)
        out_b.append(curr_b)
        
        # Visualization
        line_a, = ax1.plot(range(len(out_a)), out_a, color='red')
        line_b, = ax2.plot(range(len(out_b)), out_b, color='blue')
        
        pt_a, = ax1.plot(len(out_a)-1, curr_a, 'ro')
        pt_b, = ax2.plot(len(out_b)-1, curr_b, 'bo')
        
        if i % 2 == 0: # Downsample
            ims.append([line_a, line_b, pt_a, pt_b])

    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    ani = animation.ArtistAnimation(fig, ims, interval=50, blit=True)
    ani.save(output_path + "exp03_parallel_channels.gif", writer='pillow')
    print(f"🎥 Saved {output_path}exp03_parallel_channels.gif")

    # Analysis: Correlation
    out_a = np.array(out_a)
    out_b = np.array(out_b)
    
    corr = np.corrcoef(out_a, out_b)[0,1]
    
    msg = f"Final Correlation (A vs B): {corr:.4f}\n"
    if abs(corr) < 0.3:
        msg += "✅ SUCCESS: Signals stayed separable."
    else:
        msg += f"⚠️ WARNING: High correlation ({corr}). Leakage detected."
    
    print(msg)
    with open(output_path + log_file, "a") as f: f.write(msg + "\n")

if __name__ == "__main__":
    run_parallel_channels()
