import torch
import socket
import json
import time
import threading

# ==============================================================================
# BIFASIC ENGINE (PyTorch) - The Thermodynamic Brain
# ==============================================================================
# This engine solves the "Translation Gap" by mapping latent indices directly 
# to semantic IDs provided by TypeScript. It solves "Numerical Instability" 
# by using strictly bounded Leaky Integrate-and-Fire (LIF) dynamics with 
# clamped temperatures.

class BifasicSubstrate:
    def __init__(self, dim=1024, device="cuda" if torch.cuda.is_available() else "cpu"):
        self.device = device
        self.dim = dim
        self.state_rho = torch.zeros(dim, device=self.device)  # Biomass (Activity)
        self.temp_T = torch.zeros(dim, device=self.device)     # Local Temperature
        
        # Hyperparameters (Bounded for absolute stability)
        self.T_c = 0.7            # Critical temperature for phase transition
        self.decay_rho = 0.95     # Biomass decay (forgetting)
        self.decay_T = 0.90       # Temperature decay (cooling)
        self.diffusion_k = 0.1    # Spread of heat to adjacent concepts
        
        print(f"[BifasicEngine] Substrate initialized on {self.device} with dim {self.dim}")

    def inject_energy(self, active_indices, energy_level):
        """
        Injects heat/energy into specific semantic nodes.
        active_indices: list of indices representing current context/goals.
        energy_level: scalar representing surprise/frustration.
        """
        if not active_indices:
            return

        idx_tensor = torch.tensor(active_indices, device=self.device, dtype=torch.long)
        
        # Heat up the specific nodes
        self.temp_T[idx_tensor] += energy_level
        # Clamp to prevent numerical explosion
        self.temp_T = torch.clamp(self.temp_T, 0.0, 1.0)
        
        # When T > T_c, the node becomes "Fluid" and allows biomass to accumulate rapidly
        fluid_mask = self.temp_T > self.T_c
        
        # Only fluid nodes accept new structural biomass
        self.state_rho[fluid_mask] += 0.5 * self.temp_T[fluid_mask]
        self.state_rho = torch.clamp(self.state_rho, 0.0, 1.0)

    def step(self):
        """
        Advances the thermodynamic state by one tick.
        Simulates cooling and memory decay.
        """
        # 1. Diffuse heat slightly (1D blur for simplicity, representing associative spread)
        diffused_T = torch.roll(self.temp_T, 1) * self.diffusion_k + \
                     torch.roll(self.temp_T, -1) * self.diffusion_k + \
                     self.temp_T * (1 - 2*self.diffusion_k)
                     
        # 2. Cool down
        self.temp_T = diffused_T * self.decay_T
        
        # 3. Decay biomass (memory fading if not maintained)
        self.state_rho = self.state_rho * self.decay_rho
        
        # 4. Detect Phase Transitions (Crystallization: T drops below T_c while Rho is high)
        # This is the "Spike" - an actionable thought.
        spike_mask = (self.temp_T < self.T_c) & (self.state_rho > 0.8)
        
        spikes = torch.nonzero(spike_mask).squeeze(-1).tolist()
        
        # Reset biomass for spiked neurons (refractory period)
        self.state_rho[spike_mask] = 0.0
        
        return spikes

    def get_state_summary(self):
        return {
            "max_temp": float(self.temp_T.max()),
            "avg_temp": float(self.temp_T.mean()),
            "active_biomass_nodes": int((self.state_rho > 0.1).sum())
        }

# ==============================================================================
# IPC SERVER (Zero-dependency TCP Socket)
# ==============================================================================

def start_server(host='127.0.0.1', port=28790):
    substrate = BifasicSubstrate()
    
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind((host, port))
    server.listen(1)
    
    print(f"[BifasicEngine] Listening for OpenSkyNet on {host}:{port}")
    
    while True:
        conn, addr = server.accept()
        with conn:
            try:
                data = conn.recv(4096)
                if not data:
                    continue
                
                req = json.loads(data.decode('utf-8'))
                action = req.get('action')
                
                if action == 'inject':
                    substrate.inject_energy(req.get('indices', []), req.get('energy', 0.0))
                    conn.sendall(json.dumps({"status": "ok"}).encode('utf-8'))
                
                elif action == 'step':
                    spikes = substrate.step()
                    summary = substrate.get_state_summary()
                    conn.sendall(json.dumps({
                        "spikes": spikes, 
                        "summary": summary
                    }).encode('utf-8'))
                    
                elif action == 'ping':
                    conn.sendall(json.dumps({"status": "alive"}).encode('utf-8'))
                    
            except Exception as e:
                err = json.dumps({"error": str(e)})
                conn.sendall(err.encode('utf-8'))

if __name__ == "__main__":
    start_server()
