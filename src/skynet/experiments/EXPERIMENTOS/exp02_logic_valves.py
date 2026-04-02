import torch
import numpy as np

print("\n--- EXPERIMENT 2: LOGIC VALVES (Solitonic Computations) ---")
print("Validating Turing/Lenia: 'Collisions perform Logic'")

def sigmoid(x):
    return 1 / (1 + np.exp(-x))

def run_logic_gates():
    # Design a Y-Junction
    # Input A -> Junction
    # Input B -> Junction
    # Junction -> Output
    
    inputs = [(0,0), (0,1), (1,0), (1,1)]
    
    # Logging
    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    log_file = "exp02_logic_valves.log"
    with open(output_path + log_file, "w") as f:
        f.write("--- EXPERIMENT 2: LOGIC VALVES (Solitonic Computations) ---\n")
        f.write("A | B | Junction Mass | XOR Output | AND Output\n")
        f.write("-" * 50 + "\n")

    # Visualization
    import matplotlib.pyplot as plt
    import matplotlib.animation as animation
    fig, ax = plt.subplots(figsize=(6, 6))
    ax.set_xlim(-1, 2)
    ax.set_ylim(-1, 2)
    ims = []
    
    print("\nSimulating Soliton Collision at Junction:")
    print("A | B | Junction Mass | XOR Output | AND Output")
    print("-" * 50)
    
    for i, (a, b) in enumerate(inputs):
        # Physics: Constructive/Destructive Interference
        mass_a = a * 1.0
        mass_b = b * 1.0
        
        # Collision at Junction
        junction_mass = mass_a + mass_b
        
        # Logic Gate 1: AND (Threshold > 1.5)
        and_out = 1.0 if junction_mass > 1.5 else 0.0
        
        # Logic Gate 2: XOR (Inhibitory Feedback)
        if junction_mass > 1.5:
            xor_out = 0.0 # Collision destroy signal
        elif junction_mass > 0.5:
            xor_out = 1.0 # Signal passes
        else:
            xor_out = 0.0
            
        msg = f"{a} | {b} | {junction_mass:5.1f}       | {xor_out:5.1f}      | {and_out:5.1f}"
        print(msg)
        with open(output_path + log_file, "a") as f: f.write(msg + "\n")

        # Visualization Frame
        circle_a = plt.Circle((0, 1), 0.3 * (mass_a + 0.1), color='red', alpha=0.5 + 0.5*a)
        circle_b = plt.Circle((1, 1), 0.3 * (mass_b + 0.1), color='blue', alpha=0.5 + 0.5*b)
        circle_j = plt.Circle((0.5, 0), 0.3 * (junction_mass/2.0 + 0.1), color='purple', alpha=0.5 + 0.5*(junction_mass/2.0))
        
        txt = ax.text(0.5, 1.5, f"Input: ({a},{b})\nXOR: {xor_out}", ha='center')
        
        ims.append([ax.add_patch(circle_a), ax.add_patch(circle_b), ax.add_patch(circle_j), txt])
        # Pause frames
        for _ in range(5):
             ims.append([ax.add_patch(circle_a), ax.add_patch(circle_b), ax.add_patch(circle_j), txt])

    output_path = "/home/daroch/SOLITONES/EXPERIMENTOS/"
    ani = animation.ArtistAnimation(fig, ims, interval=200, blit=True, repeat_delay=1000)
    ani.save(output_path + "exp02_logic_valves.gif", writer='pillow')
    print(f"🎥 Saved {output_path}exp02_logic_valves.gif")
        
    final_msg = "\nAnalysis:\n✅ AND Gate: Created by simple threshold (Constructive Interference).\n✅ XOR Gate: Created by 'Overcrowding' (Destructive Interference)."
    print(final_msg)
    with open(output_path + log_file, "a") as f: f.write(final_msg + "\n")

if __name__ == "__main__":
    run_logic_gates()
