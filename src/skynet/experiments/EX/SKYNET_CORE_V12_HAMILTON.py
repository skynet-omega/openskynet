"""
SKYNET_CORE_V12_HAMILTON.py
===========================
Architecture: The Symplectic Resonator
Physics: Hamiltonian Dynamics (Leapfrog Integrator)
Goal: Infinite Memory Horizon via Phase Space Volume Conservation.
"""

import torch
import torch.nn as nn
import torch
import torch.nn as nn
import numpy as np
from SKYNET_CORE_V11_FUSION import UniversalRetina, ChaoticTeacher # Import Retina and Teacher

# Copied from Physics Core to avoid complex imports
def mod_soft(z: torch.Tensor) -> torch.Tensor:
    mag = z.abs() + 1e-6
    phase = z / mag
    new_mag = 2.0 * torch.tanh(0.5 * mag)
    return new_mag.type(torch.complex64) * phase

class HamiltonianCell(nn.Module):
    def __init__(self, input_dim, hidden_dim, dt=0.2):
        """
        Symplectic RNN Cell using Leapfrog Integration.
        """
        super().__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.dt = dt 
        
        self.W_in = nn.Linear(input_dim, hidden_dim, bias=False)
        self.K = nn.Parameter(torch.ones(hidden_dim)) 
        
        self.W_q = nn.Linear(hidden_dim, hidden_dim, bias=False)
        with torch.no_grad():
            self.W_q.weight.copy_(torch.eye(hidden_dim) + torch.randn(hidden_dim, hidden_dim)*0.01)

    def potential_force(self, q):
        q_mix = self.W_q(q)
        force_direction = -torch.tanh(q_mix)
        force = torch.matmul(force_direction, self.W_q.weight) * self.K
        return force

    def forward(self, x, state):
        if state is None:
             B = x.shape[0]
             q = torch.zeros(B, self.hidden_dim, device=x.device)
             p = torch.zeros(B, self.hidden_dim, device=x.device)
        else:
             q, p = state

        f_in = self.W_in(x)
        
        f_q = self.potential_force(q)
        p_half = p + (f_q + f_in) * (0.5 * self.dt)
        
        q_new = q + p_half * self.dt
        
        f_q_new = self.potential_force(q_new)
        p_new = p_half + (f_q_new + f_in) * (0.5 * self.dt)
        
        return (q_new, p_new)

# ==============================================================================
# DROP-IN REPLACEMENT FOR SKYNET V11 FUSION
# ==============================================================================

# ==============================================================================
# ENERGY READOUT (V12.1 UPGRADE)
# ==============================================================================
# ==============================================================================
# V12.2 UPGRADE: SYMPLECTIC OBSERVER
# ==============================================================================
class SymplecticObserver(nn.Module):
    def __init__(self, hidden_dim, action_dim):
        super().__init__()
        self.hidden_dim = hidden_dim
        # Features Explicit:
        # 1. q (Position/Phase) -> H
        # 2. p (Momentum)       -> H
        # 3. Energy (q^2 + p^2) -> H
        # Total Input: 3 * H
        input_features = hidden_dim * 3
        
        self.dense = nn.Sequential(
            nn.Linear(input_features, hidden_dim * 2),
            nn.ELU(), # Non-linearity to learn manifolds
            nn.Linear(hidden_dim * 2, action_dim)
        )
        
    def forward(self, z_flat):
        # z_flat: [Batch, ..., 2 * hidden_dim] (q, p)
        if z_flat.shape[-1] != self.hidden_dim * 2:
             # Fallback or strict check? 
             pass
             
        q, p = torch.split(z_flat, self.hidden_dim, dim=-1)
        
        # 1. Energy Invariant (Magnitude)
        energy = q.pow(2) + p.pow(2)
        
        # 2. Concatenate Full Phase Space + Invariant
        # [q, p, Energy]
        features = torch.cat([q, p, energy], dim=-1)
        
        return self.dense(features)

class SkynetV12SymplecticFusion(nn.Module):
    """
    Wrapper for V12 Hamiltonian Core to resemble V11 Fusion API.
    Can be used in TEST_* scripts by simply replacing the class import.
    """
    def __init__(self, n_input, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.device = device
        self.n_hidden = n_hidden
        self.n_actions = n_actions
        
        print("Initializing V12 Symplectic Resonator (Hamiltonian Physics)...")
        print("   >> UPGRADE: V12.2 Symplectic Observer (Full Phase Space).")
        
        # 1. RETINA (Reuse V11)
        self.retina = UniversalRetina(n_input, n_hidden, device=device)
        
        # 2. CORE (Hamiltonian)
        # We need N/2 units for q and N/2 for p to keep parameter count roughly similar?
        # Actually V12 splits state into q,p. 
        # If n_hidden is passed, let's treat it as the size of 'q'.
        # Total effective state size is 2*n_hidden.
        self.core = HamiltonianCell(n_hidden, n_hidden, dt=0.5).to(device)
        self.n_hidden_total = n_hidden * 2 # Compatible attribute for ARC/Decoder
        
        # 3. PREDICTOR (Dummy for compatibility, or functional?)
        # For now, we don't fully implement JEPA unless requested, but we need the layer.
        self.predictor = nn.Linear(n_hidden*2, n_hidden*2, device=device)
        
        # 4. MOTOR (V12.2 Symplectic Observer)
        self.actor = SymplecticObserver(n_hidden, n_actions).to(device)
        
        # 5. TEACHER (Chaotic)
        self.teacher = ChaoticTeacher(n_hidden * 2, device=device)
        self.teacher_eye = None
        
        # Homeostat dummy
        self.use_organ = False

        # Adapter to map Retina (Complex 2H) to Core (Real H)
        self.adapter_proj = nn.Linear(n_hidden * 2, n_hidden, device=device)
        
    def forward(self, x_seq, z_init=None):
        # Wraps the core loop
        # Input: [B, T, D]
        # x_seq is usually Long (Indices) or Float. Retina handles it.
        
        x_inner = self.retina(x_seq) # Retina outputs complex (UniversalRetina)
        
        # Compatible logic: Retina -> Complex.
        # Hamiltonian needs Real input.
        if x_inner.is_complex():
            x_processed = torch.cat([x_inner.real, x_inner.imag], dim=-1) # [B, T, 2*H]
        else:
            # Fallback if retina returns real (e.g. specialized mode changed)
            x_processed = torch.cat([x_inner, torch.zeros_like(x_inner)], dim=-1)
        # Project back to H for Core
        # Or... let the core input dimension match 2*H?
        # Current HamiltonianCell expects n_hidden input.
        # Let's add a projection layer here.
        x_input = self.adapter_proj(x_processed)

        B, T, _ = x_input.shape
        
        if z_init is None:
            # Init State (q, p)
            q = torch.zeros(B, self.n_hidden, device=self.device)
            p = torch.zeros(B, self.n_hidden, device=self.device)
        else:
            # Compatibility Logic
            if isinstance(z_init, tuple):
                # Assume (q, p) from V12 output
                q, p = z_init
            elif torch.is_tensor(z_init) and z_init.is_complex():
                # Map Complex H to (q, p)
                # q = Real, p = Imag
                # Slice if too big (ARC test sends n_hidden_total)
                if z_init.shape[-1] > self.n_hidden:
                    z_init = z_init[:, :self.n_hidden]
                
                q = z_init.real
                p = z_init.imag
            else:
                # Assume z_init is flattened [q, p] (2*H)
                if z_init.shape[-1] == self.n_hidden * 2:
                    q = z_init[:, :self.n_hidden]
                    p = z_init[:, self.n_hidden:]
                else:
                    # Fallback or Error
                    # Try to slice?
                    if z_init.shape[-1] >= self.n_hidden:
                         q = z_init[:, :self.n_hidden]
                         p = torch.zeros_like(q)
                    else:
                        raise ValueError(f"z_init shape {z_init.shape} incompatible with hidden {self.n_hidden}")

        history = []
        for t in range(T):
            x_t = x_input[:, t]
            q, p = self.core(x_t, (q, p))
            state_flat = torch.cat([q, p], dim=-1)
            history.append(state_flat)
            
        states = torch.stack(history, dim=1) # [B, T, 2H]
        # Return final state as tensor [B, 2H] for compatibility with .abs() calls
        final_state = torch.cat([q, p], dim=-1)
        return states, final_state

    def get_action_logits(self, z):
        """
        API Compatibility for tests that need manual readout.
        z: [Batch, Seq, Hidden * 2] OR (q, p) tuple
        """
        if isinstance(z, tuple):
            z = torch.cat(z, dim=-1)
        return self.actor(z)

    def train_student_imitation(self, obs_seq, action_seq, z_init=None, label_smoothing=0.1):
        """
        API Compatibility for supervised learning tests (e.g. N-Back, Logic)
        """
        states, _ = self.forward(obs_seq, z_init)
        
        # Actor Readout
        logits_seq = self.actor(states) # [B, T, Actions]
        
        logits_flat = logits_seq.reshape(-1, self.n_actions)
        targets_flat = action_seq.reshape(-1)
        
        return nn.functional.cross_entropy(logits_flat, targets_flat, label_smoothing=label_smoothing)

    def act_teacher(self, obs, frustration_level):
        """
        Chaotic Teacher API.
        """
        B = obs.shape[0]
        obs_flat = obs.reshape(B, -1)
        
        if self.teacher_eye is None:
            self.teacher_eye = nn.Linear(obs_flat.shape[1], self.n_hidden*2, bias=False).to(self.device)
            self.teacher_eye.requires_grad_(False)
        
        with torch.no_grad():
            features = self.teacher_eye(obs_flat)
            self.teacher.frustration = frustration_level
            action = self.teacher.get_action(features, self.n_actions)
        return action

    def compute_thermodynamic_loss(self, chunk_obs, chunk_act, z_init=None, gate_sparsity_lambda=0.01):
        """
        API Compat. In V11 this is JEPA+VICReg+Entropy.
        In V12 we focus on Hamiltonian conservation and state distribution.
        """
        states, _ = self.forward(chunk_obs, z_init)
        
        # 1. JEPA Prediction (State drift)
        # In a perfect world, for t=0, state[1] should be predicted by some dynamic
        # Since we don't have a separate predictor yet (it's a linear dummy), 
        # let's use the actual forward pass drift as proxy.
        jepa_loss, _, vic_loss = self.compute_jepa_loss(chunk_obs, chunk_act, z_init)
        
        return jepa_loss, jepa_loss.item(), vic_loss


    def compute_jepa_loss(self, chunk_obs, chunk_act, z_init=None):
        """
        Adapts JEPA loss (Self-Supervised) to Hamiltonian Energy.
        Instead of predicting Z, we minimize Energy Drift.
        """
        states, _ = self.forward(chunk_obs, z_init) # [B, T, 2H]
        
        # Prediction Error: How well z_{t} predicts z_{t+1} via the predictor
        # This is a bit simplified for now.
        z_t = states[:, :-1]
        z_next = states[:, 1:]
        
        z_pred = self.predictor(z_t)
        jepa_loss = nn.functional.mse_loss(z_pred, z_next)
        
        # VICReg on q,p (Variance Regularization)
        # We want each dimension to have non-zero variance to avoid state collapse
        flat_states = states.reshape(-1, self.n_hidden * 2)
        std = torch.sqrt(flat_states.var(dim=0) + 1e-6)
        var_loss = torch.relu(1.0 - std).mean() # Target std 1.0
        
        total_loss = jepa_loss + 0.1 * var_loss
        
        return total_loss, jepa_loss.item(), var_loss.item() 
        # (Total, JEPA_val, Var_val)

# Alias for simple script access
SkynetV12Hamilton = SkynetV12SymplecticFusion

# ==============================================================================
# STRESS TEST
# ==============================================================================

def run_hamiltonian_stress_test():
    print("🔬 INITIALIZING V12 SYMPLECTIC STRESS TEST...")
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    N_HIDDEN = 128
    SEQ_LEN = 2000
    model = HamiltonianCell(N_HIDDEN, N_HIDDEN, dt=0.5).to(device)
    
    q = torch.randn(1, N_HIDDEN, device=device)
    p = torch.randn(1, N_HIDDEN, device=device)
    energies = []
    
    print(f"   Running {SEQ_LEN} steps of free evolution...")
    with torch.no_grad():
        for t in range(SEQ_LEN):
            dummy_x = torch.zeros(1, N_HIDDEN, device=device) 
            q, p = model(dummy_x, (q, p))
            q_mix = model.W_q(q)
            pot = torch.log(torch.cosh(q_mix)).sum() * model.K.mean()
            kin = 0.5 * (p**2).sum()
            energies.append((pot + kin).item())
            
    energies = np.array(energies)
    drift = energies[-1] - energies[0]
    print(f"   Drift: {drift:.6f}")
    
if __name__ == "__main__":
    run_hamiltonian_stress_test()
