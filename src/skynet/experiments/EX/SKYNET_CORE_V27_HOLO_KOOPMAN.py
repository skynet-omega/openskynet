import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np

# ==============================================================================
# COMPONENT: UNIVERSAL RETINA (Spatial awareness)
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
    def __init__(self, input_dim, d_model, device='cuda'):
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
                
            self.proj = nn.Linear(cnn_out_dim, d_model, dtype=torch.complex64, device=device)
            self.norm = nn.LayerNorm(d_model, device=device) # Stabilization for CNN output
            
        else:
            print(f"   👁️ Retina: Generic Input Detected ({input_dim}). Engaging Linear Adapter.")
            # For XOR, MiniGrid, etc.
            # We map directly from Input Space -> Hidden Complex Space
            self.proj = nn.Linear(input_dim, d_model, dtype=torch.complex64, device=device)
            self.norm = nn.LayerNorm(d_model, device=device) # Stabilization for raw inputs

    def forward(self, x_seq):
        """
        Input: [Batch, Seq, input_dim] (or [Batch, input_dim] handled by view)
        Handles both Float (Continuous) and Long (Discrete/Tokens) automatically.
        """
        # Handle cases where x_seq might be 2D [Batch, Dim] or 3D [Batch, Seq, Dim]
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

# ==============================================================================
# COMPONENT: PHASE LINEAR LAYER (Unitary Weights)
# ==============================================================================
class PhaseLinear(nn.Module):
    """
    A Linear layer where weights are parameterized as phases: W = exp(i * phi)
    This forces optimization to happen on the phase manifold (Torus),
    preventing amplitude collapse and ensuring interference.
    """
    def __init__(self, in_features, out_features, device='cuda'):
        super().__init__()
        self.in_features = in_features
        self.out_features = out_features
        # Initialize phases uniformly in [0, 2pi]
        self.phi = nn.Parameter(torch.rand(out_features, in_features, device=device) * 2 * np.pi)
        
    def forward(self, z):
        # z: [B, In] (Complex)
        # W: [Out, In] (Complex unit magnitude)
        W = torch.exp(1j * self.phi)
        
        # Linear projection: out = z @ W.T
        # PyTorch complex matmul handles this
        return F.linear(z, W)

# ==============================================================================
# COMPONENT: HOLO-KOOPMAN DYNAMICS (Spectral Memory)
# ==============================================================================
class HoloDynamics(nn.Module):
    def __init__(self, d_model, n_freqs, device='cuda'):
        super().__init__()
        self.d_model = d_model
        self.n_freqs = n_freqs
        self.device = device
        
        # Learnable Frequencies (The "Clockwork")
        # FIXED: Harmonic Initialization (Geometric Series) to cover all timescales
        # T = 2, 4, 8 ... -> w = 2pi/T
        periods = torch.pow(2.0, torch.linspace(0, 8, n_freqs, device=device))
        omegas_init = 2 * np.pi / periods
        # Add slight noise to break symmetry
        self.omegas = nn.Parameter(omegas_init + torch.randn_like(omegas_init) * 0.01)
        
        # Learnable Damping (Stability)
        self.damping = nn.Parameter(torch.ones(n_freqs, device=device) * 0.01)
        
        # Input to Complex Projection
        self.to_complex = nn.Linear(d_model, n_freqs * 2, device=device)
        
    def forward(self, x_t, z_prev):
        """
        x_t: [B, D] - Current latent input
        z_prev: [B, F] (Complex) - Previous holographic state
        """
        # Handle Complex Input from Retina (Polar)
        if x_t.is_complex():
            x_t = x_t.abs()
            
        # 1. Encode Input into the Wave Field
        u_flat = self.to_complex(x_t) # [B, 2*F]
        
        # Use ellipsis to slice the LAST dimension safely
        u_real = u_flat[..., :self.n_freqs]
        u_imag = u_flat[..., self.n_freqs:]
        u_t = torch.complex(u_real, u_imag)
        
        # 2. Linear Spectral Evolution: z_new = z_old * e^{i*omega - damping} + u_t
        # This is a bank of damped oscillators
        dt = 1.0
        exponent = torch.complex(-self.damping.abs(), self.omegas) * dt
        rotator = torch.exp(exponent) # [F]
        
        z_next = z_prev * rotator + u_t
        
        return z_next

# ==============================================================================
# MAIN ARCHITECTURE: SKYNET V27 HOLO-KOOPMAN
# ==============================================================================
class SkynetV27HoloKoopman(nn.Module):
    def __init__(self, n_input, n_hidden, n_actions, device='cuda'):
        super().__init__()
        self.n_input = n_input
        self.n_hidden = n_hidden
        self.device = device
        
        print(f"🌌 INITIALIZING SKYNET V27 'HOLO-KOOPMAN'")
        print(f"   >> Principle: Wave Interference & Spectral Resonance")
        
        self.retina = UniversalRetina(n_input, n_hidden, device=device)
        
        # Hidden dimension corresponds to number of oscillators
        self.n_freqs = n_hidden * 2 
        self.dynamics = HoloDynamics(n_hidden, self.n_freqs, device=device)
        
        # Holographic Readout: Complex -> Real via Interference (Phase Only)
        # We project to a single complex value per action, then take intensity
        self.readout_phase = PhaseLinear(self.n_freqs, n_actions, device=device)
        self.readout_bias = nn.Parameter(torch.zeros(n_actions, device=device))
        
    def init_state(self, batch_size):
        return torch.zeros(batch_size, self.n_freqs, dtype=torch.complex64, device=self.device)

    def forward(self, x, state=None):
        if x.dim() == 2:
            x = x.unsqueeze(1)
        B, T, _ = x.shape
        
        if state is None:
            state = self.init_state(B)
            
        z = state
        all_z_real = [] # For telemetry compat
        all_logits = []
        
        for t in range(T):
            x_t = x[:, t, :]
            
            # 1. Retina
            lat_t = self.retina(x_t)
            # Fix: Retina returns [B, 1, H] due to internal unsqueeze, but Dynamics expects [B, H]
            if lat_t.dim() == 3:
                lat_t = lat_t.squeeze(1)
            
            # 2. Dynamics (Complex Evolution)
            z = self.dynamics(lat_t, z)
            
            # 3. Holographic Interference Readout (Phase Only)
            # Project to [B, Actions] complex vector
            z_proj = self.readout_phase(z)
            
            # Intensity Detection: |z|^2
            intensity = z_proj.abs().pow(2)
            
            logits = intensity + self.readout_bias
            
            all_logits.append(logits)
            all_z_real.append(z) # Keep Complex for Phase Memory
            
        return torch.stack(all_z_real, dim=1), torch.stack(all_logits, dim=1)

    def get_action_logits(self, z):
        # Compat for AGI_SUITE
        if z.dim() == 3:
            z = z[:, -1, :] # Select last timestep [B, F]
        
        # If input z is real (from states return), we must cast to complex
        # This is an approximation for external probes
        if not torch.is_complex(z):
            z = torch.complex(z, torch.zeros_like(z))
            
        z_proj = self.readout_phase(z)
        return z_proj.abs().pow(2) + self.readout_bias