"""
Exp34: Benchmark Cyborg — Simbiosis
====================================

Mide lo que importa: la SIMBIOSIS entre El Logico (GRU) y El Biologico (Organ),
no cada parte aislada en tareas equivocadas.

4 Pruebas:

1. "El Logico Solo" (GRU sin organo)
   - Tarea: XOR multidimensional (tarea discreta — terreno del GRU)
   - Compara: GRU solo vs Cyborg completo
   - Hipotesis: GRU resuelve XOR, Cyborg lo resuelve igual o mejor

2. "El Biologico Solo" (Organo sin GRU)
   - Tarea: Deteccion de regimen en serie temporal (tarea continua — terreno del organo)
   - Compara: Organo solo vs Cyborg completo
   - Hipotesis: Organo detecta patrones, Cyborg los usa para decidir

3. "La Simbiosis" (tarea que NINGUNO resuelve solo)
   - Tarea: Patron continuo cambiante + memoria secuencial de regimenes
   - El organo detecta el regimen (continuo), el GRU recuerda la secuencia (discreto)
   - Hipotesis: Solo el Cyborg resuelve ambos aspectos

4. "El Protocolo" (¿T aprende a enrutar?)
   - Mide evolucion de T durante entrenamiento
   - Participation ratio, distribucion de T, correlacion T↔tarea

Correcciones vs Exp34 original:
  - XOR: pair_indices fijo (no depende del seed de datos)
  - Datos: 2000 train / 500 test
  - Regularizacion: weight_decay=1e-4
  - Modelos GRU-only y Organ-only para comparar
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import json
import math
from datetime import datetime
from pathlib import Path

from SKYNET_V28_PHYSICAL_CYBORG import (
    SKYNET_V28_PHYSICAL_CYBORG,
    BiphasicOrgan,
    MexicanHatReadout,
)

LOG_DIR = Path(__file__).parent
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

D_STATE = 64
D_MODEL = 128
N_INPUT = 32       # Reducido: no necesitamos 658 features para benchmark
N_EPOCHS = 50
BATCH_SIZE = 64
WEIGHT_DECAY = 1e-4
LR = 1e-3

# XOR pair indices FIJOS (fuera del seed de datos) — corrige bug original
XOR_PAIR_INDICES = np.array([[0, 1], [2, 3], [4, 5], [6, 7]])


# ============================================================
# MODELOS ABLACION
# ============================================================

class GRUOnly(nn.Module):
    """
    El Logico Solo: GRU cortex + readout, SIN organo bifasico.
    Mismo d_model que el Cyborg para comparacion justa.
    """
    def __init__(self, n_input, n_actions, d_model=D_MODEL):
        super().__init__()
        self.d_model = d_model
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        self.cortex = nn.GRU(d_model, d_model, batch_first=True)
        self.cortex_state = None
        self.readout = nn.Linear(d_model, n_actions)

        with torch.no_grad():
            self.readout.weight.data.normal_(0, 0.01)

    def reset(self):
        self.cortex_state = None

    def detach_states(self):
        if self.cortex_state is not None:
            self.cortex_state = self.cortex_state.detach()

    def forward(self, x, **kwargs):
        B = x.shape[0]
        h_input = self.input_norm(self.input_proj(x))

        if self.cortex_state is None or self.cortex_state.shape[1] != B:
            self.cortex_state = torch.zeros(1, B, self.d_model, device=x.device)

        h_ctx, self.cortex_state = self.cortex(
            h_input.unsqueeze(1), self.cortex_state
        )
        h_ctx = h_ctx.squeeze(1)
        logits = self.readout(h_ctx)
        probs = F.softmax(logits, dim=-1)
        entropy = -(probs * torch.log(probs + 1e-6)).sum(dim=-1, keepdim=True)

        return {
            'logits': logits,
            'probs': probs,
            'value': torch.zeros(B, 1, device=x.device),
            'entropy': entropy,
            'audit': {'T_mean': 0.0, 'h_bimodal': 0.0},
        }


class OrganOnly(nn.Module):
    """
    El Biologico Solo: BiphasicOrgan + readout lineal, SIN GRU.
    Recibe input directo, evoluciona fisica, readout lineal sobre h_phys.
    """
    def __init__(self, n_input, n_actions, d_model=D_MODEL, d_state=D_STATE):
        super().__init__()
        self.d_model = d_model
        self.d_state = d_state

        # Proyeccion de input a d_model (el organ espera d_cortex=d_model)
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)

        # Organo bifasico (usa input proyectado como "cortex falso")
        self.organ = BiphasicOrgan(d_cortex=d_model, d_state=d_state)

        # Readout lineal directo desde h_phys
        self.readout = nn.Linear(d_state, n_actions)

        with torch.no_grad():
            self.readout.weight.data.normal_(0, 0.01)

    def reset(self):
        self.organ.reset()

    def detach_states(self):
        if self.organ.h_phys is not None:
            self.organ.h_phys = self.organ.h_phys.detach()

    def forward(self, x, **kwargs):
        B = x.shape[0]
        h_input = self.input_norm(self.input_proj(x))

        # El organ usa h_input como si fuera h_cortex
        h_phys, T_mean, audit = self.organ(h_input)

        logits = self.readout(h_phys)
        probs = F.softmax(logits, dim=-1)
        entropy = -(probs * torch.log(probs + 1e-6)).sum(dim=-1, keepdim=True)

        return {
            'logits': logits,
            'probs': probs,
            'value': torch.zeros(B, 1, device=x.device),
            'entropy': entropy,
            'audit': audit,
        }


class CyborgBenchmark(nn.Module):
    """
    Cyborg completo para benchmark: misma arquitectura V28
    pero con n_input reducido para benchmark.
    """
    def __init__(self, n_input, n_actions, d_model=D_MODEL, d_state=D_STATE):
        super().__init__()
        self.model = SKYNET_V28_PHYSICAL_CYBORG(
            n_input=n_input, n_actions=n_actions,
            d_model=d_model, d_state=d_state, device=DEVICE
        )

    def reset(self):
        self.model.reset()

    def detach_states(self):
        self.model.detach_states()

    def forward(self, x, **kwargs):
        return self.model(x, training=kwargs.get('training', True))


# ============================================================
# TASK GENERATORS
# ============================================================

def generate_xor_data(n_samples, n_features=16, n_classes=4, seed=42):
    """
    XOR Multidimensional: NOT linearly separable.
    pair_indices es FIJO (XOR_PAIR_INDICES) — no depende del seed.
    El seed solo controla los datos aleatorios.
    """
    torch.manual_seed(seed)

    X = torch.randn(n_samples, N_INPUT) * 0.5
    # Features clave son binarias
    for i in range(n_features):
        X[:, i] = (torch.randn(n_samples) > 0).float()

    Y = torch.zeros(n_samples, dtype=torch.long)
    for i in range(n_samples):
        xor_bits = []
        for c in range(n_classes):
            a = X[i, XOR_PAIR_INDICES[c, 0]].item() > 0.5
            b = X[i, XOR_PAIR_INDICES[c, 1]].item() > 0.5
            xor_bits.append(int(a) ^ int(b))
        Y[i] = sum(b * (2 ** idx) for idx, b in enumerate(xor_bits)) % n_classes

    return X, Y


def generate_regime_data(n_samples, seq_len=20, n_regimes=4, seed=42):
    """
    Deteccion de Regimen Continuo: tarea para El Biologico.
    Serie temporal con diferentes distribuciones estadisticas (no clases discretas).
    El modelo debe clasificar QUE tipo de dinamica genera la serie.

    Regimenes:
      0: Oscilacion lenta (baja freq, alta amplitud)
      1: Ruido rapido (alta freq, baja amplitud)
      2: Drift lineal (tendencia + ruido)
      3: Intermitencia (bursts esporadicos)
    """
    torch.manual_seed(seed)
    all_sequences = []
    all_targets = []

    for _ in range(n_samples):
        regime = torch.randint(0, n_regimes, (1,)).item()
        t = torch.linspace(0, 2 * math.pi, seq_len)
        seq = []

        for step in range(seq_len):
            x = torch.randn(N_INPUT) * 0.1  # base noise

            if regime == 0:  # Oscilacion lenta
                x[:8] += 0.8 * torch.sin(t[step] * 0.5 + torch.randn(8) * 0.1)
            elif regime == 1:  # Ruido rapido
                x[:8] += 0.3 * torch.sin(t[step] * 5.0 + torch.randn(8) * 0.5)
            elif regime == 2:  # Drift lineal
                x[:8] += 0.5 * (step / seq_len) + torch.randn(8) * 0.05
            elif regime == 3:  # Intermitencia (bursts)
                if step % 5 == 0:
                    x[:8] += torch.randn(8) * 1.5
                else:
                    x[:8] += torch.randn(8) * 0.05

            seq.append(x)

        all_sequences.append(seq)
        all_targets.append(regime)

    return all_sequences, torch.tensor(all_targets)


def generate_symbiosis_data(n_samples, seq_len=15, n_regimes=3, seed=42):
    """
    Tarea de SIMBIOSIS: necesita AMBOS mundos.

    Serie temporal con regimen cambiante. El modelo debe:
    1. DETECTAR el regimen actual (continuo — trabajo del Biologico)
    2. RECORDAR el regimen de hace N pasos (discreto — trabajo del Logico)
    3. Responder: ¿el regimen actual es IGUAL al de hace 5 pasos?

    Clase 0: Mismo regimen (actual == hace 5 pasos)
    Clase 1: Diferente regimen

    Solo el Cyborg puede: el Organ detecta el regimen, el GRU recuerda.
    """
    torch.manual_seed(seed)
    delay = 5

    all_sequences = []
    all_targets = []

    for _ in range(n_samples):
        # Genera secuencia de regimenes (puede cambiar cada 3-5 pasos)
        regimes = []
        current_regime = torch.randint(0, n_regimes, (1,)).item()
        for step in range(seq_len):
            if step > 0 and torch.rand(1).item() < 0.25:
                current_regime = torch.randint(0, n_regimes, (1,)).item()
            regimes.append(current_regime)

        # Genera la serie temporal segun los regimenes
        t = torch.linspace(0, 4 * math.pi, seq_len)
        seq = []
        for step in range(seq_len):
            x = torch.randn(N_INPUT) * 0.05
            r = regimes[step]

            if r == 0:  # Oscilacion
                x[:8] += 0.7 * torch.sin(t[step] * 0.5 + torch.randn(8) * 0.1)
                x[8:16] += 0.2
            elif r == 1:  # Ruido
                x[:8] += torch.randn(8) * 0.4
                x[8:16] -= 0.2
            elif r == 2:  # Drift
                x[:8] += 0.3 * (step / seq_len)
                x[8:16] += 0.5 * torch.sin(t[step] * 2.0)

            seq.append(x)

        # Target: ¿regimen actual == regimen de hace `delay` pasos?
        current = regimes[-1]
        past = regimes[max(0, seq_len - 1 - delay)]
        target = 0 if current == past else 1

        all_sequences.append(seq)
        all_targets.append(target)

    return all_sequences, torch.tensor(all_targets)


# ============================================================
# HELPERS
# ============================================================

def compute_participation_ratio(h_samples):
    """Participation ratio (dimension efectiva del estado)."""
    if len(h_samples) < 2:
        return 1.0
    H = torch.stack(h_samples)
    H = H - H.mean(dim=0, keepdim=True)
    cov = (H.T @ H) / (H.shape[0] - 1)
    eigenvalues = torch.linalg.eigvalsh(cov).clamp(min=0)
    total = eigenvalues.sum()
    if total < 1e-8:
        return 1.0
    return ((total ** 2) / (eigenvalues ** 2).sum()).item()


def create_model(model_type, n_actions, device=DEVICE):
    """Create a model of the specified type."""
    if model_type == 'cyborg':
        model = CyborgBenchmark(N_INPUT, n_actions).to(device)
    elif model_type == 'gru_only':
        model = GRUOnly(N_INPUT, n_actions).to(device)
    elif model_type == 'organ_only':
        model = OrganOnly(N_INPUT, n_actions).to(device)
    else:
        raise ValueError(f"Unknown model type: {model_type}")
    return model


def count_params(model):
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


# ============================================================
# PRUEBA 1: El Logico Solo (XOR)
# ============================================================

def test_logico_solo():
    """
    XOR Multidimensional: tarea discreta (terreno del GRU).
    GRU solo deberia resolver, Cyborg deberia resolver igual o mejor.
    """
    print("\n" + "=" * 60)
    print("PRUEBA 1: El Logico Solo (XOR Multidimensional)")
    print("=" * 60)

    n_classes = 4
    n_train, n_test = 2000, 500

    X_train, Y_train = generate_xor_data(n_train, n_classes=n_classes, seed=42)
    X_test, Y_test = generate_xor_data(n_test, n_classes=n_classes, seed=123)
    X_train, Y_train = X_train.to(DEVICE), Y_train.to(DEVICE)
    X_test, Y_test = X_test.to(DEVICE), Y_test.to(DEVICE)

    results = {}
    for model_type in ['gru_only', 'cyborg']:
        label = 'GRU Solo' if model_type == 'gru_only' else 'Cyborg'
        print(f"\n  [{label}]")

        model = create_model(model_type, n_classes)
        n_params = count_params(model)
        print(f"    Params: {n_params:,}")

        optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
        criterion = nn.CrossEntropyLoss()

        curves = {'accuracy': [], 'loss': []}
        epochs_to_80 = N_EPOCHS

        for epoch in range(N_EPOCHS):
            model.train()
            perm = torch.randperm(n_train)
            total_loss = 0
            correct = 0

            for i in range(0, n_train, BATCH_SIZE):
                model.reset()
                xb = X_train[perm[i:i+BATCH_SIZE]]
                yb = Y_train[perm[i:i+BATCH_SIZE]]
                out = model(xb, training=True)
                loss = criterion(out['logits'][:, :n_classes], yb)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                model.detach_states()
                total_loss += loss.item()
                correct += (out['logits'][:, :n_classes].argmax(-1) == yb).sum().item()

            acc = correct / n_train * 100
            curves['accuracy'].append(acc)
            curves['loss'].append(total_loss)

            if acc >= 80 and epochs_to_80 == N_EPOCHS:
                epochs_to_80 = epoch + 1

            if (epoch + 1) % 10 == 0:
                print(f"    Ep{epoch+1}: acc={acc:.1f}%")

        # Test
        model.eval()
        model.reset()
        with torch.no_grad():
            out = model(X_test, training=False)
        test_acc = (out['logits'][:, :n_classes].argmax(-1) == Y_test).float().mean().item() * 100

        print(f"    Test Acc: {test_acc:.1f}%, Epochs to 80%: {epochs_to_80}")

        results[model_type] = {
            'test_acc': test_acc,
            'epochs_to_80': epochs_to_80,
            'n_params': n_params,
            'curves': curves,
        }

    return results


# ============================================================
# PRUEBA 2: El Biologico Solo (Deteccion de Regimen)
# ============================================================

def test_biologico_solo():
    """
    Deteccion de regimen en serie temporal: tarea continua (terreno del organo).
    Organ solo deberia detectar, Cyborg deberia decidir mejor.
    """
    print("\n" + "=" * 60)
    print("PRUEBA 2: El Biologico Solo (Deteccion de Regimen)")
    print("=" * 60)

    n_regimes = 4
    seq_len = 20
    n_train, n_test = 2000, 500

    train_seqs, train_Y = generate_regime_data(n_train, seq_len, n_regimes, seed=42)
    test_seqs, test_Y = generate_regime_data(n_test, seq_len, n_regimes, seed=123)
    train_Y = train_Y.to(DEVICE)
    test_Y = test_Y.to(DEVICE)

    results = {}
    for model_type in ['organ_only', 'cyborg']:
        label = 'Organ Solo' if model_type == 'organ_only' else 'Cyborg'
        print(f"\n  [{label}]")

        model = create_model(model_type, n_regimes)
        n_params = count_params(model)
        print(f"    Params: {n_params:,}")

        optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
        criterion = nn.CrossEntropyLoss()

        curves = {'accuracy': [], 'loss': []}
        epochs_to_80 = N_EPOCHS

        for epoch in range(N_EPOCHS):
            model.train()
            perm = torch.randperm(n_train).tolist()
            correct = 0
            total_loss = 0

            for idx in range(0, n_train, BATCH_SIZE):
                batch_idx = perm[idx:idx+BATCH_SIZE]
                bs = len(batch_idx)
                model.reset()

                # Alimentar secuencia paso a paso
                for t in range(seq_len):
                    x_batch = torch.stack([train_seqs[i][t] for i in batch_idx]).to(DEVICE)
                    out = model(x_batch, training=True)

                y_batch = train_Y[batch_idx]
                loss = criterion(out['logits'][:, :n_regimes], y_batch)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                model.detach_states()

                preds = out['logits'][:, :n_regimes].argmax(-1)
                correct += (preds == y_batch).sum().item()
                total_loss += loss.item()

            acc = correct / n_train * 100
            curves['accuracy'].append(acc)
            curves['loss'].append(total_loss)

            if acc >= 80 and epochs_to_80 == N_EPOCHS:
                epochs_to_80 = epoch + 1

            if (epoch + 1) % 10 == 0:
                print(f"    Ep{epoch+1}: acc={acc:.1f}%")

        # Test
        model.eval()
        test_correct = 0
        for i in range(0, n_test, BATCH_SIZE):
            batch_end = min(i + BATCH_SIZE, n_test)
            batch_idx = list(range(i, batch_end))
            model.reset()
            with torch.no_grad():
                for t in range(seq_len):
                    x_batch = torch.stack([test_seqs[j][t] for j in batch_idx]).to(DEVICE)
                    out = model(x_batch, training=False)
            preds = out['logits'][:, :n_regimes].argmax(-1)
            test_correct += (preds == test_Y[batch_idx]).sum().item()

        test_acc = test_correct / n_test * 100
        print(f"    Test Acc: {test_acc:.1f}%, Epochs to 80%: {epochs_to_80}")

        results[model_type] = {
            'test_acc': test_acc,
            'epochs_to_80': epochs_to_80,
            'n_params': n_params,
            'curves': curves,
        }

    return results


# ============================================================
# PRUEBA 3: La Simbiosis (tarea que NINGUNO resuelve solo)
# ============================================================

def test_simbiosis():
    """
    Patron continuo + memoria secuencial: necesita AMBOS mundos.
    Detectar regimen (continuo) + recordar regimen pasado (discreto).
    Solo el Cyborg deberia resolver ambos aspectos.
    """
    print("\n" + "=" * 60)
    print("PRUEBA 3: La Simbiosis (Patron + Memoria)")
    print("=" * 60)

    n_classes = 2  # mismo/diferente regimen
    seq_len = 15
    n_train, n_test = 2000, 500

    train_seqs, train_Y = generate_symbiosis_data(n_train, seq_len, seed=42)
    test_seqs, test_Y = generate_symbiosis_data(n_test, seq_len, seed=123)
    train_Y = train_Y.to(DEVICE)
    test_Y = test_Y.to(DEVICE)

    results = {}
    for model_type in ['gru_only', 'organ_only', 'cyborg']:
        label = {'gru_only': 'GRU Solo', 'organ_only': 'Organ Solo',
                 'cyborg': 'Cyborg'}[model_type]
        print(f"\n  [{label}]")

        model = create_model(model_type, n_classes)
        n_params = count_params(model)
        print(f"    Params: {n_params:,}")

        optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
        criterion = nn.CrossEntropyLoss()

        curves = {'accuracy': [], 'loss': []}
        epochs_to_80 = N_EPOCHS

        for epoch in range(N_EPOCHS):
            model.train()
            perm = torch.randperm(n_train).tolist()
            correct = 0
            total_loss = 0

            for idx in range(0, n_train, BATCH_SIZE):
                batch_idx = perm[idx:idx+BATCH_SIZE]
                bs = len(batch_idx)
                model.reset()

                for t in range(seq_len):
                    x_batch = torch.stack([train_seqs[i][t] for i in batch_idx]).to(DEVICE)
                    out = model(x_batch, training=True)

                y_batch = train_Y[batch_idx]
                loss = criterion(out['logits'][:, :n_classes], y_batch)
                optimizer.zero_grad()
                loss.backward()
                optimizer.step()
                model.detach_states()

                preds = out['logits'][:, :n_classes].argmax(-1)
                correct += (preds == y_batch).sum().item()
                total_loss += loss.item()

            acc = correct / n_train * 100
            curves['accuracy'].append(acc)
            curves['loss'].append(total_loss)

            if acc >= 80 and epochs_to_80 == N_EPOCHS:
                epochs_to_80 = epoch + 1

            if (epoch + 1) % 10 == 0:
                print(f"    Ep{epoch+1}: acc={acc:.1f}%")

        # Test
        model.eval()
        test_correct = 0
        for i in range(0, n_test, BATCH_SIZE):
            batch_end = min(i + BATCH_SIZE, n_test)
            batch_idx = list(range(i, batch_end))
            model.reset()
            with torch.no_grad():
                for t in range(seq_len):
                    x_batch = torch.stack([test_seqs[j][t] for j in batch_idx]).to(DEVICE)
                    out = model(x_batch, training=False)
            preds = out['logits'][:, :n_classes].argmax(-1)
            test_correct += (preds == test_Y[batch_idx]).sum().item()

        test_acc = test_correct / n_test * 100
        print(f"    Test Acc: {test_acc:.1f}%, Epochs to 80%: {epochs_to_80}")

        results[model_type] = {
            'test_acc': test_acc,
            'epochs_to_80': epochs_to_80,
            'n_params': n_params,
            'curves': curves,
        }

    return results


# ============================================================
# PRUEBA 4: El Protocolo (¿T aprende a enrutar?)
# ============================================================

def test_protocolo():
    """
    Analiza como evoluciona T durante el entrenamiento del Cyborg
    en la tarea de simbiosis.
    - ¿T se enfria en dimensiones de memoria?
    - Participation ratio de T
    - Distribucion de T al inicio vs al final
    """
    print("\n" + "=" * 60)
    print("PRUEBA 4: El Protocolo (Evolucion de T)")
    print("=" * 60)

    n_classes = 2
    seq_len = 15
    n_train = 2000

    train_seqs, train_Y = generate_symbiosis_data(n_train, seq_len, seed=42)
    train_Y = train_Y.to(DEVICE)

    model = CyborgBenchmark(N_INPUT, n_classes).to(DEVICE)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    criterion = nn.CrossEntropyLoss()

    T_history = []      # T_mean per epoch
    T_std_history = []   # T_std per epoch
    T_distributions = {} # snapshots of T at key epochs
    pr_history = []      # participation ratio per epoch

    for epoch in range(N_EPOCHS):
        model.model.train()
        perm = torch.randperm(n_train).tolist()
        correct = 0
        epoch_T_means = []
        epoch_T_stds = []
        h_samples = []

        for idx in range(0, n_train, BATCH_SIZE):
            batch_idx = perm[idx:idx+BATCH_SIZE]
            model.reset()

            for t in range(seq_len):
                x_batch = torch.stack([train_seqs[i][t] for i in batch_idx]).to(DEVICE)
                out = model(x_batch, training=True)

            y_batch = train_Y[batch_idx]
            loss = criterion(out['logits'][:, :n_classes], y_batch)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            model.model.detach_states()

            preds = out['logits'][:, :n_classes].argmax(-1)
            correct += (preds == y_batch).sum().item()
            epoch_T_means.append(out['audit']['T_mean'])
            epoch_T_stds.append(out['audit'].get('T_std', 0.0))

            # Capturar h_phys para participation ratio
            if model.model.organ.h_phys is not None:
                h_samples.append(model.model.organ.h_phys.detach().cpu())

        acc = correct / n_train * 100
        T_mean = np.mean(epoch_T_means)
        T_std = np.mean(epoch_T_stds)
        T_history.append(T_mean)
        T_std_history.append(T_std)

        # Participation ratio
        if h_samples:
            h_all = torch.cat(h_samples, dim=0)
            pr = compute_participation_ratio(list(h_all[-100:]))
            pr_history.append(pr)
        else:
            pr_history.append(0)

        # Snapshot T distribution at key epochs
        if epoch in [0, N_EPOCHS // 4, N_EPOCHS // 2, N_EPOCHS - 1]:
            # Get T vector from one forward pass
            model.reset()
            with torch.no_grad():
                x_sample = torch.stack([train_seqs[0][t] for t in range(seq_len)]).to(DEVICE)
                for t in range(seq_len):
                    out_snap = model(x_sample[t:t+1], training=False)
            # Get T from organ's temp controller
            h_ctx_snap = model.model.cortex_state.squeeze(0) if model.model.cortex_state is not None else torch.zeros(1, D_MODEL, device=DEVICE)
            h_phys_snap = model.model.organ.h_phys if model.model.organ.h_phys is not None else torch.zeros(1, D_STATE, device=DEVICE)
            with torch.no_grad():
                T_vec = model.model.organ.temp_ctrl(h_ctx_snap, h_phys_snap)
            T_distributions[f'epoch_{epoch}'] = T_vec.cpu().numpy().flatten().tolist()

        if (epoch + 1) % 10 == 0:
            print(f"    Ep{epoch+1}: acc={acc:.1f}%, T_mean={T_mean:.3f}, "
                  f"T_std={T_std:.3f}, PR={pr_history[-1]:.1f}")

    results = {
        'T_history': T_history,
        'T_std_history': T_std_history,
        'T_distributions': T_distributions,
        'pr_history': pr_history,
        'T_initial': T_history[0],
        'T_final': T_history[-1],
        'T_delta': T_history[-1] - T_history[0],
        'PR_initial': pr_history[0],
        'PR_final': pr_history[-1],
    }

    print(f"\n  T: {T_history[0]:.3f} -> {T_history[-1]:.3f} "
          f"(delta={T_history[-1] - T_history[0]:+.3f})")
    print(f"  PR: {pr_history[0]:.1f} -> {pr_history[-1]:.1f}")

    return results


# ============================================================
# MAIN RUNNER
# ============================================================

def run_all():
    print("=" * 70)
    print("EXP34: BENCHMARK CYBORG — SIMBIOSIS")
    print(f"Device: {DEVICE}")
    print(f"N_INPUT={N_INPUT}, D_MODEL={D_MODEL}, D_STATE={D_STATE}")
    print(f"N_EPOCHS={N_EPOCHS}, BATCH_SIZE={BATCH_SIZE}")
    print(f"LR={LR}, WEIGHT_DECAY={WEIGHT_DECAY}")
    print("=" * 70)

    results = {}

    # Prueba 1: El Logico Solo
    results['test1_logico'] = test_logico_solo()

    # Prueba 2: El Biologico Solo
    results['test2_biologico'] = test_biologico_solo()

    # Prueba 3: La Simbiosis
    results['test3_simbiosis'] = test_simbiosis()

    # Prueba 4: El Protocolo
    results['test4_protocolo'] = test_protocolo()

    # Save
    save_results(results)
    print_summary(results)

    return results


def save_results(results):
    """Save log and plot."""
    log_path = LOG_DIR / 'exp34_hard_bio_benchmark.log'

    # Clean for JSON (remove non-serializable items)
    def clean(obj):
        if isinstance(obj, dict):
            return {k: clean(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean(v) for v in obj]
        elif isinstance(obj, (np.floating, np.integer)):
            return float(obj)
        elif isinstance(obj, np.ndarray):
            return obj.tolist()
        elif isinstance(obj, torch.Tensor):
            return obj.item() if obj.numel() == 1 else obj.tolist()
        return obj

    report = {
        'experiment': 'Exp34: Benchmark Cyborg - Simbiosis',
        'timestamp': datetime.now().isoformat(),
        'device': DEVICE,
        'config': {
            'N_INPUT': N_INPUT, 'D_MODEL': D_MODEL, 'D_STATE': D_STATE,
            'N_EPOCHS': N_EPOCHS, 'BATCH_SIZE': BATCH_SIZE,
            'LR': LR, 'WEIGHT_DECAY': WEIGHT_DECAY,
        },
        'results': clean(results),
    }

    with open(log_path, 'w') as f:
        f.write(json.dumps(report, indent=2, default=str))
    print(f"\n[SAVED] {log_path}")

    # Plot
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.suptitle('Exp34: Benchmark Cyborg — Simbiosis', fontsize=14, fontweight='bold')

        colors = {'gru_only': '#2196F3', 'organ_only': '#4CAF50', 'cyborg': '#E91E63'}
        labels = {'gru_only': 'GRU Solo', 'organ_only': 'Organ Solo', 'cyborg': 'Cyborg'}

        # Panel 1: XOR (El Logico)
        ax = axes[0, 0]
        r1 = results['test1_logico']
        for mt in ['gru_only', 'cyborg']:
            if mt in r1 and 'curves' in r1[mt]:
                ax.plot(r1[mt]['curves']['accuracy'], color=colors[mt], label=labels[mt])
        ax.axhline(y=80, color='gray', linestyle='--', alpha=0.5)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Train Accuracy (%)')
        ax.set_title('Prueba 1: El Logico Solo (XOR)')
        ax.legend()

        # Panel 2: Regimen (El Biologico)
        ax = axes[0, 1]
        r2 = results['test2_biologico']
        for mt in ['organ_only', 'cyborg']:
            if mt in r2 and 'curves' in r2[mt]:
                ax.plot(r2[mt]['curves']['accuracy'], color=colors[mt], label=labels[mt])
        ax.axhline(y=80, color='gray', linestyle='--', alpha=0.5)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Train Accuracy (%)')
        ax.set_title('Prueba 2: El Biologico Solo (Regimen)')
        ax.legend()

        # Panel 3: Simbiosis
        ax = axes[1, 0]
        r3 = results['test3_simbiosis']
        for mt in ['gru_only', 'organ_only', 'cyborg']:
            if mt in r3 and 'curves' in r3[mt]:
                ax.plot(r3[mt]['curves']['accuracy'], color=colors[mt], label=labels[mt])
        ax.axhline(y=80, color='gray', linestyle='--', alpha=0.5)
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Train Accuracy (%)')
        ax.set_title('Prueba 3: La Simbiosis (Patron + Memoria)')
        ax.legend()

        # Panel 4: Protocolo (T evolution)
        ax = axes[1, 1]
        r4 = results['test4_protocolo']
        ax.plot(r4['T_history'], color='#FF5722', label='T_mean')
        ax.plot(r4['T_std_history'], color='#FF9800', linestyle='--', label='T_std')
        ax2 = ax.twinx()
        ax2.plot(r4['pr_history'], color='#9C27B0', alpha=0.7, label='PR')
        ax2.set_ylabel('Participation Ratio', color='#9C27B0')
        ax.set_xlabel('Epoch')
        ax.set_ylabel('Temperature')
        ax.set_title('Prueba 4: El Protocolo (T Evoluciona)')
        lines1, labs1 = ax.get_legend_handles_labels()
        lines2, labs2 = ax2.get_legend_handles_labels()
        ax.legend(lines1 + lines2, labs1 + labs2, loc='upper right')

        plt.tight_layout()
        png_path = LOG_DIR / 'exp34_hard_bio_benchmark.png'
        plt.savefig(png_path, dpi=150)
        print(f"[SAVED] {png_path}")
        plt.close()
    except ImportError:
        print("[SKIP] matplotlib not available")


def print_summary(results):
    print("\n" + "=" * 70)
    print("EXP34 SUMMARY: BENCHMARK CYBORG")
    print("=" * 70)

    # Test 1: El Logico
    r1 = results['test1_logico']
    print("\nPrueba 1 - El Logico Solo (XOR):")
    for mt in ['gru_only', 'cyborg']:
        r = r1[mt]
        label = 'GRU Solo' if mt == 'gru_only' else 'Cyborg  '
        print(f"  {label}: test_acc={r['test_acc']:.1f}%, "
              f"ep80={r['epochs_to_80']}, params={r['n_params']:,}")

    # Test 2: El Biologico
    r2 = results['test2_biologico']
    print("\nPrueba 2 - El Biologico Solo (Regimen):")
    for mt in ['organ_only', 'cyborg']:
        r = r2[mt]
        label = 'Organ Solo' if mt == 'organ_only' else 'Cyborg    '
        print(f"  {label}: test_acc={r['test_acc']:.1f}%, "
              f"ep80={r['epochs_to_80']}, params={r['n_params']:,}")

    # Test 3: La Simbiosis
    r3 = results['test3_simbiosis']
    print("\nPrueba 3 - La Simbiosis (Patron + Memoria):")
    for mt in ['gru_only', 'organ_only', 'cyborg']:
        r = r3[mt]
        label = {'gru_only': 'GRU Solo  ', 'organ_only': 'Organ Solo',
                 'cyborg': 'Cyborg    '}[mt]
        print(f"  {label}: test_acc={r['test_acc']:.1f}%, "
              f"ep80={r['epochs_to_80']}, params={r['n_params']:,}")

    # Verificar hipotesis de simbiosis
    cyborg_acc = r3['cyborg']['test_acc']
    gru_acc = r3['gru_only']['test_acc']
    organ_acc = r3['organ_only']['test_acc']

    print(f"\n  Hipotesis Simbiosis: Cyborg > GRU_solo Y Cyborg > Organ_solo")
    print(f"    Cyborg ({cyborg_acc:.1f}%) vs GRU ({gru_acc:.1f}%): "
          f"{'PASS' if cyborg_acc > gru_acc else 'FAIL'} "
          f"(delta={cyborg_acc - gru_acc:+.1f}%)")
    print(f"    Cyborg ({cyborg_acc:.1f}%) vs Organ ({organ_acc:.1f}%): "
          f"{'PASS' if cyborg_acc > organ_acc else 'FAIL'} "
          f"(delta={cyborg_acc - organ_acc:+.1f}%)")

    # Test 4: El Protocolo
    r4 = results['test4_protocolo']
    print(f"\nPrueba 4 - El Protocolo:")
    print(f"  T: {r4['T_initial']:.3f} -> {r4['T_final']:.3f} "
          f"(delta={r4['T_delta']:+.3f})")
    print(f"  PR: {r4['PR_initial']:.1f} -> {r4['PR_final']:.1f}")
    print(f"  T aprende a enrutar: "
          f"{'SI (T cambia)' if abs(r4['T_delta']) > 0.01 else 'NO (T estable)'}")

    print("\n" + "=" * 70)


if __name__ == "__main__":
    results = run_all()
