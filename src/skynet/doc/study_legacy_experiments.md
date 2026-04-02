# Study of Legacy Solitonic Experiments

This document details the physical algorithms and architectural patterns discovered in the legacy `.py` files corresponding to the core project visualizations.

## 1. Competitive Survival (`competitive_survival_test.gif`)

**Source**: `tests/applications/app_competitive_survival.py`

### Physics: The War of Geometries

- **Model**: Two species (Red vs Blue) on a Grid Graph.
- **Equation**: Reaction-Advection-Diffusion (RAD) with **Contact Inhibition**.
  - $$ \Delta B*{red} = \text{Adv}(B*{red}) + \text{Growth}(B\_{red}) - \text{Decay} - \text{Suffocation} $$
- **Key Mechanism**: **Metric Warping**.
  - The "Flow Weights" for Red are inhibited by the mass of Blue at the target node: `w_red = scent / (1 + mass_blue)`.
  - This creates a physical exclusion zone. Red cannot flow where Blue is dense.
- **Significance**: Adaptation through spatial dominance. The "fitter" geometry (Red's high diffusion vs Blue's high growth) wins depending on the environment.

## 2. Causal Expansion (`causal_expansion_test.gif`)

**Source**: `tests/applications/app_causal_expansion.py`

### Physics: Autopoiesis (Self-Creation)

- **Model**: Disconnected Islands (Graph components).
- **Key Mechanism**: **Dynamic Topology**.
  - $$ \text{if } B_n > \text{Threshold}: \text{CreateEdge}(n, \text{Target}) $$
  - Matter creates Space. The swarm "builds bridge" to the goal only when it has sufficient mass (energy) to sustain the connection.
- **Flow**: Guided by Scent (Pheromone) and Pressure (Biomass Gradient).
- **Significance**: Solves the "sparse reward" problem by physically expanding the search space towards the goal.

## 3. Collective Maze (`collective_maze_test.gif`)

**Source**: `tests/applications/app_collective_maze.py`

### Physics: Swarm Gravity

- **Signal**: A composite field of **Goal** + **Peer**.
  - $$ P*{signal} = P*{goal} + 0.5 \cdot B\_{self} $$
- **Mechanism**: Agents are attracted to the goal _and_ to each other.
  - This prevents fragmentation in the maze. If one part of the swarm finds the path, the rest follow due to "Peer Gravity".
- **Significance**: Robust navigation. The swarm acts as a single cohesive liquid.

## 4. Hydra System A/B (`hydra_system_A.gif`)

**Source**: `tests/soliton_pc/app_hydra_system.py`

### Physics: Emergent Logic Junction

- **Components**: Biomass (Flow), Pheromone (Signal), Memory (State).
- **Mechanism**: **Weighted Average Decision**.
  - At the "Junction" nodes (Logic Gate), the system computes:
    $$ \text{State} = \frac{\sum (M_i \cdot B_i)}{\sum B_i} $$
  - If `State > 1.5`: Route A. If `State < -1.5`: Route B.
- **Significance**: Logic is not a hardcoded "If/Then" but an **emergent property** of the swarm's collective memory state at a specific location.

## 5. Soliton PC (`soliton_pc_test.gif`)

**Source**: `tests/applications/app_soliton_pc.py`

### Physics: Plastic Computation

- **Architecture**: `Logic` $\to$ `Plastic Bus` $\to$ `Memory`.
- **Mechanism**: **Activity-Dependent Rewiring**.
  - `if Biomass(BusNode) > Threshold: AddEdge(BusNode, RandomMemoryNode)`
  - High activity creates physical pathways.
- **Significance**: The "Computer" builds its own wires based on data flow. Adaptation is structural.

## 6. Parallel Stress (`soliton_parallel_stress.gif`)

**Source**: `tests/applications/app_integrated_stress_test.py`

### Physics: Channel Separation

- **Mechanism**: **High-Contrast Flow**.
  - Flow weights are raised to a high power or multiplied heavily by gradient `max(0, dP) * 12.0`.
  - This prevents "leaking" between parallel tasks running on the same substrate.
- **Significance**: Proof that Solitons can multitask if the signal gradients are sharp enough.

## 7. Active Swarm / Tensor Lenia (`tensor_lenia_science.gif`)

**Source**: `tests/applications/app_active_swarm.py`

### Physics: The Kernel of Life (Chiral Lenia)

- **Model**: Tensor Lenia on a Dynamic Graph.
- **Mechanism**: **Chiral Metric Tensor**.
  - The flow weights include a "Spin" term: `w_spin = CHIRALITY * val_u` (if $u < v$).
  - This breaks symmetry, causing the swarm to rotate/spiral rather than just diffuse.
- **Analysis**: The script calculates **Fractal Dimension** $D$ in real-time ($N(r) \sim r^D$). Life requires $D \approx 0.5 - 1.5$ (filamentous/complex).
- **Significance**: Symmetry breaking is essential for "Active Matter". Without it, everything settles into static crystals.

## 8. Swarm Migration (`swarm_migration.png`)

**Source**: `demo_swarm.py`

### Physics: Directed Transport

- **Mechanism**: **Anisotropic Flow Field**.
  - Weights are hardcoded: `w(u,v) = 1.0` if $u < v$, `0.0` otherwise.
  - This creates a "River" in the graph topology.
- **Observation**: The soliton (high biomass cluster) rides the flow while maintaining its shape due to the internal Gaussian Growth function (Lenia interaction).
- **Significance**: Proves that Solitons can be transported across a network without disintegrating, enabling "Message Passing" in the Hydra brain.

---

**Conclusion**:
The "Solitonic AGI" is built on three pillars found in these scripts:

1.  **Lenia Growth**: The engine that keeps the signal alive (`Growth(u)`).
2.  **Metric Advection**: The steering wheel that moves the signal (`ApplyAsymmetricLaplacian`).
3.  **Dynamic Topology**: The plasticity that allows the hardware to adapt to the signal (`CreateEdge/DestroyEdge`).
