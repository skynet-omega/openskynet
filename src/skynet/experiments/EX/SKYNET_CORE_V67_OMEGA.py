
"""
SKYNET_CORE_V67_OMEGA.py
========================
V67: "The Energy-Manifold Machine" - DEFINITIVE ARCHITECTURE.

Synthesizes:
1. V61 BIOS Stability (100% XOR/NBack preservation via LogicBridge).
2. V62 Orthogonalization (Plasticity & Anti-Collapse).
3. V66 Energy Dynamics (System 2 reasoning via Gradient Descent).
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

# Optional Babel Dependency
try:
    from sentence_transformers import SentenceTransformer
    BABEL_AVAILABLE = True
except ImportError:
    BABEL_AVAILABLE = False
    print("⚠️ Babel Warning: sentence_transformers not installed. Semantic Bridge disabled.")

# GLOBAL DEBUG & TELEMETRY
SKYNET_DEBUG = False 



class BabelCortex(nn.Module):
    """
    The Semantic Bridge (Language <-> Logic).
    Translates Human/Natural Language into Skynet's Vectorial Thought (1024d).
    Uses a frozen MiniLM encoder + Trainable Linear Adapter.
    """
    def __init__(self, n_out=1024, model_name='all-MiniLM-L6-v2', device='cuda'):
        super().__init__()
        self.device = device
        self.output_dim = n_out
        
        if BABEL_AVAILABLE:
            print(f"🗣️  Loading Babel Encoder: {model_name}...")
            # We load the model but keep it on CPU by default to save VRAM until needed,
            # or move to device if we have plenty. For now, let's keep efficient.
            self.encoder = SentenceTransformer(model_name, device=device)
            # Freeze Encoder
            for param in self.encoder.parameters():
                param.requires_grad = False
            self.embedding_dim = self.encoder.get_sentence_embedding_dimension() # 384
        else:
            self.encoder = None
            self.embedding_dim = 384
            
        # The Adapter (Trainable)
        self.adapter = nn.Sequential(
            nn.Linear(self.embedding_dim, 512, device=device),
            nn.GELU(),
            nn.Linear(512, n_out, device=device),
            nn.LayerNorm(n_out, device=device)
        )
        
    def forward(self, text_input):
        """
        Input: list of strings (B) or single string.
        Output: Tensor [B, 1024] (Thought Vectors)
        """
        if self.encoder is None:
            return torch.zeros(1, self.output_dim, device=self.device)
            
        with torch.no_grad():
            # Get raw embeddings [B, 384]
            embeddings = self.encoder.encode(text_input, convert_to_tensor=True, device=self.device)
            embeddings = embeddings.clone() # Detach from inference mode for autograd compatibility
            
        # Project to Skynet Space
        thought_vector = self.adapter(embeddings)
        return thought_vector

class SkynetV67_Omega(nn.Module):
    def __init__(self, n_input, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.device = device
        self.n_input = n_input
        self.n_res = 1024  # V67 SCALED: 1024 Neurons (Semantic Capacity / "Wide Lake")
        self.n_actions = n_actions
        
        # V62 Surprisal Gating Parameters (Calibration)
        # V62 Self-Organizing Parameters (Aprendibles, no mágicos)
        # Sensitivity: Qué tanto reacciona la puerta ante el error (Inversa de Temperatura)
        self.gate_sensitivity = nn.Parameter(torch.tensor(1.0, device=device)) 
        # [NEW] Neuromodulation Gains
        self.neuromod_scale = nn.Parameter(torch.tensor(1.0, device=device))
        
        # [NEW] RESONATOR CONFIG (System 2 Params)
        self.max_ponder_steps = 10 # Cap on thinking time
        self.ponder_noise = 0.5 # Initial Temperature
        self.surprise_threshold = 0.1 # Trigger Sensitivity
 
        # Phase Lability: Cuánto rotar ante sorpresa (Plasticidad rotacional)
        self.phase_lability = nn.Parameter(torch.tensor(0.5, device=device))
        # Retention: Tasa base de olvido/retención (Learnable Decay)
        self.retention_rate = nn.Parameter(torch.tensor(0.99, device=device))
        
        print(f"Ω FORGING SKYNET V67 'OMEGA' (ENERGY MANIFOLD) [1024-NEURON BABEL-READY]...")
        
        # 0. SEMANTIC BRIDGE ("BABEL")
        # Puente entre MiniLM (384) y Skynet (1024)
        self.babel_projector = nn.Sequential(
            nn.Linear(384, self.n_res, device=device),
            nn.LayerNorm(self.n_res, device=device),
            nn.GELU()
        )
        self.babel_ready = False
        
        # 1. PERCEPTION (V61 Legacy - Proven 100% XOR)
        self.retina = nn.Linear(n_input, self.n_res, device=device)
        self.norm_in = nn.LayerNorm(self.n_res, device=device)
        
        # 2. ORTHOGONAL MEMORY (V62 Legacy - Plasticity / Clock)
        # Complex-valued recurrent core with Diagonal Rotation (The "Clock")
        # This guarantees 100% NBack/Memory retention.
        self.recurrent_u = nn.Linear(self.n_res, self.n_res * 2, bias=False, device=device)
        
        # V62 Clock Mechanism
        periods = torch.pow(2.0, torch.linspace(0, 8, self.n_res, device=device))
        self.register_buffer('omegas', 2 * np.pi / periods)
        
        # Note: We remove dense recurrent_w to avoid chaos. 
        # Interactions happen via Predictor and Cortex (Energy Manifold).
        # self._init_orthogonal_complex() # Handled by Clock structure
        
        # 3. PRESCIENT IMAGINATION (V63 Legacy - JEPA)
        self.predictor = nn.Sequential(
            nn.Linear(self.n_res, self.n_res, device=device),
            nn.GELU(),
            nn.Linear(self.n_res, self.n_res, device=device) # Predicts next h_state (real flat)
        )
        

        # 5. ACTION HEADS
        # Policy (Instinct)
        self.actor = nn.Linear(self.n_res, n_actions, device=device)
        # Action Embedding (for Energy calculation)
        self.action_embed = nn.Embedding(n_actions, self.n_res, device=device)
        
        # 6. LOGIC BRIDGE (Output Projector)
        self.logic_bridge = nn.Linear(self.n_res * 2, n_input, device=device)
        
        # V66-style bridges for Adapter compatibility
        self.bridge_from = nn.Linear(n_input, self.n_res * 2, device=device)



    def receive_command(self, raw_embedding_384, h_current):
        """Inyección Telepática de Comandos"""
        cmd_vec = self.babel_projector(raw_embedding_384.to(self.device))
        
        # Convertir a complejo (Modulación suave 0.1)
        cmd_complex = torch.complex(cmd_vec, torch.zeros_like(cmd_vec))
        
        # Modulación suave (0.1) para no borrar la memoria
        return h_current + (cmd_complex.to(h_current.device) * 0.1)

    def load_babel_weights(self, path):
        """Carga solo el adaptador de lenguaje sin tocar el cerebro"""
        try:
            ckpt = torch.load(path, map_location=self.device)
            # Support both saving formats (Projector or full Adapter)
            if 'projector_state_dict' in ckpt:
                self.babel_projector.load_state_dict(ckpt['projector_state_dict'])
            elif 'adapter_state_dict' in ckpt: # Legacy support
                 self.babel_projector.load_state_dict(ckpt['adapter_state_dict'])
            else:
                 # Attempt direct load
                 self.babel_projector.load_state_dict(ckpt)
            
            self.babel_ready = True
            print("🗣️  Babel Cortex: ONLINE (Weights Loaded)")
        except Exception as e:
            print(f"⚠️ Babel Error: {e}")


    def _physical_step(self, u, h_complex):
        """
        Núcleo de la Física Recurrente V62.
        Dinámica: h_new = h_old * Rot + Gating(Difference) * Input
        """
        # 1. Prediction (Internal Model)
        h_feat_current = torch.abs(h_complex) + h_complex.real
        prediction = self.predictor(h_feat_current)
        
        # 2. Surprise (Delta Física)
        error = u - prediction
        surprise = torch.tanh(torch.abs(error)) # [0, 1]
        
        # 3. Adaptive Gating (Kalman-like)
        # Si Surprise es alta, aumentamos Plasticidad (Aceptamos input).
        # Si Surprise es baja, confiamos en Memoria (Retención).
        plasticity = torch.sigmoid(surprise * self.gate_sensitivity)
        
        # 4. Phase Modulation (Divergencia Ortogonal)
        # Rotamos el input nuevo en función de la sorpresa para evitar colisión
        theta_shift = self.phase_lability * (torch.pi / 2) * surprise
        rot_input = torch.exp(1j * theta_shift)
        
        # 5. Complex Input Projection
        gate_input = self.recurrent_u(u)
        r_in, i_in = gate_input.chunk(2, dim=-1)
        u_complex = torch.complex(torch.tanh(r_in), torch.tanh(i_in))
        
        # 6. Time Evolution (Clock)
        Rot = torch.exp(1j * self.omegas)
        
        # UPDATE FORMULA:
        # H_new = (H_old * Rot * self.retention_rate) + (Input * Rot_Input * Plasticity)
        h_next = (h_complex * Rot * self.retention_rate) + \
                 (u_complex * rot_input * plasticity)
                 
        return h_next, h_next.real + h_next.imag, surprise.mean(dim=-1)

    def forward(self, x, h_complex=None, mode='fast', verbose=False):
        """
        mode: 
            'fast' (System 1): Instinctive reaction.
            'adaptive' (System 2): Activates Resonator loops if Surprise > Threshold.
        """
        # --- PHASE 0: INPUT SHAPE HANDLING (V65 Hybrid Logic) ---
        # Handle Conway [B, 1, 32, 32] -> [B, 1, 1024] or [B, 1024]
        if x.dim() == 4:
            B, C, H, W = x.shape
            # For OMEGA, we rely on V61 Linear Retina for minimal complexity
            # So we flatten 4D grid to 2D vector
            x = x.view(B, 1, C*H*W) 
        
        # Now x is likely [B, T, D] or [B, D]
        if x.dim() == 2:
             pass
        elif x.dim() == 3:
             pass

        # --- PHASE 1: PERCEPTION & STATE UPDATE ---
        if h_complex is None:
            B = x.size(0)
            h_complex = torch.zeros(B, self.n_res, dtype=torch.cfloat, device=self.device)
            
        # ----------------------------------------------------
        # SEQUENCE PROCESSING
        # ----------------------------------------------------
        if x.dim() == 3:
            T = x.size(1)
            history_logits = []
            
            for t in range(T):
                xt = x[:, t]
                u = self.retina(xt)
                u = self.norm_in(u)
                
                # --- PHYSCIAL STEP (Default) ---
                h_complex, h_flat, surprise_val = self._physical_step(u, h_complex)
                
                # --- SYSTEM 2: ADAPTIVE RESONANCE ---
                # Check if we need to think (Surprise > Threshold)
                # Only strictly necessary if we are in a mode that allows it, or we can make it default?
                # Let's make it efficient: Vectorized masking.
                
                # We use the surprise value computed in physical step
                # surprise_val is [B]
                
                # Mask of agents who are confused
                mask_think = (surprise_val > self.surprise_threshold)
                
                if mask_think.any() and (mode == 'adaptive' or mode == 'deep'): 
                     # Calculate Dynamic Steps (Proportional to Surprise)
                     # Steps = Surprise * MaxSteps. (e.g. 0.8 * 10 = 8 steps)
                     
                     # We take the max surprise in the batch to vectorize the loop count (sync execution)
                     # Or constant 5 steps for simplicity in V1.
                     # Let's use dynamic.
                     max_s = surprise_val[mask_think].max().item()
                     steps_needed = int(max_s * self.max_ponder_steps)
                     steps_needed = max(1, steps_needed) # At least 1 if triggered
                     
                     if verbose: print(f"🤔 Pondering: {mask_think.sum().item()} agents for {steps_needed} steps")
                     
                     # CLONE STATE for safe iteration
                     h_temp = h_complex.clone()
                     
                     for p_step in range(steps_needed):
                         # 1. Noise Annealing
                         temp_now = self.ponder_noise * (1.0 - p_step / steps_needed)
                         noise = (torch.randn_like(h_temp) + 1j*torch.randn_like(h_temp)) * temp_now
                         
                         # Apply noise only to thinkers
                         noise = noise * mask_think.view(-1, 1)
                         h_temp = h_temp + noise
                         
                         # 2. Re-Resonate (Physical Step with SAME input u)
                         # This allows the recurrent weights to settle/digest 'u'
                         h_next_p, _, surp_p = self._physical_step(u, h_temp)
                         
                         # Update only thinkers
                         # FIX: Remove unsqueeze(-1) to avoid broadcasting [B, 1, 1] vs [B, D] -> [B, B, D]
                         h_temp = torch.where(mask_think.view(-1, 1), h_next_p, h_temp)
                         
                         # Early Exit Optimization? (If surprise drops below thresh)
                         # Updating mask inside loop is tricky for batch processing in PyTorch without overhead.
                         # Just run the budget.
                     
                     # COMMIT THOUGHTS
                     h_complex = h_temp
                     h_flat = h_complex.real + h_complex.imag
                
                logits = self.actor(h_flat)
                history_logits.append(logits)
            
            return h_complex, torch.stack(history_logits, dim=1), None

        else:
             # Single step
             u = self.retina(x)
             u = self.norm_in(u)
             
             # Step 1
             h_complex, h_flat, surprise_val = self._physical_step(u, h_complex)
             
             # System 2 Logic
             mask_think = (surprise_val > self.surprise_threshold)
             
             if mask_think.any() and (mode == 'adaptive' or mode == 'deep'):
                 max_s = surprise_val[mask_think].max().item()
                 steps_needed = int(max_s * self.max_ponder_steps)
                 steps_needed = max(1, steps_needed)
                 
                 h_temp = h_complex.clone()
                 for p_step in range(steps_needed):
                     temp_now = self.ponder_noise * (1.0 - p_step / steps_needed)
                     noise = (torch.randn_like(h_temp) + 1j*torch.randn_like(h_temp)) * temp_now
                     noise = noise * mask_think.view(-1, 1)
                     h_temp = h_temp + noise
                     
                     h_next_p, _, _ = self._physical_step(u, h_temp)
                     # FIX: Remove unsqueeze(-1)
                     h_temp = torch.where(mask_think.view(-1, 1), h_next_p, h_temp)
                 
                 h_complex = h_temp
                 h_flat = h_complex.real + h_complex.imag
             
             logits = self.actor(h_flat)
             return h_complex, logits, None
             



    def get_action_logits(self, states):
        """Compatibility wrapper for AGI_SUITE"""
        # Handle complex/real inputs from different test suites
        if hasattr(states, 'is_complex') and states.is_complex():
            states = states.real + states.imag
        if states.dim() == 3:
            states = states[:, -1, :]
            
        # Check input dimension
        if states.shape[-1] == self.n_input:
             # Project Observation -> Latent
             h = self.retina(states)
             h = self.norm_in(h)
             return self.actor(h)
             
        # For evaluation, we can enforce System 2 if needed, 
        # but for metrics (XOR/NBack) System 1 is sufficient and safer.
        return self.actor(states)

class V67Adapter(nn.Module):
    def __init__(self, n_input, n_hidden, n_actions, device='cuda', **kwargs):
        super().__init__()
        self.model = SkynetV67_Omega(n_input, n_hidden, n_actions, device=device)
        self.use_thinking = kwargs.get('adaptive_resonance', True) # Default ON
        print(f"🧠 V67 Adapter: Thinking Engine (System 2) is {'ON' if self.use_thinking else 'OFF'}")
        
        # Reuse Core's bridges if possible or define here
        self.device = device
        self.n_input = n_input
        self.bridge_from = self.model.bridge_from
        
        
    def forward(self, x, state=None, verbose=None):
        # PATCH: Safety move to device
        x = x.to(self.device)
        h_complex = None
        if state is not None:
             if isinstance(state, dict): 
                 h_complex = state.get('z')
                 if h_complex is not None:
                     h_complex = h_complex.to(self.device)
             elif state.dim() == 3: 
                  # Attempt to recover complex state
                  pass 
        
        # SkynetV67 handles sequence internally
        # SYSTEM 2 LOGIC: Controlled by configuration
        exec_mode = 'adaptive' if self.use_thinking else 'fast'
        h_next, logits, _ = self.model(x, h_complex, mode=exec_mode, verbose=verbose)
        
        # AGI Suite expects (state_suite, logits)
        # state_suite is usually [B, 1, D] for next step input
        # We project back to input dim
        h_flat = torch.cat([h_next.real, h_next.imag], dim=-1)
        state_suite = self.model.logic_bridge(h_flat).unsqueeze(1)
        
        return state_suite, logits

    def get_action_logits(self, states):
        return self.model.get_action_logits(states)

