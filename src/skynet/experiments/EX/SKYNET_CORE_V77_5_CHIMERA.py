"""
SKYNET_CORE_V77_5_CHIMERA.py 
============================
V77.5: "CHIMERA" - The Hybrid Synthesis.

The "Binding Problem" (Blindness) and "Catatonic State" (Score 0) are resolved by
fusing the best organs from 34 generations of SKYNET evolution.

ARCHITECTURE:
1.  **Holographic Retina (V80):** Tokenizes the game state into Discrete Entities (Global, MyHand, Board).
    Solves: "The Blindness". The core now sees "Red 5", not "Feature 0.2".
2.  **Cayley Gyroscope Core (V77):** Unitary Mixing Recurrent Unit.
    Solves: "The Memory". Preserves information eternally via orthogonal rotation.
3.  **JEPA Predictor (V11):** Self-Supervised Motor.
    Solves: "The Motivation". Generates 'Frustration' (Loss) to force the Gate open.
4.  **Energy Head (V76/V85):** Dissipative Readout.
    Solves: "The Decision". Uses Langevin relaxation to find the optimal action,
    collapsing the quantum wave into a firm decision.

Mathematics:
    Token_i = Embed(Entity_i)
    u_t = Transformer(Token_1...N)
    h_rot = Cayley(h_{t-1})
    Frustration = || JEPA(h_{t-1}, u_t) - h_{t+1} ||
    k = Sigmoid(Gate(h, u) + beta * Frustration)
    h_next = cos(k) * h_rot + sin(k) * u_t
    a_t = argmin_a E(h_next, a)

Author: Antigravity (2026-01-22)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import copy  # Para EMA target network

# ==============================================================================
# CONFIGURACIÓN GLOBAL (PARAMETROS BIO-FISICOS DEL NUCLEO)
# ==============================================================================

# 1. Configuración de Retina Holográfica (Ojos)
RETINA_N_COLORS = 6                     # [FIXED] 6 Chess Piece Types (P,N,B,R,Q,K)
RETINA_N_RANKS = 5                      # Rangos de cartas (Legacy/Fixed)
RETINA_FW_RANKS = 6                     # Rangos de fuegos artificiales (0-5)
RETINA_TYPE_EMB_SIZE = 5                # Tipos de entidades (Global, Hand, Opp, FW, Disc)
RETINA_POS_NOISE = 1.0                 # [FIX] Increase noise to ensure spatial distinguishability
RETINA_ATTN_HEADS = 4                   # Cabezales de atención del Nano-Transformer
RETINA_LAYERS = 2                       # [V82 REPAIR] Increase depth to detect piece-board interactions

# 2. Configuración del Núcleo Cayley (Cerebro)
CORE_RES_DIM = 1024                     # [SCIENTIFIC UPGRADE] Expanded Cortex (Was 512)
CORE_INIT_NOISE_THETA = 0.01            # Ruido inicial de parámetros de rotación (Skew-Symmetric)
CORE_GATE_BIAS_INIT = -3.0              # [FIX] Bias negative to start closed (Conservative Memory)
CORE_FRUST_BETA = 2.0                   # Sensibilidad de la compuerta a la frustración (Dolor -> Apertura)

# 3. Metabolismo Prigogine (Dinámica de Fluidos)
META_ALPHA_INIT = 1.2                   # Flujo de energía base (A)
META_BETA_INIT = 3.5                    # Umbral de bifurcación (B)
META_DT_STEP = 0.05                     # Paso de integración temporal para dinámica metabólica

# 4. Configuración JEPA (Corazón/Motor)
JEPA_EMA_MOMENTUM = 0.996               # Momentum del Target Encoder (Estabilidad temporal)

# 5. Cabezal de Energía (Manos/Decisión)
ENERGY_LANGEVIN_STEPS = 6               # Pasos de refinamiento Langevin (Pensamiento rápido)
ENERGY_LANGEVIN_LR = 1.0                # [PHYSICS] Derived from L=5.0 / T=6 / Grad=0.09 (Velocity Matching)
ENERGY_TEMP = 0.01                      # [PHYSICS] Derived for Barrier Hopping > 0.1

# ==============================================================================
# 1. HOLOGRAPHIC RETINA (From V80) - The Eyes
# ==============================================================================
class HolographicRetina(nn.Module):
    """
    Tokenizes the Hanabi state into discrete entities.
    Input: Hanabi Dictionary or Vector
    Output: Latent Vector u_t (dim: n_res)
    """
    def __init__(self, n_input, d_model, device='cuda'):
        super().__init__()
        self.device = device
        self.d_model = d_model
        # Hanabi Constants (Standard Config)
        self.n_colors = RETINA_N_COLORS
        self.n_ranks = RETINA_N_RANKS
        
        # A. Embeddings
        # 1. Card Entities (Color + Rank + Position)
        # [FIX] Critical Retina Repair: Increase size to 7 (0=Pad, 1..6=Pieces). 
        # Pawns were mapping to 0 and getting zeroed out by padding_idx=0.
        # [V82] Amplify pieces by 10x to dominate the positional floor.
        self.emb_color = nn.Embedding(self.n_colors + 1, d_model, padding_idx=0, device=device) 
        self.emb_rank = nn.Embedding(self.n_ranks + 1, d_model, padding_idx=0, device=device) # 0 is void
        
        with torch.no_grad():
             self.emb_color.weight *= 5.0
             self.emb_rank.weight *= 5.0
        
        # [FIXED] Pure Chess Spatial Encoding (No more Hanabi modulo)
        self.pos_chess = nn.Parameter(torch.randn(1, 64, d_model, device=device) * RETINA_POS_NOISE)
        
        # [REGULATION] Learnable Spatial Noise
        # Init at log(1.0) = 0.0
        self.log_pos_noise = nn.Parameter(torch.tensor(0.0, device=device))
        
        # 2. Board Entities (Fireworks)
        self.emb_fw_rank = nn.Embedding(RETINA_FW_RANKS, d_model, device=device) # 0-5
        self.pos_fw_color = nn.Parameter(torch.randn(1, 5, d_model, device=device) * RETINA_POS_NOISE)
        
        # 3. Type Embeddings
        self.type_emb = nn.Embedding(RETINA_TYPE_EMB_SIZE, d_model, device=device)
        # 0: Global, 1: MyHand, 2: OppHand, 3: Firework, 4: Discard
        
        # 3. Type Embeddings
        self.type_emb = nn.Embedding(RETINA_TYPE_EMB_SIZE, d_model, device=device)
        # 0: Global, 1: MyHand, 2: OppHand, 3: Firework, 4: Discard
        
        # 4. Global State (Flags) -> Projected
        # V77: 8 flags from Meta-Plane Row 0
        self.global_proj = nn.Linear(8, d_model, device=device)
        
        # B. Fallback / Adapter for Vector Input
        # Handle tuple shape (13, 8, 8) -> flattened 832? No, vector adapter is for legacy 2048.
        # If n_input is tuple, we assume legacy vector size is product(n_input)? 
        # Actually V77 environment no longer produces 2048 vectors.
        # But for safety, let's determine fan_in.
        if isinstance(n_input, tuple) or isinstance(n_input, list):
            fan_in = 1
            for x in n_input: fan_in *= x
        else:
            fan_in = n_input
            
        self.vector_adapter = nn.Sequential(
            nn.Linear(fan_in, d_model, device=device),
            nn.LayerNorm(d_model, device=device),
            nn.GELU(),
            nn.Linear(d_model, d_model, device=device)
        )
        
        # C. Enhanced Nano-Transformer (The Optic Nerve)
        # 1 level for speed and VRAM efficiency
        encoder_layer = nn.TransformerEncoderLayer(d_model=d_model, nhead=RETINA_ATTN_HEADS, 
                                                   dim_feedforward=d_model*2, 
                                                   dropout=0.0, batch_first=True,
                                                   norm_first=True, device=device)
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=RETINA_LAYERS)
        
        self.norm_out = nn.LayerNorm(d_model, device=device)

    def forward(self, x_in):
        """
        Enhanced forward for Chess-specific tokenization.
        Detects chess tensors [B, 13, 8, 8] and applies structured tokenization.
        """
        # 0. Safety Type Cast
        if isinstance(x_in, torch.Tensor):
            if x_in.dtype == torch.long or x_in.dtype == torch.int:
                 x_in = x_in.float()
        
        # 1. Chess-Specific Structured Tensor [B, 13, 8, 8]
        if x_in.dim() == 4 and x_in.shape[1] == 13:
            return self._tokenize_chess(x_in)
            
        # 2. Legacy/Flat Support (Will Error if not handled, but we expect 4D now)
        # If we get a flattened vector, we CANNOT recover structure perfectly.
        # But for backward compat or other envs:
        # 2. Hanabi-Specific Tokenization (structured dict expected)
        elif isinstance(x_in, dict) and 'cards' in x_in:
            return self._tokenize_hanabi(x_in)
        
        # 3. Default Vector Path (fallback)
        u_vec = self.vector_adapter(x_in)
        return self.norm_out(u_vec)
    
    def _tokenize_chess(self, x_tensor):
        """
        Tokenizes [B, 13, 8, 8] chess tensor into a material-weighted latent vector.
        V82: The "Neuro-Biological" fix to Numbness.
        """
        B, C, H, W = x_tensor.shape
        pieces = x_tensor[:, :12, :, :]
        ids_vec = torch.arange(1, 13, device=self.device, dtype=torch.float).view(1, 12, 1, 1)
        piece_map = (pieces * ids_vec).sum(dim=1) 
        flat_map = piece_map.view(B, 64).long().clamp(0, 12)
        
        # 1. Embeddings
        ch_idx = torch.clamp(flat_map - 1, min=0)
        base_color = self.emb_color( (ch_idx % 6) + 1 )
        base_rank = self.emb_rank( (ch_idx // 6) + 1 )
        base_token = (base_color + base_rank) * (flat_map > 0).unsqueeze(-1).float()
        
        # 2. Material Weighting (The Fovea)
        # 1:P, 2:N, 3:B, 4:R, 5:Q, 6:K (White) | 7:P... (Black)
        weights = torch.tensor([0, 1, 3, 3, 5, 9, 20, 1, 3, 3, 5, 9, 20], device=self.device, dtype=torch.float)
        square_w = weights[flat_map].unsqueeze(-1) # [B, 64, 1]
        
        # 3. Spatial Context & Transformer Mixing (The Optic Nerve)
        # [FIX] Do NOT zero out empty squares! The empty space defines the geometry.
        # We add position embedding to EVERYTHING.
        # [REGULATION] Dynamic Noise
        pos_scale = self.log_pos_noise.exp()
        pos_tokens = (self.pos_chess * pos_scale).expand(B, -1, -1)
        x_input = base_token + pos_tokens
        
        # [FIX] Pass through Nano-Transformer to interact pieces with space
        # This solves the "Blindness" (Bag of Pieces) problem.
        x_mixed = self.transformer(x_input)
        
        # 4. Weighted Centroid (The Sharp Signal)
        # We pool based on Material Importance, but the vectors now contain context.
        # We still mask out the "Empty" vectors from the sum, BUT they have influenced the neighbors.
        fovea_signal = x_mixed * square_w
        centroid = fovea_signal.sum(dim=1) / (square_w.sum(dim=1) + 1e-6)
        
        # 5. Global Metadata (Flags)
        flags = x_tensor[:, 12, 0, :] 
        global_vec = self.global_proj(flags)
        
        # 6. Final Fusion
        u_vec = centroid + global_vec
        # [FIX] Restore LayerNorm to prevent Gate Saturation (u=230 vs h=32)
        return self.norm_out(u_vec)
    
    def _tokenize_hanabi(self, x_dict):
        """
        Original Hanabi tokenization (for compatibility).
        """
        if 'vector' in x_dict:
            return self.norm_out(self.vector_adapter(x_dict['vector']))
        else:
            dummy_vec = torch.randn(x_dict['cards'].shape[0], self.d_model, device=self.device)
            return self.norm_out(dummy_vec)

# ==============================================================================
# 2. CAYLEY GYROSCOPE CORE (From V77) - The Brain
# ==============================================================================
class CayleyOrthogonal(nn.Module):
    def __init__(self, n, device='cuda'):
        super().__init__()
        self.n = n
        self.device = device
        n_params = n * (n - 1) // 2
        self.theta_params = nn.Parameter(torch.randn(n_params, device=device) * CORE_INIT_NOISE_THETA)
        
    def forward(self):
        # [FIX] Force Float32 for Matrix Inversion Stability
        # Inverting 512x512 in FP16 is suicide for gradients.
        with torch.amp.autocast('cuda', enabled=False):
            theta = torch.zeros(self.n, self.n, device=self.device)
            idx = torch.triu_indices(self.n, self.n, offset=1)
            # [FIX] Safety Valve for Exploding Gradients
            if torch.isnan(self.theta_params).any() or torch.isinf(self.theta_params).any():
                # Zero out parameters to recover Identity rotation (Safe Mode)
                self.theta_params.data.zero_()
            
            # Project params to float32 explicitly
            theta[idx[0], idx[1]] = self.theta_params.float()
            theta = theta - theta.T
            
            I = torch.eye(self.n, device=self.device)
            # Solve (I + A) W = (I - A) -> W = (I+A)^-1 (I-A)
            # This is the heavy lifter.
            W = torch.linalg.solve(I + theta, I - theta)
            
        return W

class CayleyGyroscopeCore(nn.Module):
    def __init__(self, n_hidden, device='cuda'):
        super().__init__()
        self.n_res = n_hidden
        self.device = device
        self.cayley = CayleyOrthogonal(n_hidden, device=device)
        
        # [OPTIMIZATION] Cayley Cache
        self._cached_W = None
        
        # Input Gate ("The Revolving Door")
        self.input_gate = nn.Sequential(
            nn.Linear(n_hidden * 2, n_hidden // 2, device=device),
            nn.Tanh(),
            nn.Linear(n_hidden // 2, 1, device=device)
        )
        # Bias negative to start closed (Conservative)
        if hasattr(self.input_gate[-1], 'bias'):
            nn.init.constant_(self.input_gate[-1].bias, CORE_GATE_BIAS_INIT)
            
        # --- AUTO-REGULATION (Smart Homeostasis) ---
        # Instead of Magic Number 2.0, we let the system learn its pain sensitivity.
        # We work in Log-Space to ensure Beta > 0.
        # Init at ln(2.0) approx 0.693
        self.log_beta = nn.Parameter(torch.tensor(0.69314, device=device))

        # --- PRIGOGINE METABOLISM (Brusselator Dynamics) ---
        # Parameters for auto-catalytic emergence
        # alpha: Energy flow (A), beta: Bifurcation threshold (B)
        self.meta_alpha = nn.Parameter(torch.ones(n_hidden, device=device) * META_ALPHA_INIT)
        self.meta_beta = nn.Parameter(torch.ones(n_hidden, device=device) * META_BETA_INIT)
        # Metabolic Resource (Inhibitor)
        self.register_buffer('meta_y', torch.zeros(1, n_hidden, device=device))
        
        # Telemetry storage
        self.last_ortho_err = 0.0
    def reset_metabolism(self, batch_size):
        """Detaches and resets metabolic state to break BPTT graph between episodes."""
        self.meta_y = torch.ones(batch_size, self.n_res, device=self.device) * self.meta_beta / (self.meta_alpha + 1e-6)

    def forward(self, h_prev, u_t, frustration=None, W=None):
        """
        h_prev: [B, D] Normalized state
        u_t:    [B, D] Percept
        frustration: [B, 1] Scalar signal from JEPA
        W:      [D, D] Optional pre-computed Cayley Matrix
        """
        # Default telemetry
        self.last_metabolic_flux = 0.0

        # 1. Rotation (Memory)
        if W is None:
            # [OPTIMIZATION] Use Cache if no-grad (Rollout)
            if not torch.is_grad_enabled() and self._cached_W is not None:
                W = self._cached_W
            else:
                W = self.cayley()
                if not torch.is_grad_enabled():
                    self._cached_W = W.detach()
        
        # Telemetry: Measure orthogonality error |W^T W - I|
        if self.training or True: # Always monitor for science
            I = torch.eye(self.n_res, device=self.device)
            ortho_err = torch.norm(torch.mm(W.T, W) - I)
            self.last_ortho_err = ortho_err.detach() # [OPTIMIZATION] Keep as tensor
            
        h_rot = torch.mm(h_prev, W)
        
        # 2. Gating
        gate_in = torch.cat([h_rot, u_t], dim=-1)
        gate_logit = self.input_gate(gate_in)
        
        # 3. Frustration Coupling (The V11 Injection)
        if frustration is not None:
            # Beta determines how much pain opens the mind.
            # [REGULATION] Learnable Beta
            beta = self.log_beta.exp()
            gate_logit = gate_logit + beta * frustration
            
        k = torch.sigmoid(gate_logit) # [0, 1] Variable mixing
        
        # 4. Unitary Mixing
        # cos^2 + sin^2 = 1. Energy is preserved.
        cos_theta = torch.sqrt(1.0 - k**2 + 1e-8)
        sin_theta = k
        
        h_next = (cos_theta * h_rot) + (sin_theta * u_t)
        
        # 5. METABOLIC PHASE (Autocatalysis / Prigogine)
        # If enabled (represented by non-zero frustration), apply Brusselator kinetics
        if frustration is not None:
            # We use frustration flux as the catalyst for the non-linear term
            # dX = A - (B+1)X + X^2 * Y * stimulus
            # For stability, we apply it as a small perturbation to stay on the manifold
            dt = META_DT_STEP
            # [FIX] Use abs(X) because embeddings can be negative, but chemical concentrations cannot.
            X = h_next
            X_abs = torch.abs(X) 
            
            # Use buffer Y (metabolic resource)
            if self.meta_y.shape[0] != X.shape[0]: # Reshape buffer if batch size changed
                self.meta_y = torch.ones_like(X) * self.meta_beta / (self.meta_alpha + 1e-6)
            
            # [FIX] Gradient Safety: Clone to prevent In-Place errors in backward pass
            Y = self.meta_y.clone()
            X = h_next.clone()
            
            # [FIX] Ensure X, Y are safe for graph
            
            # [V82 SCALING] Normalize Frustration for Metabolic Dynamics
            # Frustration is distance on Norm-32 sphere (approx 45.0).
            # Parameters alpha/beta expect Unit Sphere inputs (~1.4).
            # We scale down by sqrt(D) = 32.0 to bring it back to range.
            f_norm = frustration / (self.n_res ** 0.5)
            
            A = self.meta_alpha * (1.0 + f_norm) # Stimulus amplified by pain
            B = self.meta_beta
            
            # Brusselator Equations
            # dX = A - (B+1)X + X^2 Y
            
            # Use out-of-place operations
            dX = A - (B + 1) * X + (X.pow(2) * Y) 
            
            # dY = B * X - X^2 Y
            dY = B * X - (X.pow(2) * Y)
            
            # [FIX] STABILITY CLAMP & SCALING
            # Widen bounds to +/- 100.0 (Natural scale for Norm-32 is ~30-40)
            # This prevents "Rail-Riding" (Stuck Flux).
            dX = torch.clamp(dX, min=-100.0, max=100.0)
            dY = torch.clamp(dY, min=-100.0, max=100.0)
            
            # SCALE THE UPDATE to match Unit Hyper-Sphere Dynamics
            # 512-dim unit vector has avg component ~0.04.
            # dX is ~O(1). 
            # We need dX * dt to be gentle.
            # 0.05 * 0.01 = 0.0005 per step.
            
            META_SCALE = 0.01
            
            # Telemetry: Flux Magnitude (Scaled / Applied)
            self.last_metabolic_flux = (dX * META_SCALE).norm().detach() # [OPTIMIZATION] Keep as tensor
            
            # [FIX] PRIGOGINE STABILIZATION (Manifold Projection)
            # Instead of adding vector blindly (which leaves the manifold), we project it back.
            # This ensures that h_next stays on the Stiefel manifold (Unit Norm * sqrt(D))
            # dX drives the flow, but the Geometry constraints the path.
            h_next = F.normalize(h_next + dX * dt * META_SCALE, p=2, dim=-1) * (self.n_res ** 0.5)
            
            self.meta_y = Y + dY * dt * META_SCALE
            
            # [FIX] Resource Clamping & Gradient Detachment
            # Physics should be fixed, not learned.
            self.meta_y = torch.clamp(self.meta_y, min=-10.0, max=10.0).detach() 
        
        # Renormalize to correct any numerical drift (Stiefel Manifold constraint)
        # [FIX] Maintain Norm = sqrt(D) (approx 32.0 for D=1024)
        h_next = F.normalize(h_next, p=2, dim=-1) * (self.n_res ** 0.5)
        
        return h_next, {'k': k, 'cos': cos_theta}
    
    def extrapolate(self, h, steps=50):
        """
        [V80 STRATEGIST]
        Projects the state into the future using Pure Rotation (Holographic Carrier).
        Ignores Sensory Input (Autoregressive Vacuum).
        """
        if self._cached_W is None:
            W = self.cayley()
        else:
            W = self._cached_W
            
        z = h
        for _ in range(steps):
             z = torch.mm(z, W)
             
        # Renormalize just in case
        return F.normalize(z, p=2, dim=-1) * (self.n_res ** 0.5)

# ==============================================================================
# 3. JEPA PREDICTOR WITH EMA (REAL IMPLEMENTATION) - The Heart
# ==============================================================================
class JEPAPredictor(nn.Module):
    """
    Joint Embedding Predictive Architecture with EMA Target Network.
    
    Key differences from previous "cosmetic" version:
    1. EMA target encoder (momentum=0.996) - provides stable prediction targets
    2. Stop-gradient on targets - prevents representation collapse
    3. Predictor learns to match online → target, not h → h
    
    This is the architecture from Assran et al. (2023) "Self-Supervised Learning from Images
    with a Joint-Embedding Predictive Architecture" (I-JEPA).
    """
    def __init__(self, n_hidden, device='cuda', momentum=JEPA_EMA_MOMENTUM):
        super().__init__()
        self.device = device
        self.momentum = momentum
        self.n_hidden = n_hidden
        
        # Online encoder (learns via gradients)
        self.online = nn.Sequential(
            nn.Linear(n_hidden, n_hidden * 2, device=device),
            nn.LayerNorm(n_hidden * 2, device=device),
            nn.GELU(),
            nn.Linear(n_hidden * 2, n_hidden, device=device)
        )
        
        # Target encoder (EMA of online, no gradients)
        self.target = copy.deepcopy(self.online)
        for p in self.target.parameters():
            p.requires_grad = False
        
        # Predictor: predicts target representation from online
        self.predictor = nn.Sequential(
            nn.Linear(n_hidden, n_hidden, device=device),
            nn.GELU(),
            nn.Linear(n_hidden, n_hidden, device=device)
        )
        
    @torch.no_grad()
    def update_target(self):
        """EMA update of target encoder."""
        for p_online, p_target in zip(self.online.parameters(), self.target.parameters()):
            p_target.data = self.momentum * p_target.data + (1.0 - self.momentum) * p_online.data
    
    def forward(self, h_curr, h_next_true=None):
        """
        Forward pass for JEPA prediction.
        
        Args:
            h_curr: Current state [B, D]
            h_next_true: Optional true next state for computing loss [B, D]
            
        Returns:
            h_pred: Predicted next state
            jepa_loss: If h_next_true provided, returns prediction loss
        """
        # Online encoding of current state
        z_online = self.online(h_curr)
        
        # Predict target from online
        z_pred = self.predictor(z_online)
        
        if h_next_true is not None:
            # Target encoding (no gradients via stop-gradient)
            with torch.no_grad():
                z_target = self.target(h_next_true)
            
            # JEPA loss: MSE between prediction and target
            jepa_loss = F.mse_loss(z_pred, z_target)
            return z_pred, jepa_loss
        
        return z_pred, None

# ==============================================================================
# COMPONENT: HOLOGRAPHIC CRYSTAL (The "Eureka" Memory)
# ==============================================================================
class HolographicCrystal(nn.Module):
    """
    Associative Memory based on High-Dimensional Resonance.
    V83 Upgrade for V77.5 Chimera.
    
    Mechanism:
    1. Keys: State Vectors (h_state)
    2. Values: Action Vectors (a_vector) or Logits
    3. Resonance: Similarity(Query, Keys)
    
    Storage Capacity: N_SLOTS = 2000 (Short-term Episodic Buffer)
    """
    def __init__(self, key_dim, action_dim, capacity=2000, device='cuda'):
        super().__init__()
        self.key_dim = key_dim
        self.action_dim = action_dim
        self.capacity = capacity
        self.device = device
        
        # Memory Banks (Persistent buffers, not parameters - Fixed Physics)
        self.register_buffer('keys', torch.zeros(capacity, key_dim, device=device))
        self.register_buffer('values', torch.zeros(capacity, action_dim, device=device))
        self.register_buffer('energies', torch.zeros(capacity, 1, device=device)) # Energy/Importance
        self.register_buffer('usage', torch.zeros(capacity, 1, device=device)) # LRU tracking
        self.register_buffer('count', torch.tensor(0, device=device))
        
        # Resonance Temperature (Sharpness of recall)
        self.T_resonance = 0.05 
        
    def write(self, h_state, action_logits, energy_score):
        """
        Instant Crystallization of an Event.
        h_state: [B, D]
        action_logits: [B, A]
        energy_score: [B, 1] (Magnitude of the event, e.g., Reward or Flux)
        """
        B = h_state.shape[0]
        
        for i in range(B):
            idx = self.count % self.capacity
            
            # Normalize key for cosine resonance
            k = F.normalize(h_state[i], p=2, dim=0)
            
            self.keys[idx] = k
            self.values[idx] = action_logits[i].detach() # Freeze the thought
            self.energies[idx] = energy_score[i].detach()
            self.usage[idx] = 0
            
            self.count += 1
            
    def read(self, h_query):
        """
        Resonance Query.
        Returns: 
            - advice_logits: [B, A]
            - resonance_strength: [B, 1] (Confidence of recall)
        """
        if self.count == 0:
            return None, torch.zeros(h_query.shape[0], 1, device=self.device)
            
        B = h_query.shape[0]
        
        # Normalize query
        # [B, D]
        q = F.normalize(h_query, p=2, dim=1)
        
        # Compute Resonance (Cosine Similarity)
        # [B, D] @ [D, N] -> [B, N]
        # We only use populated slots
        n_used = min(self.count.item(), self.capacity)
        active_keys = self.keys[:n_used]
        active_vals = self.values[:n_used]
        
        resonance = torch.mm(q, active_keys.T) # [B, N]
        
        # Filter for Significance (Eureka Threshold)
        # [V83.2 Calibration] Lowered to 0.75 based on noise limit (Random < 0.10)
        mask = (resonance > 0.75).float()
        
        if mask.sum() == 0:
             return None, torch.zeros(B, 1, device=self.device)
             
        # Sharp Attention
        weights = F.softmax(resonance / self.T_resonance, dim=1) # [B, N]
        
        # Retrieve Memory
        # [B, N] @ [N, A] -> [B, A]
        # [Fix] Weighted sum of values based on resonance
        memory_logits = torch.mm(weights, active_vals)
        
        # [V83.1] Trauma Aversion
        # If the memory is associated with Negative Energy (Loss), we invert the signal.
        # We compute the weighted energy of the recalled memories.
        active_energies = self.energies[:n_used] # [N, 1]
        recalled_energy = torch.mm(weights, active_energies) # [B, 1]
        
        # If Energy is Negative, INVERT the logits to discourage this action.
        # We multiply by sign(Energy). 
        # Positive Energy -> Promote Action
        # Negative Energy -> Suppress Action
        energy_sign = torch.sign(recalled_energy)
        memory_logits = memory_logits * energy_sign
        
        # Effective Resonance per batch item
        # [B]
        # We take the max resonance as the "Confidence" of the memory
        max_resonance, _ = resonance.max(dim=1, keepdim=True)
        
        return memory_logits, max_resonance

# ==============================================================================
# 4. ENERGY HEAD WITH LANGEVIN DYNAMICS (ACTIVE) - The Hands
# ==============================================================================
class EnergyHead(nn.Module):
    """
    Energy-Based Readout with Langevin Dynamics.
    
    ACTIVE implementation (not the previous dead code).
    Uses gradient descent in action space to find minimum energy actions.
    Based on V67 EnergyHead that achieved 72.5% NBack.
    
    Key features:
    1. Energy network E(h, a) → scalar
    2. Langevin sampling: a_{t+1} = a_t - lr*∇E + noise
    3. Temperature-controlled exploration
    """
    def __init__(self, n_hidden, n_actions, n_steps=ENERGY_LANGEVIN_STEPS, lr=ENERGY_LANGEVIN_LR, temp=ENERGY_TEMP, device='cuda'):
        super().__init__()
        self.n_actions = n_actions
        self.n_steps = n_steps
        self.lr = lr
        self.temp = temp
        self.device = device
        
        # Energy function E(h, a) → scalar
        self.energy_net = nn.Sequential(
            nn.Linear(n_hidden + n_actions, n_hidden // 2, device=device),
            nn.SiLU(),
            nn.Linear(n_hidden // 2, 1, device=device),
            nn.Softplus() # Enforce E(x) >= 0 (Physical Constraint)
        )
        
        # Intuition head for fast initialization
        self.intuition = nn.Linear(n_hidden, n_actions, device=device)
        
        # Cache last action for warm-start
        self.last_action = None
    

    def forward(self, h, advice=None, training=True):
        """
        Energy-based action selection with Langevin dynamics & STE.
        [V80] Supports 'advice' injection to bias the starting point (System 1/2 Integration).
        """
        if h.dim() == 3:
            h = h.squeeze(1)
        B = h.shape[0]
        
        # 1. Intuition Head (The Gradient Anchor)
        # This keeps the graph connected to h without the Langevin baggage.
        a_intuition = self.intuition(h)
        
        # [V80] Apply Expert Advice (If System 2 was active)
        # advice should be same shape as logits [B, A]
        if advice is not None:
             # We mix Instinct (a_intuition) with Advice (Tactics/Strategy)
             # Logic: The Langevin search starts from (Instinct + Advice).
             # This means the "Attractor Basin" we fall into is selected by the Council.
             a_intuition = a_intuition + advice
        
        # 2. Langevin Refinement (Isolated from weight gradients)
        # We find the 'best' action in a detached space to save VRAM.
        a = a_intuition.detach().clone().requires_grad_(True)
        
        # Calculate initial energy for telemetry
        with torch.no_grad():
             ha_start = torch.cat([h.detach(), a], dim=-1)
             e_start = self.energy_net(ha_start).mean()
        
        # Small steps for survival
        n_steps = self.n_steps if training else (self.n_steps * 2)
        
        # Optimization loop for 'a' only
        for _ in range(n_steps):
             with torch.enable_grad():
                 ha = torch.cat([h.detach(), a], dim=-1)
                 e = self.energy_net(ha)
                 grad_a = torch.autograd.grad(e.sum(), a)[0]
             
             # Update a (Langevin)
             noise = torch.randn_like(a) * np.sqrt(2 * self.temp * self.lr)
             a.data = a.data - self.lr * grad_a.data + noise
        
        # Calculate final energy
        with torch.no_grad():
             ha_end = torch.cat([h.detach(), a], dim=-1)
             e_end = self.energy_net(ha_end).mean()
        
        # 3. Straight-Through Estimator (STE)
        # Value comes from refined 'a', gradient comes from 'a_intuition'
        # This allows the Core to learn while the VRAM stays flat.
        a_final = a_intuition + (a.detach() - a_intuition.detach())
        
        # [ZOMBIE KILLER]
        # We must return the Energy Value of the FINAL action so that we can minimize it!
        # This connects 'energy_net' to the main loss function.
        # We re-compute E(h, a_final) with gradients enabled through energy_net.
        # [FIX] Do NOT detach inputs! We need gradients to flow back to Intuition (a_final) and Core (h).
        ha_final_grad = torch.cat([h, a_final], dim=-1) 
        e_val_for_loss = self.energy_net(ha_final_grad)
        
        # Cache for warm-start
        self.last_action = a_final.detach()
        
        aux = {
            'e_start': e_start.detach(), # [OPTIMIZATION] Tensor
            'e_end': e_end.detach(), # [OPTIMIZATION] Tensor
            'val': e_val_for_loss # [B, 1]
        }
        
        return a_final, aux

# ==============================================================================
# MAIN CHIMERA
# ==============================================================================
class SkynetV77_5_Chimera(nn.Module):
    def __init__(self, n_input, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.device = device
        self.n_input = n_input  # FIX: Store for adapter reference
        self.n_hidden = n_hidden
        self.n_actions = n_actions
        self.n_res = CORE_RES_DIM # Chimera-Gold balanced resolution
        
        print(f"🦁 ASSEMBLING SKYNET V77.5 'CHIMERA'...")
        print(f"   >> Eyes: V80 Holographic Retina")
        print(f"   >> Brain: V77 Cayley Gyroscope")
        print(f"   >> Heart: V11 JEPA Predictor")
        
        # 1. Retina
        self.retina = HolographicRetina(n_input, self.n_res, device=device)
        
        # 2. Core
        self.core = CayleyGyroscopeCore(self.n_res, device=device)
        
        # 3. Motor (JEPA)
        self.jepa = JEPAPredictor(self.n_res, device=device)
        
        # 4. Energy Head with ACTIVE Langevin Dynamics
        self.energy_head = EnergyHead(self.n_res, n_actions, device=device)
        self.head = nn.Linear(self.n_res, n_actions, device=device)  # Backup
        self.value_head = nn.Linear(self.n_res, 1, device=device)
        
        # 5. [V83 EUREKA] Holographic Crystal Memory
        print(f"   >> Memory: V83 Holographic Crystal (One-Shot)")
        self.crystal = HolographicCrystal(self.n_res, n_actions, capacity=2000, device=device)
        
        self.to(device)

    def init_state(self, B):
        # Normalized start on hypersphere
        h = torch.randn(B, self.n_res, device=self.device)
        # [FIX] Scale to sqrt(D) so component std ~ 1.0 (Compatible with VICReg/LayerNorm)
        return F.normalize(h, p=2, dim=-1) * (self.n_res ** 0.5)

    def forward(self, x_seq, h_state=None):
        # 1. Dimensionality Normalization (Generalist Adapter)
        # 1. Dimensionality Normalization (Generalist Adapter)
        if x_seq.dim() == 2: 
            x_seq = x_seq.unsqueeze(1)
        elif x_seq.dim() > 3:
            # V77: Check if Holographic [B, C, H, W] or [B, T, C, H, W] where C=13
            is_holographic = (x_seq.dim() == 4 and x_seq.shape[1] == 13) or (x_seq.dim() == 5 and x_seq.shape[2] == 13)
            
            if not is_holographic:
                # Legacy behavior: Flatten spatial/tensor dimensions
                B = x_seq.shape[0]
                if x_seq.dim() == 4:
                     # Assume [B, C, H, W] -> [B, 1, D]
                     x_seq = x_seq.reshape(B, 1, -1)
                else:
                     # Assume [B, T, C, H, W] -> [B, T, D]
                     T = x_seq.shape[1]
                     x_seq = x_seq.reshape(B, T, -1)
            elif x_seq.dim() == 4:
                # [B, 13, 8, 8] -> [B, 1, 13, 8, 8]
                x_seq = x_seq.unsqueeze(1)
        
        # B, T, D = x_seq.shape # FAIL on 5D
        B = x_seq.shape[0]
        T = x_seq.shape[1]
        
        if h_state is None: 
            h_state = self.init_state(B)
            # FORCE RESET of Metabolic State to avoid Graph Leakage
            self.core.reset_metabolism(B)
        elif isinstance(h_state, dict):
            h_state = h_state['h']
            
        history_logits = []
        history_value = []
        
        telemetry = {'frustration': [], 'gate_k': []}
        
        # Flatten for Retina if needed (though we handle per-step)
        # We process step-by-step to allow Recurrent JEPA interaction
        
        # [OPTIMIZATION] Pre-compute Cayley Matrix ONCE per forward pass
        # Use cache if gradients are disabled
        if not torch.is_grad_enabled() and self.core._cached_W is not None:
             W = self.core._cached_W
        else:
             W = self.core.cayley()
             if not torch.is_grad_enabled():
                 self.core._cached_W = W.detach()
        
        for t in range(T):
            # A. See (Holographic Perception)
            x_t = x_seq[:, t] 
            u_t = self.retina(x_t)
            
            # B. JEPA Prediction (Pre-update prediction of h_next)
            h_pred, _ = self.jepa(h_state, None)
            
            # C. Thermodynamic Inconsistency (Frustration)
            # [REVERT V77] Cosine Similarity for bounded Frustration [0, 1]
            # Euclidean distance was saturating the gate (45.0 * 2.0 -> Sigmoid(90) = 1.0)
            h_rot = torch.mm(h_state, W)
            alignment = F.cosine_similarity(h_rot, u_t, dim=-1).unsqueeze(1)
            frustration = torch.tanh(1.0 - alignment)
            
            sys2_active = False
            advice_logits = None
            
            # [CRITICAL] In training, we sometimes force System 2 to ensure it learns.
            force_sys2 = (self.training and np.random.rand() < 0.2)
            
            # [V80 ADAPTIVE SURPRISE DETECTION]
            # No magic numbers. Surprise is a statistical outlier in the current batch.
            f_mean = frustration.mean()
            f_std = frustration.std()
            # Trigger System 2 if a sample is > 2 sigma above the current crowd (The "Panic" Trigger)
            # OR if it's a forced exploration step.
            surprise_mask = (frustration > (f_mean + 2.0 * f_std))
            
            if surprise_mask.any() or force_sys2:
                 # [V81] Calculate Surprise Density (How much of the batch is panicking?)
                 sys2_density = surprise_mask.float().mean()
                 
                 # Initialize advice as zero
                 advice_logits = torch.zeros(B, self.n_actions, device=self.device)
                 
                 # 2. Tactician (JEPA): Short-term Lookahead
                 logits_tact = self.head(h_pred)
                 conf_tact = 1.0 - (-torch.sum(F.softmax(logits_tact, dim=-1) * F.log_softmax(logits_tact, dim=-1), dim=-1)) / np.log(self.n_actions)
                 
                 # 3. Strategist (Holo): Long-term Extrapolation
                 h_trend = self.core.extrapolate(h_state, steps=50)
                 logits_strat = self.head(h_trend)
                 conf_strat = 1.0 - (-torch.sum(F.softmax(logits_strat, dim=-1) * F.log_softmax(logits_strat, dim=-1), dim=-1)) / np.log(self.n_actions)
                 
                 # 4. Council Fusion (Weighted by Confidence)
                 fused = (logits_tact * conf_tact.unsqueeze(1) + logits_strat * conf_strat.unsqueeze(1)) / (conf_tact + conf_strat + 1e-6).unsqueeze(1)
                 
                 # Apply only to surprise indices
                 # advice_logits[idx_sys2] = fused[idx_sys2] # [FIX] Simplified for efficiency
                 advice_logits = fused # Apply to all to avoid complex indexing, the Gate will handle it.

                 
            # 5. Execution (Energy Head)
            # [V81] Sharpness Scaling: Amplify small learning signals to overcome the 1/4672 entropy floor.
            logits_instinct = self.energy_head.intuition(h_state)
            probs_inst = F.softmax(logits_instinct / 0.1, dim=-1) # T=0.1 for high resolution
            entropy_inst = -torch.sum(probs_inst * torch.log(probs_inst + 1e-9), dim=-1)
            conf_inst = torch.clamp(1.0 - (entropy_inst / np.log(self.n_actions)), 0.0, 1.0)
            
            # Injection Gate: (1 - conf_inst)^4 
            # We use power 4 to be MORE aggressive in ignoring advice from a slightly confident instinct.
            gate_val = (1.0 - conf_inst).pow(4).unsqueeze(1)
            
            if advice_logits is not None:
                final_advice = advice_logits * gate_val
            else:
                final_advice = None
                
            # D. Think (Transition to h_next)
            h_next, core_aux = self.core(h_state, u_t, frustration, W=W)
            
            # E. JEPA Temporal Loss
            # Did my prediction h_pred match the actual result h_next?
            _, step_jepa_loss = self.jepa(h_state, h_next)
            
            h_state = h_next
            
            # F. Act (Energy-Based Decision)
            # Active Langevin Dynamics to find optimal action
            logits, energy_aux = self.energy_head(h_state.unsqueeze(1), advice=final_advice, training=self.training)
            if logits.dim() == 3: logits = logits.squeeze(1)
            
            # [V83 EUREKA] The Phase Transition (Crystal Override)
            # If the current state resonates with a crystallized memory, we override the instinct.
            if self.crystal.count > 0:
                mem_logits, mem_res = self.crystal.read(h_state)
                if mem_logits is not None:
                    # Gating: If Resonance > 0.75, Crystal takes over.
                    # Sigmoid centered at 0.75 similarity
                    gate_eureka = torch.sigmoid((mem_res - 0.75) * 20.0) # [B, 1]
                    
                    # Fusion: Fluid (Instinct) vs solid (Crystal)
                    logits = (1.0 - gate_eureka) * logits + gate_eureka * mem_logits
                    
                    # Telemetry
                    if 'eureka_gate' not in telemetry: telemetry['eureka_gate'] = []
                    telemetry['eureka_gate'].append(gate_eureka.mean())
                    if 'eureka_res' not in telemetry: telemetry['eureka_res'] = []
                    telemetry['eureka_res'].append(mem_res.mean())
            
            val = self.value_head(h_state)
            
            history_logits.append(logits)
            history_value.append(val)
            
            # Telemetry
            telemetry['frustration'].append(frustration.mean()) # [OPTIMIZATION] Keep tensor
            telemetry['gate_k'].append(core_aux['k'].mean()) # [OPTIMIZATION] Keep tensor
            
            # [V81 TELEMETRY] Council Brain Imaging
            if 'sys2_density' not in telemetry: telemetry['sys2_density'] = []
            if 'gate_val' not in telemetry: telemetry['gate_val'] = []
            if 'conf_inst' not in telemetry: telemetry['conf_inst'] = []
            
            telemetry['sys2_density'].append(sys2_density if 'sys2_density' in locals() else torch.tensor(0.0, device=self.device))
            telemetry['gate_val'].append(gate_val.mean() if gate_val is not None else torch.tensor(0.0, device=self.device))
            telemetry['conf_inst'].append(conf_inst.mean())
            
            # Science Telemetry: Entropy (Confusion Level)
            probs = F.softmax(logits, dim=-1)
            entropy = -torch.sum(probs * torch.log(probs + 1e-9), dim=-1).mean()
            if 'entropy' not in telemetry: telemetry['entropy'] = []
            telemetry['entropy'].append(entropy)

            # Science Telemetry: Retina Activity (Visual Stimulus)
            retina_norm = u_t.norm(dim=-1).mean()
            retina_std = u_t.std(dim=-1).mean()
            if 'retina' not in telemetry: telemetry['retina'] = []
            telemetry['retina'].append(retina_norm)
            
            if 'retina_std' not in telemetry: telemetry['retina_std'] = []
            telemetry['retina_std'].append(retina_std)

            # Science Telemetry: Cayley Error
            if 'ortho_err' not in telemetry: telemetry['ortho_err'] = []
            telemetry['ortho_err'].append(self.core.last_ortho_err)
            
            if 'meta_flux' not in telemetry: telemetry['meta_flux'] = []
            telemetry['meta_flux'].append(self.core.last_metabolic_flux)
            
            if 'energy_gain' not in telemetry: telemetry['energy_gain'] = []
            telemetry['energy_gain'].append(energy_aux['e_start'] - energy_aux['e_end'])
            
            if 'energy_val' not in telemetry: telemetry['energy_val'] = []
            telemetry['energy_val'].append(energy_aux['val']) # Tensor for loss
            
            if step_jepa_loss is not None:
                if 'jepa_loss_tensor' not in telemetry: telemetry['jepa_loss_tensor'] = []
                telemetry['jepa_loss_tensor'].append(step_jepa_loss) # KEEP TENSOR FOR UPDATE
                if 'jepa_loss_log' not in telemetry: telemetry['jepa_loss_log'] = []
                telemetry['jepa_loss_log'].append(step_jepa_loss.detach()) # [OPTIMIZATION] Keep tensor
        
        # Aggregate return - [OPTIMIZATION] Return Tensors, do NOT item() here!
        frust_mean = torch.stack(telemetry['frustration']).mean()
        gate_mean = torch.stack(telemetry['gate_k']).mean()
        jepa_log_mean = torch.stack(telemetry['jepa_loss_log']).mean() if 'jepa_loss_log' in telemetry else torch.tensor(0.0, device=self.device)
        
        # Science Aggregates
        ortho_err_mean = torch.stack(telemetry['ortho_err']).mean() if 'ortho_err' in telemetry else torch.tensor(0.0, device=self.device)
        meta_flux_mean = torch.stack(telemetry['meta_flux']).mean() if 'meta_flux' in telemetry else torch.tensor(0.0, device=self.device)
        energy_gain_mean = torch.stack(telemetry['energy_gain']).mean() if 'energy_gain' in telemetry else torch.tensor(0.0, device=self.device)
        entropy_mean = torch.stack(telemetry['entropy']).mean() if 'entropy' in telemetry else torch.tensor(0.0, device=self.device)
        retina_mean = torch.stack(telemetry['retina']).mean() if 'retina' in telemetry else torch.tensor(0.0, device=self.device)

        # Final jepa_loss tensor for backprop (unbroken graph)
        jepa_loss_final = torch.stack(telemetry['jepa_loss_tensor']).mean() if 'jepa_loss_tensor' in telemetry else torch.tensor(0.0, device=self.device)
        
        # Final energy_loss tensor (Minimize Energy of Chosen Actions)
        # We want to minimize E(a), so we add this to the total loss
        energy_loss_final = torch.stack(telemetry['energy_val']).mean() if 'energy_val' in telemetry else torch.tensor(0.0, device=self.device)
        
        aux_out = {
            'frustration': frust_mean,
            'gate_k': gate_mean,
            'jepa_loss_log': jepa_log_mean,
            'jepa_loss_tensor': jepa_loss_final, # RETURN REAL TENSOR
            'values': torch.stack(history_value, dim=1), # [B, T, 1]
            
            # SCIENCE METRICS
            'ortho_err': ortho_err_mean,
            'meta_flux': meta_flux_mean,
            'energy_gain': energy_gain_mean,
            'energy_loss_tensor': energy_loss_final, # For Trainer
            'entropy': entropy_mean,
            'retina': retina_mean,
            'retina_std': torch.stack(telemetry['retina_std']).mean() if 'retina_std' in telemetry else torch.tensor(0.0, device=self.device),
            
            # [V81 TELEMETRY]
            'sys2_active': torch.stack(telemetry['sys2_density']).mean() if 'sys2_density' in telemetry else torch.tensor(0.0, device=self.device),
            'gate_val': torch.stack(telemetry['gate_val']).mean() if 'gate_val' in telemetry else torch.tensor(0.0, device=self.device),
            'conf_inst': torch.stack(telemetry['conf_inst']).mean() if 'conf_inst' in telemetry else torch.tensor(0.0, device=self.device),
            
            # [V83 TELEMETRY] Eureka
            'eureka_gate': torch.stack(telemetry['eureka_gate']).mean() if 'eureka_gate' in telemetry else torch.tensor(0.0, device=self.device),
            'eureka_res': torch.stack(telemetry['eureka_res']).mean() if 'eureka_res' in telemetry else torch.tensor(0.0, device=self.device)
        }
        
        return h_state, torch.stack(history_logits, dim=1), aux_out

    def crystallize(self, h_state, action_logits, reward):
        """
        [V83 EUREKA] Trigger this to freeze a moment into the Holographic Crystal.
        """
        # We only store HIGH energy events (Wins, or Severe Losses/Trauma)
        # Filter by Reward magnitude if needed, but for now we trust the caller.
        self.crystal.write(h_state, action_logits, reward)
    
    def metabolic_loss(self, rate=0.001):
        """Metabolic cost regularization (Vectorized Optimization)."""
        # Sum of absolute means of weights (Prigogine metabolic cost)
        total_abs_sum = 0.0
        n_params = 0
        
        # Collect all weights in one list for efficient processing if needed, 
        # but even just avoiding multiple attribute lookups helps.
        # We focus on weights as they are the "synapses".
        for name, param in self.named_parameters():
            if 'weight' in name:
                total_abs_sum += param.abs().sum()
                n_params += param.numel()
        
        return (total_abs_sum / (n_params + 1e-9)) * rate

    def diversity_loss(self, h):
        """VICReg-style de-correlation to force high effective rank."""
        # [FIX] Force FP32 for Statistics Stability
        # Covariance in FP16 is dangerous.
        with torch.amp.autocast('cuda', enabled=False):
            h = h.float()
            B = h.shape[0]
            if B < 2: return torch.tensor(0.0, device=self.device)
            
            # [FIX] Safety Check
            if torch.isnan(h).any():
                return torch.tensor(0.0, device=self.device)
                
            D = h.shape[-1]
            h_centered = h - h.mean(dim=0)
            cov = (h_centered.T @ h_centered) / (B - 1)
            diag = torch.diagonal(cov)
            off_diag = cov - torch.diag(diag)
            
            std_loss = torch.mean(F.relu(1.0 - torch.sqrt(diag + 1e-4)))
            
            # [FIX] Robust Covariance for Small Batch
            # If B < D, Off-Diagonal terms are naturally high due to low rank.
            # We scale the loss by a factor related to effective rank possible.
            cov_loss = (off_diag.pow(2).sum()) / D
            
            # If batch is too small, reduce weight of cov_loss to avoid noise
            if B < D:
                cov_loss = cov_loss * (B / D)

        return std_loss + cov_loss

class ChimeraAdapter(nn.Module):
    """Adapter for AGI Suite."""
    def __init__(self, n_input, n_hidden, n_actions, device='cuda', **kwargs):
        super().__init__()
        self.model = SkynetV77_5_Chimera(n_input, n_hidden, n_actions, device=device)
        self.n_hidden = n_hidden
        self.n_res = self.model.n_res
        # [V77] Fix for Holographic Tuple Input (13, 8, 8) -> 832
        if isinstance(n_input, tuple) or isinstance(n_input, list):
            fan_out_dim = 1
            for x in n_input: fan_out_dim *= x
        else:
            fan_out_dim = n_input

        # 4. Bridge (Dreaming)
        # Allows the core to project thoughts back to input space (for generative checks)
        self.bridge_to = nn.Linear(self.n_res, fan_out_dim, device=device)
        
        # Store n_input for adaptive bridging
        self.n_input = n_input
        
        # Bridge From: Lazily initialized for different input dimensions
        self._bridge_from_cache = nn.ModuleDict()  # Use ModuleDict for proper parameter tracking

    def _get_bridge(self, dim: int) -> nn.Module:
        """Lazily create bridge for any input dimension."""
        key = str(dim)
        if key not in self._bridge_from_cache:
            bridge = nn.Sequential(
                nn.Linear(dim, self.n_res, device=self.model.device),
                nn.LayerNorm(self.n_res, device=self.model.device),
                nn.Tanh()
            )
            self._bridge_from_cache[key] = bridge
        return self._bridge_from_cache[key]

    def forward(self, x, state=None):
        # Robust dimension handling: normalize to [B, T, D]
        if x.dim() == 2:
            x = x.unsqueeze(1)  # [B, D] -> [B, 1, D]

        h_prev = None
        if state is not None:
            # UNPACK STATE
            # Case 1: Dict state (Internal Recurrence)
            if isinstance(state, dict):
                h_prev = state['h']
            # Case 2: Tensor state (from Suite Loop)
            elif isinstance(state, torch.Tensor):
                if state.dim() == 3: 
                    state = state.squeeze(1)  # [B, 1, D] -> [B, D]
                
                dim = state.shape[-1]
                if dim == self.n_res:
                    h_prev = state  # Already correct dimension
                else:
                    # Adaptive bridge for ANY dimension
                    h_prev = self._get_bridge(dim)(state)
                    h_prev = F.normalize(h_prev, p=2, dim=-1)  # Re-Manifold

        h, logits, aux = self.model(x, {'h': h_prev} if h_prev is not None else None)
        
        # [V83.3 FIX] Expose raw internal state to avoid Round-Trip Distortion in Eureka
        aux['h_internal'] = h
        
        # Capture last aux for trainer access (Non-Suite usage)
        self.last_aux = aux
        
        # Suite expects [B, 1, StateDim]
        state_out = self.bridge_to(h).unsqueeze(1)
        # Suite expects [B, 1, StateDim]
        state_out = self.bridge_to(h).unsqueeze(1)
        return state_out, logits

    def crystallize(self, state, action_logits, reward):
        """
        Adapter wrapper for Crystallization.
        Handles bridging from Input Dimension (e.g. 832) to Core Dimension (1024).
        """
        # Ensure proper shape [B, D]
        if state.dim() == 3: 
            state = state.squeeze(1)
            
        dim = state.shape[-1]
        
        # Upscale if necessary (Recover Manifold)
        if dim == self.n_res:
            h = state
        else:
            # Use the bridge (cached or create new)
            h = self._get_bridge(dim)(state)
            h = F.normalize(h, p=2, dim=-1) # Project to unit sphere
            
        # Write to Core Memory
        self.model.crystallize(h, action_logits, reward)

    def get_action_logits(self, state):
        # We need the real h here.
        if state.dim() == 3: 
            state = state.squeeze(1)
        
        dim = state.shape[-1]
        if dim == self.n_res:
            h = state
        else:
            h = self._get_bridge(dim)(state)
            h = F.normalize(h, p=2, dim=-1)
             
        # "Intuition" Head (Fast)
        return self.model.head(h)
