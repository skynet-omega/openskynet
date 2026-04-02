"""
SKYNET_V7000_HYBRID_BRAIN.py
=============================

V7000: Cerebro Híbrido - V1000 Paralelo + V204 Sparse

PROBLEMA QUE RESUELVE:
- V6000 puro: 1772ms para T=1000 (bucle Python serial)
- Transformer: 6ms para T=1000 (CUDA paralelo)

SOLUCIÓN:
- V1000 como Conv1d: paralelo en CUDA, O(1) overhead
- V204 resonancia: solo cada N pasos (sparse temporal)

INSPIRACIÓN BIOLÓGICA:
- Tálamo (V1000): procesamiento rápido, 1000Hz
- Corteza prefrontal (V204): pensamiento profundo, 5Hz (cada 200ms)

Autor: Investigación AGI (2026-01-30)
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.fft
import math
import time
from typing import Optional, Tuple

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
COMPLEX_DTYPE = torch.complex64


# ==============================================================================
# V1000 COMO CONVOLUCIÓN (PARALELO)
# ==============================================================================

class V1000Conv(nn.Module):
    """
    V1000 Echo Cavity implementado como Conv1d.
    
    Ventaja: procesa toda la secuencia en paralelo (CUDA matmul).
    Matemáticamente equivalente a: y_t = Σᵢ rᵢ · x_{t-i}
    """
    def __init__(self, 
                 input_dim: int,
                 hidden_dim: int,
                 n_echoes: int = 8,
                 device: str = 'cuda'):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.n_echoes = n_echoes
        self.device = device
        
        # Proyección de entrada
        self.input_proj = nn.Linear(input_dim, hidden_dim, device=device)
        
        # Reflectividades (kernel de la convolución)
        # Inicializar decayendo exponencialmente (físico)
        init_r = torch.exp(-torch.arange(n_echoes, dtype=torch.float32, device=device) * 0.3)
        self.reflectivities = nn.Parameter(init_r / init_r.sum())
        
        # Convolución causal (depthwise para eficiencia)
        # Cada canal se procesa independientemente
        self.conv = nn.Conv1d(
            in_channels=hidden_dim,
            out_channels=hidden_dim,
            kernel_size=n_echoes,
            padding=n_echoes - 1,  # Causal padding
            groups=1,  # [FIX] Full Connectivity (was hidden_dim / Depthwise)
            bias=False,
            device=device
        )
        
        # Inicializar kernel con reflectividades (clonar para evitar memoria compartida)
        # [FIX] For groups=1, shape is (out, in, k). Scale by 1/hidden_dim to preserve magnitude.
        with torch.no_grad():
            scaling = 1.0 / hidden_dim
            self.conv.weight.data = self.reflectivities.view(1, 1, -1).expand(hidden_dim, hidden_dim, n_echoes).clone() * scaling
        
        print(f"   V1000-Conv: {hidden_dim}×{n_echoes} (paralelo CUDA, groups=1)")
    
    def forward(self, x_seq: torch.Tensor) -> torch.Tensor:
        """
        Procesar secuencia COMPLETA en paralelo.
        
        x_seq: [B, T, input_dim]
        returns: [B, T, hidden_dim]
        """
        if x_seq.dim() == 3:
            B, T, D = x_seq.shape
        elif x_seq.dim() == 2:
            B, D = x_seq.shape
            T = 1
            x_seq = x_seq.unsqueeze(1)
        else:
            # Fallback for > 3 dims (e.g. [B, T, C, H, W] or [B, C, H, W])
            B = x_seq.size(0)
            D = x_seq.size(-1)
            # Flatten everything else into T? Or just assume last dim is D?
            # Safer to flatten middle dims
            x_seq = x_seq.view(B, -1, D)
            T = x_seq.size(1)
        
        # Proyectar
        x_proj = self.input_proj(x_seq)  # [B, T, hidden_dim]
        
        # Convolución paralela (CUDA optimizado)
        # Conv1d espera [B, C, T]
        x_conv = x_proj.permute(0, 2, 1)  # [B, hidden_dim, T]
        y_conv = self.conv(x_conv)[:, :, :T]  # [B, hidden_dim, T] (truncar padding)
        
        return y_conv.permute(0, 2, 1)  # [B, T, hidden_dim]


# ==============================================================================
# V204 RESONANCIA (SPARSE TEMPORAL)
# ==============================================================================

class V204Sparse(nn.Module):
    """
    V204 Resonancia que solo se activa cada N pasos.
    
    El cerebro no "piensa profundo" en cada milisegundo.
    Theta waves ~ 5Hz = cada 200ms.
    """
    def __init__(self,
                 hidden_dim: int,
                 resonance_iterations: int = 3,
                 sparse_interval: int = 10,  # Solo cada 10 pasos
                 device: str = 'cuda'):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.freq_dim = hidden_dim // 2 + 1
        self.Q = resonance_iterations
        self.sparse_interval = sparse_interval
        self.device = device
        
        # Componentes de resonancia (similar a V204)
        self.theta_base = nn.Parameter(torch.rand(self.freq_dim, device=device) * 2 * math.pi)
        self.gamma = nn.Parameter(torch.randn(self.freq_dim, device=device) * 0.05)
        self.mirror_shift = nn.Parameter(torch.zeros(self.freq_dim, device=device))
        
        # Gate de activación (cuándo activar resonancia)
        self.uncertainty_gate = nn.Linear(hidden_dim, 1, device=device)
        
        print(f"   V204-Sparse: {resonance_iterations} iter, cada {sparse_interval} pasos")
    
    def resonate(self, h_freq: torch.Tensor, u_freq: torch.Tensor) -> torch.Tensor:
        """Una iteración de resonancia Ego-Alter."""
        # Efecto Kerr
        intensity = h_freq.real.pow(2) + h_freq.imag.pow(2)
        theta = self.theta_base + self.gamma * intensity
        rotor = torch.complex(torch.cos(theta), torch.sin(theta))
        
        # Ego
        h_ego = h_freq * rotor
        
        # Alter (reflejado)
        mirror_rotor = torch.complex(torch.cos(self.mirror_shift), torch.sin(self.mirror_shift))
        h_alter = (h_freq * mirror_rotor) * rotor
        
        # Interferencia + inyección
        h_combined = h_ego + h_alter + 0.1 * u_freq
        
        # Normalización
        max_val = torch.abs(h_combined).max(dim=-1, keepdim=True)[0]
        scale = torch.where(max_val > 1.5, 1.5 / (max_val + 1e-6), torch.ones_like(max_val))
        
        return h_combined * scale
    
    def forward(self, x_features: torch.Tensor, 
                step: int,
                h_freq_prev: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, bool]:
        """
        Forward con activación sparse.
        
        Returns:
            y_time: Features refinadas [B, hidden_dim]
            h_freq: Nuevo estado de frecuencia [B, freq_dim] complex
            activated: Si se activó la resonancia
        """
        # Convertir a frecuencia
        u_freq = torch.fft.rfft(x_features, dim=-1, norm='ortho')
        
        # ¿Activar resonancia?
        # - Cada sparse_interval pasos
        # - O si la incertidumbre es alta
        uncertainty = torch.sigmoid(self.uncertainty_gate(x_features))
        
        should_activate = (step % self.sparse_interval == 0) or (uncertainty.mean() > 0.7)
        
        if should_activate:
            # Resonancia completa
            h_freq = h_freq_prev
            for _ in range(self.Q):
                h_freq = self.resonate(h_freq, u_freq)
            activated = True
        else:
            # Paso simple (Kerr puro, sin resonancia)
            h_freq = h_freq_prev + 0.1 * u_freq
            activated = False
        
        # Volver a tiempo
        y_time = torch.fft.irfft(h_freq, n=self.hidden_dim, dim=-1, norm='ortho')
        
        return y_time, h_freq, activated


# ==============================================================================
# V7000 HYBRID BRAIN
# ==============================================================================

class V7000HybridBrain(nn.Module):
    """
    V7000: Arquitectura Híbrida.
    
    - V1000-Conv (Tálamo): Procesamiento rápido, paralelo, toda la secuencia
    - V204-Sparse (Corteza): Pensamiento profundo, solo cada N pasos
    - MLP Head: Decisión final
    
    Complejidad:
    - Tiempo: O(T × D) donde el factor constante es CUDA-paralelo
    - Memoria: O(D) constante (no crece con T)
    """
    def __init__(self,
                 input_dim: int,
                 hidden_dim: int,
                 output_dim: int,
                 n_echoes: int = 8,
                 resonance_iterations: int = 3,
                 sparse_interval: int = 10,
                 device: str = 'cuda'):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.freq_dim = hidden_dim // 2 + 1
        self.device = device
        
        print(f"⚡ V7000 HYBRID BRAIN ONLINE")
        
        # Tálamo (V1000): procesamiento paralelo
        self.thalamus = V1000Conv(input_dim, hidden_dim, n_echoes, device)
        
        # Corteza (V204): resonancia sparse
        self.cortex = V204Sparse(hidden_dim, resonance_iterations, sparse_interval, device)
        
        # Head
        self.norm = nn.LayerNorm(hidden_dim, device=device)
        self.head = nn.Linear(hidden_dim, output_dim, device=device)
        
        n_params = sum(p.numel() for p in self.parameters())
        print(f"   Total params: {n_params:,}")
        
        self.to(device)
    
    def forward(self, x_seq: torch.Tensor) -> Tuple[torch.Tensor, dict]:
        """
        Forward híbrido.
        
        x_seq: [B, T, input_dim]
        returns: [B, T, output_dim], stats
        """
        if x_seq.dim() == 2:
            x_seq = x_seq.unsqueeze(1)
        
        B, T, _ = x_seq.shape
        
        # Paso 1: Tálamo procesa TODO en paralelo (CUDA optimizado)
        thalamic_features = self.thalamus(x_seq)  # [B, T, hidden_dim]
        
        # Paso 2: Corteza refina con resonancia sparse
        h_freq = torch.zeros(B, self.freq_dim, dtype=COMPLEX_DTYPE, device=self.device)
        
        cortical_features = []
        n_activations = 0
        
        for t in range(T):
            cortical_t, h_freq, activated = self.cortex(
                thalamic_features[:, t], 
                step=t,
                h_freq_prev=h_freq
            )
            cortical_features.append(cortical_t)
            n_activations += int(activated)
        
        cortical_features = torch.stack(cortical_features, dim=1)  # [B, T, hidden_dim]
        
        # Combinar tálamo + corteza (residual)
        combined = thalamic_features + 0.5 * cortical_features
        
        # Head
        normalized = self.norm(combined)
        logits = self.head(normalized)
        
        stats = {
            'cortex_activations': n_activations,
            'activation_rate': n_activations / T
        }
        
        return logits, stats


# ==============================================================================
# VERSION FULL PARALLEL (sin bucle Python)
# ==============================================================================

class V7000FullParallel(nn.Module):
    """
    V7000 completamente paralelo (sin bucle Python).
    
    Usa solo V1000-Conv + MLP, evitando la recurrencia.
    Para tareas donde no necesitas resonancia.
    """
    def __init__(self,
                 input_dim: int,
                 hidden_dim: int,
                 output_dim: int,
                 n_echoes: int = 8,
                 n_layers: int = 2,
                 device: str = 'cuda'):
        super().__init__()
        self.hidden_dim = hidden_dim
        self.device = device
        
        print(f"⚡ V7000 FULL PARALLEL ONLINE")
        
        # Stack de V1000-Conv (como TCN multi-capa)
        layers = []
        for i in range(n_layers):
            in_dim = input_dim if i == 0 else hidden_dim
            layers.append(V1000Conv(in_dim, hidden_dim, n_echoes * (2**i), device))
            layers.append(nn.LayerNorm(hidden_dim, device=device))
            layers.append(nn.GELU())
        
        self.encoder = nn.ModuleList(layers)
        
        # Head
        self.head = nn.Linear(hidden_dim, output_dim, device=device)
        
        n_params = sum(p.numel() for p in self.parameters())
        print(f"   Total params: {n_params:,}")
        
        self.to(device)
    
    def forward(self, x_seq: torch.Tensor) -> torch.Tensor:
        """100% paralelo, sin bucle Python."""
        if x_seq.dim() == 2:
            x_seq = x_seq.unsqueeze(1)
        
        h = x_seq
        for layer in self.encoder:
            if isinstance(layer, V1000Conv):
                h = layer(h)
            elif isinstance(layer, (nn.LayerNorm, nn.GELU)):
                h = layer(h)
        
        return self.head(h)


# ==============================================================================
# BENCHMARKS
# ==============================================================================

def benchmark_v7000_hybrid(seq_len: int, hidden_dim: int, batch_size: int = 8) -> dict:
    """Benchmark V7000 Hybrid."""
    model = V7000HybridBrain(
        input_dim=hidden_dim,
        hidden_dim=hidden_dim,
        output_dim=10,
        sparse_interval=20,  # Resonancia solo cada 20 pasos
        device=DEVICE
    )
    
    x = torch.randn(batch_size, seq_len, hidden_dim, device=DEVICE)
    
    torch.cuda.synchronize() if DEVICE == 'cuda' else None
    torch.cuda.reset_peak_memory_stats() if DEVICE == 'cuda' else None
    
    start = time.time()
    with torch.no_grad():
        for _ in range(3):
            out, stats = model(x)
    torch.cuda.synchronize() if DEVICE == 'cuda' else None
    elapsed = (time.time() - start) / 3
    
    mem = torch.cuda.max_memory_allocated() / 1e6 if DEVICE == 'cuda' else 0
    
    return {
        'model': 'V7000-Hybrid',
        'time_ms': elapsed * 1000,
        'memory_MB': mem,
        'cortex_rate': stats['activation_rate']
    }


def benchmark_v7000_parallel(seq_len: int, hidden_dim: int, batch_size: int = 8) -> dict:
    """Benchmark V7000 Full Parallel."""
    model = V7000FullParallel(
        input_dim=hidden_dim,
        hidden_dim=hidden_dim,
        output_dim=10,
        device=DEVICE
    )
    
    x = torch.randn(batch_size, seq_len, hidden_dim, device=DEVICE)
    
    torch.cuda.synchronize() if DEVICE == 'cuda' else None
    torch.cuda.reset_peak_memory_stats() if DEVICE == 'cuda' else None
    
    start = time.time()
    with torch.no_grad():
        for _ in range(3):
            out = model(x)
    torch.cuda.synchronize() if DEVICE == 'cuda' else None
    elapsed = (time.time() - start) / 3
    
    mem = torch.cuda.max_memory_allocated() / 1e6 if DEVICE == 'cuda' else 0
    
    return {
        'model': 'V7000-Parallel',
        'time_ms': elapsed * 1000,
        'memory_MB': mem
    }


def benchmark_transformer(seq_len: int, hidden_dim: int, batch_size: int = 8) -> dict:
    """Benchmark Transformer."""
    encoder_layer = nn.TransformerEncoderLayer(
        d_model=hidden_dim,
        nhead=8,
        dim_feedforward=hidden_dim * 4,
        batch_first=True,
        device=DEVICE
    )
    model = nn.TransformerEncoder(encoder_layer, num_layers=2).to(DEVICE)
    
    x = torch.randn(batch_size, seq_len, hidden_dim, device=DEVICE)
    
    torch.cuda.synchronize() if DEVICE == 'cuda' else None
    torch.cuda.reset_peak_memory_stats() if DEVICE == 'cuda' else None
    
    start = time.time()
    with torch.no_grad():
        for _ in range(3):
            out = model(x)
    torch.cuda.synchronize() if DEVICE == 'cuda' else None
    elapsed = (time.time() - start) / 3
    
    mem = torch.cuda.max_memory_allocated() / 1e6 if DEVICE == 'cuda' else 0
    
    return {
        'model': 'Transformer',
        'time_ms': elapsed * 1000,
        'memory_MB': mem
    }


# ==============================================================================
# TESTS
# ==============================================================================

def test_nback():
    """Test N-Back con V7000."""
    print("\nTEST: N-Back-8")
    print("-" * 40)
    
    vocab_size = 10
    n_samples = 200
    seq_len = 20
    n_back = 8
    
    X = torch.randint(0, vocab_size, (n_samples, seq_len))
    X_oh = F.one_hot(X, vocab_size).float().to(DEVICE)
    Y = X[:, -1-n_back].to(DEVICE)
    
    # V7000 Parallel
    model = V7000FullParallel(vocab_size, 128, vocab_size, device=DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=0.01)
    
    for epoch in range(150):
        opt.zero_grad()
        out = model(X_oh)[:, -1, :]
        loss = F.cross_entropy(out, Y)
        loss.backward()
        opt.step()
    
    with torch.no_grad():
        acc = (model(X_oh)[:, -1, :].argmax(dim=-1) == Y).float().mean().item()
    
    print(f"  V7000-Parallel N-Back-8: {acc:.2%}")
    return acc


def test_xor():
    """Test XOR con V7000."""
    print("\nTEST: XOR-8")
    print("-" * 40)
    
    n_samples = 500
    n_bits = 8
    
    X = torch.randint(0, 2, (n_samples, n_bits)).float().to(DEVICE)
    Y = (X.sum(dim=1) % 2).long().to(DEVICE)
    
    model = V7000FullParallel(n_bits, 64, 2, device=DEVICE)
    opt = torch.optim.Adam(model.parameters(), lr=0.01)
    
    for epoch in range(150):
        opt.zero_grad()
        out = model(X.unsqueeze(1))[:, -1, :]
        loss = F.cross_entropy(out, Y)
        loss.backward()
        opt.step()
    
    with torch.no_grad():
        acc = (model(X.unsqueeze(1))[:, -1, :].argmax(dim=-1) == Y).float().mean().item()
    
    print(f"  V7000-Parallel XOR-8: {acc:.2%}")
    return acc


# ==============================================================================
# MAIN
# ==============================================================================

if __name__ == "__main__":
    print("="*70)
    print("V7000 HYBRID BRAIN - BENCHMARK")
    print("="*70)
    
    test_xor()
    test_nback()
    
    print("\n" + "="*70)
    print("BENCHMARK: Seq=1000, Dim=256")
    print("="*70)
    
    torch.cuda.reset_peak_memory_stats() if DEVICE == 'cuda' else None
    r_parallel = benchmark_v7000_parallel(1000, 256)
    print(f"  V7000-Parallel: {r_parallel['time_ms']:.1f}ms, {r_parallel['memory_MB']:.1f}MB")
    
    torch.cuda.reset_peak_memory_stats() if DEVICE == 'cuda' else None
    r_hybrid = benchmark_v7000_hybrid(1000, 256)
    print(f"  V7000-Hybrid:   {r_hybrid['time_ms']:.1f}ms, {r_hybrid['memory_MB']:.1f}MB, "
          f"cortex={r_hybrid['cortex_rate']:.0%}")
    
    torch.cuda.reset_peak_memory_stats() if DEVICE == 'cuda' else None
    r_tf = benchmark_transformer(1000, 256)
    print(f"  Transformer:    {r_tf['time_ms']:.1f}ms, {r_tf['memory_MB']:.1f}MB")
    
    print("\n" + "="*70)
    print("COMPARACIÓN")
    print("="*70)
    speedup_parallel = r_tf['time_ms'] / r_parallel['time_ms']
    speedup_hybrid = r_tf['time_ms'] / r_hybrid['time_ms']
    print(f"  V7000-Parallel vs Transformer: {speedup_parallel:.2f}x")
    print(f"  V7000-Hybrid vs Transformer:   {speedup_hybrid:.2f}x")
    print("="*70)
