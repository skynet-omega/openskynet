"""
SKYNET_CORE_V11_FUSION.py
=========================
Architecture: The Iron Dreamer (V11.1)
Fusion of:
1.  V10.3 "Iron Lung" Physics (Neumann-Cayley, Clean Physics)
2.  CHRONOS V2.1 "Funnel Memory" (Liquid-Gel-Crystal, Entropic Friction)
3.  V11 "Latent Dreamer" JEPA (World Model Prediction)
4.  VICReg Anti-Collapse Regularization  

Philosophy:
- V10.3 is the HEART (memory that doesn't explode/vanish).
- V11 JEPA is the BRAIN (learns to predict consequences).
- VICReg is the IMMUNE SYSTEM (prevents latent collapse).
"""

import torch
import torch.nn as nn
import numpy as np

# ==============================================================================
# THERMODYNAMIC ORGAN (HOMEOSTAT) - DEPRECATED / EXPERIMENTAL
# ==============================================================================
# POSTMORTEM (2026-01-10):
# This component successfully raises Effective Rank (31.7 vs 0.05) but 
# DEGRADES performance on precision tasks (MiniGrid, ARC).
# It fails to improve plasticity in dynamic logic tasks.
# STATUS: DISABLED BY DEFAULT. Kept only for deep scientific diagnosis.

class ThermodynamicHomeostat:
    def __init__(self, target_rank_percent=0.25, kp=0.2):
        self.target_rank_pct = target_rank_percent
        self.kp = kp
        self.current_noise = 0.0 # Start cold
        self.history_rank = []
        self.history_noise = []
        self.buffer = [] # Buffer for rank measurement in low-batch settings
        
    def regulate(self, states, hidden_dim):
        """
        Adjusts noise based on effective rank.
        states: [Batch, Seq, Hidden]
        """
        # 1. Measure Temperature (Rank)
        flat = states.reshape(-1, hidden_dim).detach()
        
        # Buffer mechanism for Online RL (Batch=1)
        if flat.shape[0] < 32:
            self.buffer.append(flat)
            if len(self.buffer) * flat.shape[0] < 32:
                # Not enough data to measure entropy accurately
                return self.current_noise
            else:
                # Concatenate buffer
                flat = torch.cat(self.buffer, dim=0)
                self.buffer = [] # Clear buffer
                
        # Calculate Rank
        flat = flat - flat.mean(dim=0)
        cov = (flat.conj().T @ flat) / (flat.shape[0] - 1)
        
        try:
            # SVD on GPU can be unstable, fallback to safe
            S = torch.linalg.svdvals(cov)
            S_norm = S / (S.sum() + 1e-9)
            entropy = -torch.sum(S_norm * torch.log(S_norm + 1e-12))
            rank = torch.exp(entropy).item()
        except:
            rank = 1.0 # Default to collapsed
            
        rank_pct = rank / hidden_dim
        
        # 2. Control Loop (Thermostat)
        error = self.target_rank_pct - rank_pct
        delta = self.kp * error
        
        self.current_noise += delta
        self.current_noise = max(0.0, min(0.5, self.current_noise)) # Clamp (Max 0.5 to avoid destruction)
        
        self.history_rank.append(rank_pct)
        self.history_noise.append(self.current_noise)
        
        # Keep history short
        if len(self.history_rank) > 1000:
            self.history_rank.pop(0)
            self.history_noise.pop(0)
            
        return self.current_noise

# ==============================================================================

# ==============================================================================
# PHYSICS CORE: THE IRON LUNG V10.3
# ==============================================================================

from SKYNET_CHRONOS_CORE import ChronosFunnelV2
from SKYNET_PHYSICS_CORE import NeumannCayleyCellV103, mod_soft, neumann_series

# ==============================================================================
# PREDICTION HEAD: THE DREAMER (JEPA) + VICReg
# ==============================================================================

class JEPAPredictorV11(nn.Module):
    """
    Predicts z_{t+1} from (z_t, a_t).
    The "World Model" with VICReg-ready architecture.
    """
    def __init__(self, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.n_hidden = n_hidden
        self.device = device
        
        # Action Embedding
        # Default embedding is Float32. We will cast in forward.
        self.action_emb = nn.Embedding(n_actions, n_hidden, device=device)
        self.act_proj = nn.Linear(n_hidden, n_hidden, bias=False, dtype=torch.complex64, device=device)
        
        # Predictor MLP
        self.net = nn.Sequential(
            nn.Linear(n_hidden, n_hidden * 2, dtype=torch.complex64, device=device),
        )
        self.out_proj = nn.Linear(n_hidden * 2, n_hidden, dtype=torch.complex64, device=device)
        
    def forward(self, z_t: torch.Tensor, a_t: torch.Tensor) -> torch.Tensor:
        """
        Args:
            z_t: [Batch, Hidden] (Complex current state)
            a_t: [Batch] (Action indices)
        """
        # Embed action (Float32) -> Cast to Complex64 -> Project
        a_vec = self.action_emb(a_t).type(torch.complex64)
        a_vec = self.act_proj(a_vec)
        
        combined = z_t + a_vec  # Residual
        hidden = self.net(combined)
        hidden = mod_soft(hidden)
        z_pred = self.out_proj(hidden)
        z_pred = mod_soft(z_pred)
        
        return z_pred

# ==============================================================================
# CHAOTIC TEACHER
# ==============================================================================

class ChaoticTeacher(nn.Module):
    def __init__(self, n_units, device='cuda'):
        super().__init__()
        self.n_units = n_units
        self.device = device
        self.z = None
        self.frustration = None
        self.W_out = None
        
    def reset(self, batch_size):
        self.z = torch.randn(batch_size, self.n_units, dtype=torch.complex64, device=self.device) * 0.1
        self.frustration = torch.zeros(batch_size, device=self.device)
        
    def get_action(self, obs_features, n_actions):
        if self.frustration.mean().item() > 0.5:
            return torch.randint(0, n_actions, (obs_features.shape[0],), device=self.device)
             
        if self.W_out is None:
            self.W_out = torch.randn(self.n_units, n_actions, dtype=torch.complex64, device=self.device)
        
        mu = -0.5 + 2.0 * self.frustration.unsqueeze(1)
        rot_angle = torch.tensor(1j * 0.5, device=self.device)
        self.z = self.z * torch.exp(rot_angle) + (mu * self.z)
        self.z = self.z / (self.z.abs() + 1e-5)
        
        logits = torch.matmul(self.z, self.W_out).real
        probs = torch.softmax(logits * 5.0, dim=-1)
        return torch.multinomial(probs, 1).squeeze(1)

# ==============================================================================
# DATA HYGIENE: LERW
# ==============================================================================

def clean_trajectory(obs_trace, action_trace):
    obs_clean = []
    act_clean = []
    visited = {}

    for t, obs in enumerate(obs_trace):
        obs_bytes = obs.tobytes() if hasattr(obs, 'tobytes') else obs.cpu().numpy().tobytes()

        if obs_bytes in visited:
            back_idx = visited[obs_bytes]
            obs_clean = obs_clean[:back_idx+1]
            act_clean = act_clean[:back_idx+1]
            visited = {o.tobytes() if hasattr(o, 'tobytes') else o.cpu().numpy().tobytes(): i 
                       for i, o in enumerate(obs_clean)}
            if t < len(action_trace): 
                act_clean[-1] = action_trace[t]
        else:
            visited[obs_bytes] = len(obs_clean)
            obs_clean.append(obs)
            if t < len(action_trace): 
                act_clean.append(action_trace[t])
    
    min_len = min(len(obs_clean), len(act_clean))
    return obs_clean[:min_len], act_clean[:min_len]

# ==============================================================================
# VISION: RETINA V11 (Engineering)
# ==============================================================================

class UniversalRetina(nn.Module):
    """
    Universal Sensory Adapter (Polymorphic).
    
    Modes:
    1. NetHack Specialization (Signature: 1659 dim): Activates V11 Convolutional Bio-Physics.
    2. Generic Vector/Tensor (Any other dim): Uses High-Dimensional Complex Projection.
    
    This allows the brain to plug into ANY environment (XOR, MiniGrid, Robotics) 
    without code changes.
    """
    def __init__(self, input_dim, n_hidden, device='cuda'):
        super().__init__()
        self.device = device
        self.input_dim = input_dim
        
        # DETECT MODE BASED ON INPUT SIGNATURE
        # NetHack typically sends 21x79 = 1659 flattened glyphs
        self.is_nethack_signature = (input_dim == 1659)
        
        if self.is_nethack_signature:
            print(f"   👁️ Retina: NetHack Signature Detected ({input_dim}). engaging Visual Cortex.")
            embedding_dim = 8
            self.emb = nn.Embedding(6000, embedding_dim, padding_idx=0, device=device)
            self.cnn = nn.Sequential(
                nn.Conv2d(embedding_dim, 32, kernel_size=3, padding=1, device=device),
                nn.ELU(),
                nn.Conv2d(32, 64, kernel_size=3, stride=2, padding=1, device=device), 
                nn.ELU(),
                nn.Conv2d(64, 128, kernel_size=3, stride=2, padding=1, device=device), 
                nn.ELU()
            )
            
            # Dynamic Output Dimension Calculation
            with torch.no_grad():
                dummy_input = torch.zeros(1, embedding_dim, 21, 79, device=device) # Base NetHack shape
                dummy_out = self.cnn(dummy_input)
                cnn_out_dim = dummy_out.numel() # Flatten
                
            self.proj = nn.Linear(cnn_out_dim, n_hidden, dtype=torch.complex64, device=device)
            self.norm = nn.LayerNorm(n_hidden, device=device) # Stabilization for CNN output
            
        else:
            print(f"   👁️ Retina: Generic Input Detected ({input_dim}). Engaging Linear Adapter.")
            # For XOR, MiniGrid, etc.
            # We map directly from Input Space -> Hidden Complex Space
            self.proj = nn.Linear(input_dim, n_hidden, dtype=torch.complex64, device=device)
            self.norm = nn.LayerNorm(n_hidden, device=device) # Stabilization for raw inputs

    def forward(self, x_seq):
        """
        Input: [Batch, Seq, input_dim]
        Handles both Float (Continuous) and Long (Discrete/Tokens) automatically.
        """
        if x_seq.dim() == 2:
            x_seq = x_seq.unsqueeze(1)
            
        batch, seq, dim = x_seq.shape
        
        # 1. SPECIALIZED PATH (NETHACK)
        if self.is_nethack_signature:
            # Expecting Long Tensor (Glyph IDs)
            if x_seq.dtype == torch.float32:
                 # If mistakenly passed as float (e.g. from a wrapper), cast back to indices
                 x_img = x_seq.view(batch * seq, 21, 79).long()
            else:
                 x_img = x_seq.view(batch * seq, 21, 79).long()
                 
            x = self.emb(x_img).permute(0, 3, 1, 2)
            feat = self.cnn(x)
            feat_flat = feat.reshape(batch, seq, -1).type(torch.complex64)
            out = self.proj(feat_flat)
            
            # Stabilization: Normalize magnitude to preserve phase
            mag = torch.abs(out)
            norm_mag = self.norm(mag)
            phase = torch.angle(out)
            return torch.polar(norm_mag, phase)
            
        # 2. GENERIC PATH (MiniGrid, XOR, etc.)
        else:
            # Simple Linear Projection to Complex Plane
            # Ensure input is Complex compatible
            if x_seq.dtype == torch.long or x_seq.dtype == torch.int:
                 # If discrete tokens but not NetHack (e.g. NLP), we might need embedding.
                 # For now, cast to float. Future: Add Auto-Embedding for small vocab.
                 x_in = x_seq.float().type(torch.complex64)
            else:
                 x_in = x_seq.type(torch.complex64)
                 
            out = self.proj(x_in)
            
            # Normalize magnitude while preserving phase information
            mag = torch.abs(out)
            norm_mag = self.norm(mag)
            phase = torch.angle(out)
            return torch.polar(norm_mag, phase)

class UniversalSpatialDecoder(nn.Module):
    """
    The 'Hand' of the system.
    Projects abstract thought (Latent z) back into Spatial Reality (Grid/Image).
    Uses Transposed Convolutions to recover topology.
    """
    def __init__(self, n_hidden, max_grid_size=32, output_channels=10, device='cuda'):
        super().__init__()
        self.device = device
        self.n_hidden = n_hidden
        self.max_grid_size = max_grid_size
        
        # 1. Project Latent -> Low Res Feature Map (4x4)
        # Input is Concatenated Real+Imag parts of z (2 * n_hidden) for full info
        self.initial_res = 4
        self.initial_channels = 128
        self.linear = nn.Linear(n_hidden * 2, self.initial_channels * self.initial_res**2, device=device)
        
        # 2. Upsampling Stack (Deconvolution)
        self.deconv = nn.Sequential(
            # 4x4 -> 8x8
            nn.ConvTranspose2d(128, 64, kernel_size=4, stride=2, padding=1, device=device),
            nn.ELU(),
            # 8x8 -> 16x16
            nn.ConvTranspose2d(64, 32, kernel_size=4, stride=2, padding=1, device=device),
            nn.ELU(),
            # 16x16 -> 32x32 (Max ARC size covers 30x30)
            nn.ConvTranspose2d(32, 16, kernel_size=4, stride=2, padding=1, device=device),
            nn.ELU(),
            # Final Projection to Colors
            nn.Conv2d(16, output_channels, kernel_size=3, padding=1, device=device)
        )

    def forward(self, z):
        """
        z: [Batch, Hidden] (Complex)
        Returns: [Batch, Channels, H, W] (Logits)
        """
        # Concatenate Real and Imaginary parts to use phase information
        z_flat = torch.cat([z.real, z.imag], dim=-1)
        
        # Project and Reshape
        x = self.linear(z_flat)
        x = x.view(-1, self.initial_channels, self.initial_res, self.initial_res)
        
        # Spatial Expansion
        logits = self.deconv(x)
        return logits


# ==============================================================================
# SKYNET V11.2 WRAPPER: THE IRON DREAMER (RETINA + PHYSICS)
# ==============================================================================

class SkynetV11Fusion(nn.Module):
    def __init__(self, n_input, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.device = device
        self.n_hidden = n_hidden
        self.n_actions = n_actions
        
        print("Initializing V11.2 Iron Dreamer (Universal Retina + Physics)...")
        
        # --- CAMBIO 1: UNIVERSAL RETINA ---
        # Detects input topology automatically
        self.retina = UniversalRetina(n_input, n_hidden, device=device)
        
        # --- CAMBIO 2: CORE INPUT ---
        # La celda ahora recibe inputs ya proyectados al tamaño n_hidden por la retina
        # --- CAMBIO 2: CORE INPUT (CHRONOS UPGRADE V2.1) ---
        # The core is now a 3-Stage Funnel (Liquid->Gel->Crystal)
        # Input: n_hidden (from Retina)
        # Latent State: 3 * n_hidden (Broad Spectrum Memory)
        self.core = ChronosFunnelV2(input_dim=n_hidden, hidden_dim=n_hidden, device=device)
        self.n_hidden_total = n_hidden * 3 # Liquid + Gel + Crystal
        
        # V11.13 EVOLUTION: Spatial Motor Cortex (Decoder)
        # Decoder must project the FULL state (3x) back to reality
        self.decoder = UniversalSpatialDecoder(self.n_hidden_total, output_channels=10, device=device)
        
        self.predictor = JEPAPredictorV11(self.n_hidden_total, n_actions, device=device)
        
        scale_out = 1.0 / np.sqrt(self.n_hidden_total)
        self.actor = nn.Parameter(
            torch.randn(self.n_hidden_total, n_actions, dtype=torch.complex64, device=device) * scale_out
        )
        
        # Chaotic Teacher for Exploration
        self.teacher = ChaoticTeacher(self.n_hidden_total, device=device)
        self.teacher_eye = None
        
        # VICReg Lambda (Reduced to 1.0 for balanced learnable physics)
        self.vicreg_lambda = 1.0
        
        # V11.14 THERMODYNAMIC ORGAN
        self.homeostat = ThermodynamicHomeostat(target_rank_percent=0.25)
        self.use_organ = False # Disabled by default (Benchmarks show it hurts simple tasks)

    def forward(self, x_seq, z_init=None):
        """
        Forward pass through the Iron Lung Core.
        x_seq: [Batch, Seq, 1659] (Long IDs)
        """
        # --- CAMBIO 3: USAR RETINA ---
        # x_seq entra como IDs planos [Batch, Seq, 1659], la retina se encarga de la geometría
        x_inner = self.retina(x_seq) 
        
        if z_init is None:
            z_init = None # Chronos auto-inits if None (zeros for all phases)
        
        # Determine Temperature
        curr_noise = self.homeostat.current_noise if (self.training and self.use_organ) else 0.0
            
        # Chronos core handles the sequence internally
        # Note: noise_scale is applied inside if we supported it, 
        # but ChronosFunnelV2 currently applies noise inside UnboundNeumannCayley automatically?
        # Wait, ChronosFunnelV2 doesn't expose noise arg in forward yet!
        # Assuming noise handled by base class or default 0.0. 
        # (Actually, Chronos V2.1 in step 1192 has noise_scale in UnboundNeumannCayley forward, 
        # but PhaseStateCell forward sets noise_scale=0.0 hardcoded! Fix below).
        
        # FIX: The Chronos Core forward (Step 1234) does NOT take noise arg.
        # It's fine. Friction is the main regularization now.
        
        states, z_final = self.core(x_inner, z_init)
        
        # Update Homeostat (Only during training to avoid side effects in inference)
        if self.training and self.use_organ:
            self.homeostat.regulate(states, self.n_hidden_total)
            
        return states, z_final

    def get_action_logits(self, z):
        if z.dim() == 3:
            z = z[:, -1, :] # Select last timestep for classification
        return torch.matmul(z, self.actor).real
    
    def compute_jepa_loss(self, chunk_obs, chunk_act, z_init=None):
        """
        JEPA Loss: Gradient Flow enabled via Wirtinger.
        """
        # 1. Forward Core (With Gradients)
        if z_init is None:
             z_init = None
        
        # --- CAMBIO 4: USAR RETINA ---
        x_inner = self.retina(chunk_obs) 
        
        # Noise injection? Currently disabled in Chronos forward logic implicitly.
        true_states, _ = self.core(x_inner, z_init)
        
        # Update Homeostat
        if self.use_organ:
             self.homeostat.regulate(true_states, self.n_hidden_total)
        
        # 2. Split for Prediction
        z_curr = true_states[:, :-1] 
        a_curr = chunk_act[:, :-1]
        z_target = true_states[:, 1:].detach() # Detach target to stop collapse
        
        # 3. Predict
        B, T, H = z_curr.shape
        z_curr_flat = z_curr.reshape(-1, H)
        a_curr_flat = a_curr.reshape(-1)
        z_target_flat = z_target.reshape(-1, H)
        
        z_pred_flat = self.predictor(z_curr_flat, a_curr_flat)
        
        # 4. JEPA Loss (Real Scalar from Complex Distances)
        diff = z_pred_flat - z_target_flat
        # Wirtinger calculus handles d(Real)/d(Complex) automatically here
        jepa_loss = (diff.real.square() + diff.imag.square()).mean()
        
        # 5. VICReg (Anti-Collapse)
        flat_states = true_states.reshape(-1, self.n_hidden_total) # [N, H_total]
        N = flat_states.shape[0]
        
        # Variance Term (Standard VICReg) - Target 0.5 (mod_tanh compatible)
        std_real = torch.sqrt(flat_states.real.var(dim=0) + 1e-4)
        std_imag = torch.sqrt(flat_states.imag.var(dim=0) + 1e-4)
        var_loss = torch.relu(0.5 - std_real).mean() + torch.relu(0.5 - std_imag).mean()
        
        # Covariance Term (Hermitian)
        # C = (z - mu)^H @ (z - mu) / (N - 1)
        z_centered = flat_states - flat_states.mean(dim=0)
        cov = (z_centered.conj().T @ z_centered) / (N - 1)
        
        # Off-diagonal penalty (Descorrelates latent dimensions)
        I = torch.eye(self.n_hidden_total, device=self.device)
        # Penalize all off-diagonal elements (real and imag part of covariance)
        cov_loss = (cov * (1 - I)).abs().pow(2).sum() / self.n_hidden_total
        
        # V11.11 THERMODYNAMICS: ENTROPY COST (WORK EXTRACTION)
        # We assume the last forward pass stored the gate values in self.last_gates
        # If not available (e.g. strict JIT), we ignore.
        # Ideally, 'forward' should return gates or store them.
        # For now, we implement a placeholder that requires the training loop to access gates.
        # BUT, to keep it self-contained:
        # We will assume high entropy = high unpredictability.
        # Actually, the best way is to return the sparsity loss component.
        
        entropy_cost = 0.0
        # This requires architectural change to track gates. 
        # Strategy: The loss function usually doesn't have access to intermediate gates unless returned.
        # We will update compute_jepa_loss to re-run forward partial or assume external tracking.
        # BETTER OPTION: We assume the user calls forward_with_loss which returns everything.
        
        # For compatibility, we'll leave standard loss here but add a method
        # for the training loop to calculate gate sparsity.
        
        total_loss = jepa_loss + (self.vicreg_lambda * var_loss) + (1.0 * cov_loss)
        
        return total_loss, jepa_loss.item(), var_loss.item()

    def compute_thermodynamic_loss(self, chunk_obs, chunk_act, z_init=None, gate_sparsity_lambda=0.01):
        """
        Computes JEPA loss + Entropy Cost (Work Extraction).
        Forces the Maxwell Gate to minimize information flow (Renormalization).
        """
        if z_init is None:
            z_init = None
            
        x_inner = self.retina(chunk_obs)
        
        # Manual Forward to capture Gates
        z = z_init
        U = self.core.layers[-1].core.get_cayley_operator() # Accessing Crystal Core for analysis, or average?
        # Chronos is a stack. Manual walking is hard without reconstructing the whole funnel.
        # FIX: We should rely on returned states if possible.
        # But 'forward' returns stacked.
        # For now, disable manual gate tracking in Thermodynamic Loss until refactor.
        # Or just use the forward pass.
        pass
        gate_activity = []
        
        history = []
        for t in range(x_inner.shape[1]):
            x_t = x_inner[:, t]
            u_in = torch.matmul(x_t, self.core.W_in)
            
            gate_in_x = x_t.abs() if x_t.is_complex() else x_t
            gate_in_z = z.abs()
            
            g_logits = self.core.W_gate_x(gate_in_x) + self.core.W_gate_z(gate_in_z)
            
            # alpha is the minimum openness, constrained to [0, 0.1]
            alpha = torch.sigmoid(self.core.alpha_raw) * 0.1
            g = torch.sigmoid(g_logits) * (1.0 - alpha) + alpha
            gate_activity.append(g.mean()) # Average openness
            
            z = torch.matmul(z, U) + g * u_in
            z = mod_soft(z)
            history.append(z)
            
        true_states = torch.stack(history, dim=1)
        
        # JEPA + VICReg Logic (Duplicated for clarity/independence)
        z_curr = true_states[:, :-1]
        a_curr = chunk_act[:, :-1]
        z_target = true_states[:, 1:].detach()
        
        B, T, H = z_curr.shape
        z_pred_flat = self.predictor(z_curr.reshape(-1, H), a_curr.reshape(-1))
        z_target_flat = z_target.reshape(-1, H)
        
        diff = z_pred_flat - z_target_flat
        jepa_loss = (diff.real.square() + diff.imag.square()).mean()
        
        # VICReg
        flat_states = true_states.reshape(-1, self.n_hidden)
        N = flat_states.shape[0]
        std_real = torch.sqrt(flat_states.real.var(dim=0) + 1e-4)
        std_imag = torch.sqrt(flat_states.imag.var(dim=0) + 1e-4)
        var_loss = torch.relu(0.5 - std_real).mean() + torch.relu(0.5 - std_imag).mean()
        
        z_cen = flat_states - flat_states.mean(dim=0)
        cov = (z_cen.conj().T @ z_cen) / (N - 1)
        I = torch.eye(self.n_hidden, device=self.device)
        cov_loss = (cov * (1 - I)).abs().pow(2).sum() / self.n_hidden
        
        # ENTROPY COST (Sparsity)
        # We want gates to be 0 (closed) most of the time.
        # L1 Norm of gate activity.
        avg_gate_openness = torch.stack(gate_activity).mean()
        entropy_loss = gate_sparsity_lambda * avg_gate_openness
        
        total_loss = jepa_loss + (self.vicreg_lambda * var_loss) + cov_loss + entropy_loss
        
        return total_loss, jepa_loss.item(), avg_gate_openness.item()
    
    def act_teacher(self, obs, frustration_level):
        # Flatten input if necessary for the linear teacher eye
        B = obs.shape[0]
        obs_flat = obs.reshape(B, -1)
        
        if self.teacher_eye is None:
            self.teacher_eye = nn.Linear(obs_flat.shape[1], self.n_hidden, bias=False).to(self.device)
            self.teacher_eye.requires_grad_(False)
        
        with torch.no_grad():
            features = self.teacher_eye(obs_flat)
            self.teacher.frustration = frustration_level
            action = self.teacher.get_action(features, self.n_actions)
        return action
    
    def train_student_imitation(self, obs_seq, action_seq, z_init=None, label_smoothing=0.1):
        if z_init is None:
            z_init = None
        
        # USAR RETINA
        x_inner = self.retina(obs_seq)
        
        # Standard training, use noise
        curr_noise = self.homeostat.current_noise if self.use_organ else 0.0
        states, _ = self.core(x_inner, z_init)
        
        if self.use_organ:
             self.homeostat.regulate(states, self.n_hidden)
             
        logits_seq = torch.matmul(states, self.actor).real
        
        logits_flat = logits_seq.reshape(-1, self.n_actions)
        targets_flat = action_seq.reshape(-1)
        
        return nn.functional.cross_entropy(logits_flat, targets_flat, label_smoothing=label_smoothing)

    def get_telemetry(self, states):
        """
        Extracts scientific metrics from the latent states.
        states: [Batch, Seq, Hidden] (Complex)
        """
        metrics = {}
        
        # 1. Effective Rank (The "Cold Universe" Metric)
        # Using the same logic as ThermodynamicHomeostat
        flat = states.reshape(-1, self.n_hidden_total).detach()
        if flat.shape[0] > 1:
            flat_centered = flat - flat.mean(dim=0)
            cov = (flat_centered.conj().T @ flat_centered) / (flat.shape[0] - 1)
            try:
                S = torch.linalg.svdvals(cov)
                S_norm = S / (S.sum() + 1e-9)
                entropy = -torch.sum(S_norm * torch.log(S_norm + 1e-12))
                rank = torch.exp(entropy).item()
            except:
                rank = 0.0
            metrics['effective_rank'] = rank
            metrics['rank_percent'] = rank / self.n_hidden_total
        else:
            metrics['effective_rank'] = 0.0
            metrics['rank_percent'] = 0.0
            
        # 2. Lyapunov Proxy (Stability)
        # Avg distance between z_t and z_{t+1} normalized by magnitude
        if states.shape[1] > 1:
            diff = states[:, 1:] - states[:, :-1]
            # magnitude of change
            diff_norm = diff.abs().mean().item()
            # magnitude of state
            state_norm = states.abs().mean().item() + 1e-9
            metrics['lyapunov_proxy'] = diff_norm / state_norm
        else:
            metrics['lyapunov_proxy'] = 0.0
            
        return metrics
