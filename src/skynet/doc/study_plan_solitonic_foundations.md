# Study Plan: Solitonic Foundations (Tensor Lenia)

**Unifying Turing, Lenia, and Wolfram for Organic AGI**

## 1. Theoretical Core: The "Why" and "How"

Current AI (NNs) minimizes error on a fixed manifold manually designed by engineers.
**Solitonic AGI** minimizes energy on a dynamic manifold self-assembled by the system.

### A. The Trinity of Mathematical Physics

1.  **Wolfram (Sustrate)**: The universe is a hypergraph. Space-time emerges from causal updates.
    - _Equation_: $R_{\mu\nu} - \frac{1}{2}Rg_{\mu\nu} = T_{\mu\nu}$ (Emerges from node counting).
2.  **Lenia (Field)**: Life is a localized pattern (soliton) in a continuous field.
    - _Equation_: $A_{t+1} = G(K * A_t)$ (Reaction-Diffusion with non-local kernel).
3.  **Turing (Mechanism)**: Complexity arises from symmetry breaking (diffusive instability).
    - _Equation_: $\frac{\partial u}{\partial t} = D \nabla^2 u + R(u,v)$.

### B. The Unified Theory: Covariant Tensor Lenia

The flaw in standard Lenia is that it assumes a flat Euclidean grid. A real brain (or universe) is a curved, dynamic manifold.
**We must implement:**
$$ \nabla\_\mu \nabla^\mu \phi + V(\phi) = \int \mathcal{G}(x,y) \phi(y) \sqrt{-g} dy $$
Where the convolution kernel $K$ is actually the **Green's Function** of the evolving topology.

## 2. Experimental Audit: What Worked & Why

We must revisit these successful experiments and extract their physical principles:

| Experiment              | Concept                     | Math Principle                     | Code File                     |
| :---------------------- | :-------------------------- | :--------------------------------- | :---------------------------- |
| `causal_expansion_test` | **Structural Plasticity**   | Energy > Threshold $\to$ New Edge  | `app_causal_expansion.py`     |
| `competitive_survival`  | **Evolutionary Pressure**   | $\nabla^2$ (Laplacian) Competition | `app_competitive_survival.py` |
| `soliton_pc_test`       | **Logic from Interference** | Wave Superposition                 | `app_soliton_pc.py`           |
| `tensor_lenia_science`  | **Emergent Laws**           | Ricci Flow / Curvature             | `tests/tensor_lenia/`         |

## 3. Action Plan: From "Camouflaged NN" to "Physical Intelligence"

We will verify that `HydraEngine` is NOT just doing matrix multiplication, but simulating these physics:

### Step 1: Verify the Operator

Ensure `apply_laplacian()` in `hydra_engine.py` is a true discretization of the Beltrami-Laplace operator on a graph, not just a learned weight matrix.

- _Check_: Is $L = D - A$? Yes.
- _Check_: Are weights learned (NN) or physical (Diffusion)? They must be physical.

### Step 2: Verify the nonlinearity

The `growth` function $G$ must be a double-well potential (Higgs-like) to allow bistability (0/1), not just a sigmoid (ReLU/Tanh) for gradient descent.

- _Current_: $G(x) = \exp(-(x-\mu)^2/\sigma) - 1$. This is correct (Gaussian peak).

### Step 3: Verify the Topology

The graph topology must evolve. If connection weights update but the graph is fixed, it's just a sparse NN.

- _Requirement_: The graph must add/remove nodes/edges based on _energy_, not _error gradients_.

## 4. Deliverable

A certified **Solitonic AGI Kernel** that runs `XOR` and `N-Back` fundamentally differently from PyTorch `nn.Linear`:

- **No Backprop**: Learning via Hebbian/Structural plasticity.
- **No Epochs**: Continuous online adaptation.
- **No Layers**: A single dynamic manifold.
