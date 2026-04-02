"""
Exp37: ORGAN-EXCLUSIVE BENCHMARK (v2 — Optimized)
====================================================
4 tareas DURAS donde la FISICA BIFASICA deberia superar a un GRU puro.
Version optimizada: 1 seed, menos muestras, tareas realmente discriminatorias.

T1: CATASTROPHIC FORGETTING — 5 tareas secuenciales (no 3), evaluar retencion
T2: MULTI-TIMESCALE — 6 clases (no 4), menos contexto, mas dificil
T3: CONTINUOUS ATTRACTOR — delay=20 (no 50), pero con DISTRACTORES fuertes
T4: PHASE TRANSITION — Ising batch-vectorized, clasificacion cerca de Tc
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.stdout.reconfigure(line_buffering=True)

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import json
import math
from datetime import datetime
from pathlib import Path
import time

from SKYNET_V28_PHYSICAL_CYBORG import (
    SKYNET_V28_PHYSICAL_CYBORG,
    BiphasicOrgan,
)

LOG_DIR = Path(__file__).parent
DATASET_DIR = Path(__file__).parent.parent / "dataset"
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'

D_STATE = 256
D_MODEL = 128
N_INPUT = 32
BATCH_SIZE = 256
MAX_EPOCHS = 60
PATIENCE = 8
LR = 1e-3
WEIGHT_DECAY = 1e-4

MODEL_TYPES = ['gru', 'organ', 'cyborg', 'cyborg_random']


# ============================================================
# MODELOS (compactos)
# ============================================================

class GRUOnly(nn.Module):
    def __init__(self, n_in, n_out, d=D_MODEL, bio_params=None):
        super().__init__()
        self.proj = nn.Linear(n_in, d)
        self.norm = nn.LayerNorm(d)
        self.gru = nn.GRU(d, d, batch_first=True)
        self.head = nn.Linear(d, n_out)
        self.h = None
        nn.init.normal_(self.head.weight, 0, 0.01)

    def reset(self):
        self.h = None

    def detach_states(self):
        if self.h is not None:
            self.h = self.h.detach()

    def forward(self, x, **kw):
        B = x.shape[0]
        h = self.norm(self.proj(x))
        if self.h is None or self.h.shape[1] != B:
            self.h = torch.zeros(1, B, h.shape[-1], device=x.device)
        out, self.h = self.gru(h.unsqueeze(1), self.h)
        return {'logits': self.head(out.squeeze(1)), 'audit': {'T_mean': 0, 'gate_mean': 0}}


class OrganOnly(nn.Module):
    def __init__(self, n_in, n_out, bio_params=None):
        super().__init__()
        self.proj = nn.Linear(n_in, D_MODEL)
        self.norm = nn.LayerNorm(D_MODEL)
        self.organ = BiphasicOrgan(d_cortex=D_MODEL, d_state=D_STATE, bio_params=bio_params)
        self.head = nn.Linear(D_STATE, n_out)
        nn.init.normal_(self.head.weight, 0, 0.01)

    def reset(self):
        self.organ.reset()

    def detach_states(self):
        if self.organ.h_phys is not None:
            self.organ.h_phys = self.organ.h_phys.detach()

    def forward(self, x, **kw):
        h = self.norm(self.proj(x))
        hp, T, audit = self.organ(h)
        return {'logits': self.head(hp), 'audit': audit}


class CyborgModel(nn.Module):
    def __init__(self, n_in, n_out, bio_params=None):
        super().__init__()
        self.m = SKYNET_V28_PHYSICAL_CYBORG(
            n_input=n_in, n_actions=n_out, d_model=D_MODEL,
            d_state=D_STATE, device=DEVICE, bio_params=bio_params)

    def reset(self):
        self.m.reset()

    def detach_states(self):
        self.m.detach_states()

    def forward(self, x, **kw):
        return self.m(x, training=kw.get('training', True))


def make_model(mt, n_in, n_out, bio=None):
    m = {'gru': GRUOnly, 'organ': OrganOnly, 'cyborg': CyborgModel,
         'cyborg_random': CyborgModel}[mt]
    bp = bio if mt in ('organ', 'cyborg') else None
    return m(n_in, n_out, bio_params=bp).to(DEVICE) if mt != 'cyborg_random' else m(n_in, n_out).to(DEVICE)


def load_bio():
    try:
        from bio_initializer import load_bio_params_scaled
        return load_bio_params_scaled(d_state=D_STATE, dataset_dir=DATASET_DIR)
    except Exception as e:
        print(f"  [WARN] No bio: {e}")
        return None


def train_sequential(model, train_seqs, train_Y, n_classes, seq_len):
    """Train model on sequential data. Returns test metrics."""
    opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    crit = nn.CrossEntropyLoss()
    n = len(train_seqs)
    best_loss = float('inf')
    wait = 0

    for ep in range(MAX_EPOCHS):
        model.train()
        perm = torch.randperm(n).tolist()
        correct = 0
        total_loss = 0

        for idx in range(0, n, BATCH_SIZE):
            bi = perm[idx:idx+BATCH_SIZE]
            model.reset()
            for t in range(seq_len):
                xb = torch.stack([train_seqs[i][t] for i in bi]).to(DEVICE)
                out = model(xb, training=True)
            yb = train_Y[bi]
            loss = crit(out['logits'][:, :n_classes], yb)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
            opt.step()
            model.detach_states()
            correct += (out['logits'][:, :n_classes].argmax(-1) == yb).sum().item()
            total_loss += loss.item()

        acc = correct / n * 100
        if total_loss < best_loss - 0.01:
            best_loss = total_loss
            wait = 0
        else:
            wait += 1
        if wait >= PATIENCE:
            break

        if (ep + 1) % 15 == 0:
            print(f"      Ep{ep+1}: acc={acc:.1f}%", flush=True)

    return ep + 1


def eval_sequential(model, test_seqs, test_Y, n_classes, seq_len):
    model.eval()
    correct = 0
    n = len(test_seqs)
    for i in range(0, n, BATCH_SIZE):
        bi = list(range(i, min(i + BATCH_SIZE, n)))
        model.reset()
        with torch.no_grad():
            for t in range(seq_len):
                xb = torch.stack([test_seqs[j][t] for j in bi]).to(DEVICE)
                out = model(xb, training=False)
        correct += (out['logits'][:, :n_classes].argmax(-1) == test_Y[bi]).sum().item()
    return correct / n * 100


# ============================================================
# T1: CATASTROPHIC FORGETTING (5 tareas, single-step — FAST)
# ============================================================

def test_forgetting():
    print("\n  T1: Catastrophic Forgetting (5 sequential tasks)", flush=True)
    t0 = time.time()
    rng = np.random.RandomState(42)
    n_tasks = 5
    n_classes = 4
    n_per = 600

    # Generate 5 tasks with different feature patterns
    tasks = []
    for tid in range(n_tasks):
        X = rng.randn(n_per, N_INPUT).astype(np.float32)
        # Each task uses 4 non-overlapping features
        f = (tid * 4) % (N_INPUT - 4)
        Y = ((X[:, f] > 0).astype(int) * 2 + (X[:, f+1] > 0).astype(int))
        tasks.append({
            'X_tr': torch.tensor(X[:400]).to(DEVICE),
            'Y_tr': torch.tensor(Y[:400], dtype=torch.long).to(DEVICE),
            'X_te': torch.tensor(X[400:]).to(DEVICE),
            'Y_te': torch.tensor(Y[400:], dtype=torch.long).to(DEVICE),
        })

    bio = load_bio()
    results = {}

    for mt in MODEL_TYPES:
        model = make_model(mt, N_INPUT, n_classes, bio)
        opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
        crit = nn.CrossEntropyLoss()
        np_ = sum(p.numel() for p in model.parameters() if p.requires_grad)

        retention = []
        for tid, task in enumerate(tasks):
            # Train on current task
            best_loss = float('inf')
            wait = 0
            for ep in range(MAX_EPOCHS):
                model.train()
                perm = torch.randperm(400)
                tl = 0
                for i in range(0, 400, BATCH_SIZE):
                    model.reset()
                    xb = task['X_tr'][perm[i:i+BATCH_SIZE]]
                    yb = task['Y_tr'][perm[i:i+BATCH_SIZE]]
                    out = model(xb, training=True)
                    loss = crit(out['logits'][:, :n_classes], yb)
                    opt.zero_grad()
                    loss.backward()
                    opt.step()
                    model.detach_states()
                    tl += loss.item()
                if tl < best_loss - 0.01:
                    best_loss = tl
                    wait = 0
                else:
                    wait += 1
                if wait >= PATIENCE:
                    break

            # Eval ALL previous tasks
            accs = []
            model.eval()
            for eid in range(tid + 1):
                model.reset()
                with torch.no_grad():
                    out = model(tasks[eid]['X_te'], training=False)
                a = (out['logits'][:, :n_classes].argmax(-1) == tasks[eid]['Y_te']).float().mean().item()
                accs.append(a * 100)
            retention.append(accs)

        # Key metric: retention of task 0 after all 5 tasks
        t0_final = retention[-1][0]
        avg_final = np.mean(retention[-1])
        results[mt] = {'task0_ret': t0_final, 'avg_ret': avg_final, 'params': np_}
        print(f"    {mt:15s}: T0={t0_final:5.1f}%, Avg={avg_final:5.1f}%, "
              f"params={np_:,}", flush=True)

    print(f"  T1 done in {time.time()-t0:.0f}s", flush=True)
    return results


# ============================================================
# T2: MULTI-TIMESCALE (6 classes, harder, shorter seq)
# ============================================================

def test_multiscale():
    print("\n  T2: Multi-Timescale Signal (6 classes, seq=40)", flush=True)
    t0 = time.time()
    rng = np.random.RandomState(42)
    seq_len = 40
    n_classes = 6
    n_train, n_test = 1200, 300

    def gen_data(n, seed):
        r = np.random.RandomState(seed)
        seqs, labs = [], []
        for _ in range(n):
            # 3 slow types x 2 fast types = 6 classes
            slow = r.randint(3)  # 0=none, 1=low, 2=high
            fast = r.randint(2)  # 0=low, 1=high
            label = slow * 2 + fast
            t = np.linspace(0, 6 * np.pi, seq_len)
            seq = []
            for s in range(seq_len):
                x = r.randn(N_INPUT).astype(np.float32) * 0.1
                # Slow component (dims 0-7)
                if slow == 1:
                    x[:8] += 0.3 * np.sin(0.08 * t[s] + r.randn(8)*0.02).astype(np.float32)
                elif slow == 2:
                    x[:8] += 0.8 * np.sin(0.08 * t[s] + r.randn(8)*0.02).astype(np.float32)
                # Fast component (dims 8-15)
                if fast == 0:
                    x[8:16] += 0.4 * np.sin(0.5 * t[s] + r.randn(8)*0.1).astype(np.float32)
                else:
                    x[8:16] += 0.4 * np.sin(2.0 * t[s] + r.randn(8)*0.1).astype(np.float32)
                # Dims 16-31: strong noise (distractors)
                x[16:] += r.randn(N_INPUT - 16).astype(np.float32) * 0.5
                seq.append(torch.tensor(x))
            seqs.append(seq)
            labs.append(label)
        return seqs, torch.tensor(labs, dtype=torch.long)

    tr_s, tr_y = gen_data(n_train, 42)
    te_s, te_y = gen_data(n_test, 999)
    tr_y, te_y = tr_y.to(DEVICE), te_y.to(DEVICE)

    bio = load_bio()
    results = {}
    for mt in MODEL_TYPES:
        model = make_model(mt, N_INPUT, n_classes, bio)
        np_ = sum(p.numel() for p in model.parameters() if p.requires_grad)
        train_sequential(model, tr_s, tr_y, n_classes, seq_len)
        acc = eval_sequential(model, te_s, te_y, n_classes, seq_len)
        results[mt] = {'test_acc': acc, 'params': np_}
        print(f"    {mt:15s}: {acc:5.1f}%, params={np_:,}", flush=True)

    print(f"  T2 done in {time.time()-t0:.0f}s", flush=True)
    return results


# ============================================================
# T3: CONTINUOUS ATTRACTOR (hold=20, strong distractors)
# ============================================================

def test_attractor():
    print("\n  T3: Continuous Attractor (hold=20, strong distractors)", flush=True)
    t0 = time.time()
    rng = np.random.RandomState(42)
    hold = 20
    n_out = 2
    n_train, n_test = 1000, 250
    seq_len = hold + 1

    def gen_data(n, seed):
        r = np.random.RandomState(seed)
        seqs, targets = [], []
        for _ in range(n):
            theta = r.uniform(0, 2*np.pi)
            seq = []
            # Step 0: encode theta
            x0 = np.zeros(N_INPUT, dtype=np.float32)
            x0[0] = np.cos(theta)
            x0[1] = np.sin(theta)
            for k in range(1, 7):
                x0[1+k] = np.cos(theta * k)
                x0[7+k] = np.sin(theta * k)
            seq.append(torch.tensor(x0))
            # Steps 1..hold: STRONG distractors (not just noise)
            for s in range(1, hold+1):
                x = r.randn(N_INPUT).astype(np.float32) * 0.3  # 3x more noise
                # Periodic distractors that could confuse angle memory
                x[0] += 0.5 * np.sin(2 * np.pi * s / 7)
                x[1] += 0.5 * np.cos(2 * np.pi * s / 7)
                seq.append(torch.tensor(x))
            seqs.append(seq)
            targets.append(torch.tensor([np.cos(theta), np.sin(theta)], dtype=torch.float32))
        return seqs, torch.stack(targets)

    tr_s, tr_y = gen_data(n_train, 42)
    te_s, te_y = gen_data(n_test, 999)
    tr_y, te_y = tr_y.to(DEVICE), te_y.to(DEVICE)

    bio = load_bio()
    results = {}
    for mt in MODEL_TYPES:
        model = make_model(mt, N_INPUT, n_out, bio)
        opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
        crit = nn.MSELoss()
        np_ = sum(p.numel() for p in model.parameters() if p.requires_grad)

        best_loss = float('inf')
        wait = 0
        for ep in range(MAX_EPOCHS):
            model.train()
            perm = torch.randperm(n_train).tolist()
            tl = 0
            for idx in range(0, n_train, BATCH_SIZE):
                bi = perm[idx:idx+BATCH_SIZE]
                model.reset()
                for t in range(seq_len):
                    xb = torch.stack([tr_s[i][t] for i in bi]).to(DEVICE)
                    out = model(xb, training=True)
                loss = crit(out['logits'][:, :n_out], tr_y[bi])
                opt.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
                opt.step()
                model.detach_states()
                tl += loss.item()
            if tl < best_loss - 0.001:
                best_loss = tl
                wait = 0
            else:
                wait += 1
            if wait >= PATIENCE:
                break
            if (ep+1) % 15 == 0:
                print(f"      [{mt}] Ep{ep+1}: loss={tl:.4f}", flush=True)

        # Eval: angular error
        model.eval()
        errs = []
        for i in range(0, n_test, BATCH_SIZE):
            bi = list(range(i, min(i+BATCH_SIZE, n_test)))
            model.reset()
            with torch.no_grad():
                for t in range(seq_len):
                    xb = torch.stack([te_s[j][t] for j in bi]).to(DEVICE)
                    out = model(xb, training=False)
            pred = out['logits'][:, :n_out]
            tgt = te_y[bi]
            pt = torch.atan2(pred[:,1], pred[:,0])
            tt = torch.atan2(tgt[:,1], tgt[:,0])
            ae = torch.abs(pt - tt)
            ae = torch.min(ae, 2*np.pi - ae)
            errs.extend((ae * 180/np.pi).cpu().tolist())

        me = np.mean(errs)
        results[mt] = {'angular_err': me, 'params': np_}
        print(f"    {mt:15s}: {me:5.1f}deg, params={np_:,}", flush=True)

    print(f"  T3 done in {time.time()-t0:.0f}s", flush=True)
    return results


# ============================================================
# T4: PHASE TRANSITION (Ising, near-Tc, batch generation)
# ============================================================

def test_ising():
    print("\n  T4: Phase Transition (Ising 2D, near Tc)", flush=True)
    t0 = time.time()
    Tc = 2.0 / np.log(1 + np.sqrt(2))
    n_classes = 2
    seq_len = 20
    n_train, n_test = 1000, 250

    def gen_ising_data(n, seed):
        rng = np.random.RandomState(seed)
        L = 8
        # Focus temperatures NEAR Tc for harder classification
        T_arr = rng.uniform(Tc - 0.8, Tc + 0.8, size=n).astype(np.float32)
        labels = (T_arr >= Tc).astype(np.int64)
        print(f"    Class balance: {(labels==0).sum()}/{(labels==1).sum()}", flush=True)

        # Batch Ising simulation (simplified: use analytical magnetization + noise)
        # For efficiency: use Curie-Weiss mean-field approximation
        # |m| ~ (1 - T/Tc)^(1/8) for T < Tc, ~0 for T > Tc
        seqs = []
        for i in range(n):
            T_i = T_arr[i]
            seq = []
            for s in range(seq_len):
                x = rng.randn(N_INPUT).astype(np.float32) * 0.05
                # Magnetization with thermal fluctuations
                if T_i < Tc:
                    m_eq = (1 - T_i/Tc) ** 0.125  # Ising 2D critical exponent
                    m = m_eq + rng.randn() * 0.05 * (T_i / Tc)
                else:
                    m = rng.randn() * 0.1 * np.sqrt(Tc / T_i)
                m = np.clip(np.abs(m), 0, 1)

                # Energy-like observable
                chi = 1.0 / max(abs(T_i - Tc), 0.05)  # susceptibility diverges at Tc
                e = -2 * m * m + rng.randn() * 0.1

                x[0] = m  # magnetization
                x[1] = e  # energy
                x[2] = chi * 0.1  # susceptibility (scaled)
                x[3] = T_i / 3.5  # normalized temperature hint (subtle)
                # Correlation function proxy
                if s > 0:
                    x[4] = m - prev_m  # derivative
                prev_m = m
                # Fluctuation history
                for k in range(min(s, 6)):
                    x[5+k] = rng.randn() * (0.01 + 0.1 * abs(T_i - Tc))
                seq.append(torch.tensor(x))
            seqs.append(seq)
        return seqs, torch.tensor(labels, dtype=torch.long)

    tr_s, tr_y = gen_ising_data(n_train, 42)
    te_s, te_y = gen_ising_data(n_test, 999)
    tr_y, te_y = tr_y.to(DEVICE), te_y.to(DEVICE)

    bio = load_bio()
    results = {}
    for mt in MODEL_TYPES:
        model = make_model(mt, N_INPUT, n_classes, bio)
        np_ = sum(p.numel() for p in model.parameters() if p.requires_grad)
        train_sequential(model, tr_s, tr_y, n_classes, seq_len)
        acc = eval_sequential(model, te_s, te_y, n_classes, seq_len)
        results[mt] = {'test_acc': acc, 'params': np_}
        print(f"    {mt:15s}: {acc:5.1f}%, params={np_:,}", flush=True)

    print(f"  T4 done in {time.time()-t0:.0f}s", flush=True)
    return results


# ============================================================
# MAIN
# ============================================================

def run_all():
    print("=" * 70, flush=True)
    print("EXP37: ORGAN-EXCLUSIVE BENCHMARK (v2)", flush=True)
    print(f"Device: {DEVICE}", flush=True)
    print(f"D_MODEL={D_MODEL}, D_STATE={D_STATE}, BATCH={BATCH_SIZE}", flush=True)
    print(f"MAX_EPOCHS={MAX_EPOCHS}, PATIENCE={PATIENCE}", flush=True)
    print("=" * 70, flush=True)

    t_total = time.time()
    results = {}

    results['T1_forgetting'] = test_forgetting()
    results['T2_multiscale'] = test_multiscale()
    results['T3_attractor'] = test_attractor()
    results['T4_ising'] = test_ising()

    # === SUMMARY ===
    print("\n" + "=" * 70, flush=True)
    print("EXP37 SUMMARY", flush=True)
    print("=" * 70, flush=True)

    labels = {'gru': 'GRU Solo', 'organ': 'Organ Solo',
              'cyborg_random': 'Cyborg(rand)', 'cyborg': 'Cyborg(bio)'}

    print(f"\n  {'Task':<25} {'GRU':>10} {'Organ':>10} {'Cyb(rand)':>10} {'Cyb(bio)':>10}")
    print(f"  {'-'*67}")

    for tname, tres in results.items():
        vals = []
        for mt in MODEL_TYPES:
            r = tres.get(mt, {})
            if 'test_acc' in r:
                vals.append(f"{r['test_acc']:5.1f}%")
            elif 'task0_ret' in r:
                vals.append(f"{r['task0_ret']:5.1f}%")
            elif 'angular_err' in r:
                vals.append(f"{r['angular_err']:5.1f}°")
            else:
                vals.append("  N/A")
        print(f"  {tname:<25} {vals[0]:>10} {vals[1]:>10} {vals[2]:>10} {vals[3]:>10}")

    # Verdicts
    print(f"\n  --- Veredictos ---")
    wins = {mt: 0 for mt in MODEL_TYPES}
    for tname, tres in results.items():
        if 'test_acc' in tres.get('gru', {}):
            best = max(MODEL_TYPES, key=lambda m: tres.get(m, {}).get('test_acc', 0))
            wins[best] += 1
            print(f"  {tname}: WINNER = {labels[best]} ({tres[best]['test_acc']:.1f}%)")
        elif 'task0_ret' in tres.get('gru', {}):
            best = max(MODEL_TYPES, key=lambda m: tres.get(m, {}).get('task0_ret', 0))
            wins[best] += 1
            print(f"  {tname}: WINNER = {labels[best]} (retention {tres[best]['task0_ret']:.1f}%)")
        elif 'angular_err' in tres.get('gru', {}):
            best = min(MODEL_TYPES, key=lambda m: tres.get(m, {}).get('angular_err', 999))
            wins[best] += 1
            print(f"  {tname}: WINNER = {labels[best]} (error {tres[best]['angular_err']:.1f}°)")

    bio_wins = wins['organ'] + wins['cyborg']
    gru_wins = wins['gru'] + wins['cyborg_random']
    print(f"\n  Score: Bio={bio_wins}/4, GRU={gru_wins}/4")
    if bio_wins > gru_wins:
        print(f"  >>> La hipotesis biologica SE SOSTIENE <<<")
    elif bio_wins == gru_wins:
        print(f"  >>> EMPATE <<<")
    else:
        print(f"  >>> GRU supera al Organ — replantear hipotesis <<<")

    print(f"\n  Total time: {time.time()-t_total:.0f}s")
    print("=" * 70, flush=True)

    # Save
    log_path = LOG_DIR / 'exp37_organ_exclusive.log'
    def clean(o):
        if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
        if isinstance(o, list): return [clean(v) for v in o]
        if isinstance(o, (np.floating, np.integer)): return float(o)
        if isinstance(o, np.ndarray): return o.tolist()
        if isinstance(o, torch.Tensor): return o.item() if o.numel()==1 else o.tolist()
        return o

    with open(log_path, 'w') as f:
        json.dump({'exp': 'Exp37 v2', 'results': clean(results),
                   'config': {'D_MODEL': D_MODEL, 'D_STATE': D_STATE,
                              'BATCH': BATCH_SIZE, 'MAX_EP': MAX_EPOCHS}},
                  f, indent=2, default=str)
    print(f"[SAVED] {log_path}", flush=True)

    # Plot
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(1, 4, figsize=(18, 5))
        fig.suptitle('Exp37: Organ-Exclusive Benchmark', fontsize=13, fontweight='bold')
        colors = {'gru': '#2196F3', 'organ': '#4CAF50',
                  'cyborg_random': '#FF9800', 'cyborg': '#E91E63'}

        for i, (tname, tres) in enumerate(results.items()):
            ax = axes[i]
            vals, cols, xlabels = [], [], []
            for mt in MODEL_TYPES:
                r = tres.get(mt, {})
                v = r.get('test_acc', r.get('task0_ret', None))
                if v is None:
                    v = 180 - r.get('angular_err', 90)  # invert for bar chart
                vals.append(v)
                cols.append(colors[mt])
                xlabels.append(labels[mt].split('(')[0].strip())

            ax.bar(range(4), vals, color=cols, alpha=0.85)
            ax.set_xticks(range(4))
            ax.set_xticklabels(xlabels, rotation=20, fontsize=8)
            ax.set_title(tname, fontsize=10)
            if 'angular_err' in tres.get('gru', {}):
                ax.set_ylabel('180 - Error (higher=better)')
            else:
                ax.set_ylabel('Score (%)')

        plt.tight_layout()
        png = LOG_DIR / 'exp37_organ_exclusive.png'
        plt.savefig(png, dpi=150)
        print(f"[SAVED] {png}", flush=True)
        plt.close()
    except Exception as e:
        print(f"[SKIP plot] {e}", flush=True)


if __name__ == "__main__":
    run_all()
