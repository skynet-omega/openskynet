"""
EXPERIMENT 29: COMPREHENSIVE V28 BENCHMARK
============================================

Three critical tests to prove V28 is superior:

TEST A: Simplified Hanabi (direct comparison with V20_BIFASIC baseline=22.71)
TEST B: Catastrophic Forgetting Resistance (V28 vs GRU baseline)
TEST C: Few-Shot Crystallization (learn new pattern in 1-5 shots)

Each test compares V28 against a GRU-only baseline of same parameter count.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.distributions as dist
import numpy as np
import matplotlib.pyplot as plt

from SKYNET_V28_PHYSICAL_CYBORG import SKYNET_V28_PHYSICAL_CYBORG

LOG_FILE = os.path.join(os.path.dirname(__file__),
                        "exp29_comprehensive_benchmark.log")
IMG_FILE = os.path.join(os.path.dirname(__file__),
                        "exp29_comprehensive_benchmark.png")


def log(msg):
    print(msg)
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


# ============================================================
# BASELINE: Pure GRU (no physics) - same parameter budget
# ============================================================

class GRUBaseline(nn.Module):
    """Fair GRU baseline with similar parameter count to V28."""
    def __init__(self, n_input=658, n_actions=20, d_model=192):
        super().__init__()
        self.input_proj = nn.Linear(n_input, d_model)
        self.input_norm = nn.LayerNorm(d_model)
        self.gru = nn.GRU(d_model, d_model, batch_first=True)
        self.actor = nn.Linear(d_model, n_actions)
        self.critic = nn.Sequential(
            nn.Linear(d_model, 256), nn.ReLU(), nn.Linear(256, 1)
        )
        self.h_state = None
        with torch.no_grad():
            self.actor.weight.data.normal_(0, 0.01)
            self.critic[-1].weight.data.normal_(0, 0.01)

    def reset(self):
        self.h_state = None

    def detach_states(self):
        if self.h_state is not None:
            self.h_state = self.h_state.detach()

    def forward(self, x, grad_norm=None, training=True):
        B = x.shape[0]
        if x.dim() == 3:
            x = x.view(B, -1)
        h = self.input_norm(self.input_proj(x))
        if self.h_state is None or self.h_state.shape[1] != B:
            self.h_state = torch.zeros(1, B, 192, device=x.device)
        h_ctx, self.h_state = self.gru(h.unsqueeze(1), self.h_state)
        h_ctx = h_ctx.squeeze(1)
        logits = self.actor(h_ctx)
        probs = F.softmax(logits, dim=-1)
        entropy = -(probs * torch.log(probs + 1e-6)).sum(-1, keepdim=True)
        value = self.critic(h_ctx)
        return {
            'logits': logits, 'probs': probs,
            'value': value, 'entropy': entropy,
            'audit': {'T_mean': 0, 'h_bimodal': 0, 'entropy': entropy.mean().item()}
        }


# ============================================================
# SIMPLIFIED HANABI ENVIRONMENT (from V20_BIFASIC_FASE2)
# ============================================================

class HanabiEnv:
    """Simplified Hanabi for benchmarking (same as V20 bifasic)."""
    def __init__(self, seed=None):
        self.rng = np.random.RandomState(seed)
        self.reset()

    def reset(self):
        self.score = 0
        self.hints = 8
        self.deck_size = 50
        self.step_count = 0
        return self._get_obs()

    def _get_obs(self):
        obs = np.zeros(658, dtype=np.float32)
        obs[0] = self.score / 25.0
        obs[1] = self.hints / 8.0
        obs[2] = self.deck_size / 50.0
        # Add more signal so it's not too trivial
        obs[3] = self.step_count / 1000.0
        obs[10 + min(self.score, 24)] = 1.0  # One-hot score
        obs[40 + self.hints] = 1.0  # One-hot hints
        return obs

    def step(self, action):
        self.step_count += 1
        reward = 0.0
        if action < 5:  # Play
            if self.rng.rand() > 0.5:
                self.score += 1
                reward = 1.0
            self.deck_size -= 1
        elif action < 10:  # Discard
            self.deck_size -= 1
            if self.hints < 8:
                self.hints += 1
        else:  # Hint
            if self.hints > 0:
                self.hints -= 1
        done = (self.score >= 25 or self.deck_size <= 0
                or self.step_count >= 200)
        return self._get_obs(), reward, done


# ============================================================
# TEST A: SIMPLIFIED HANABI BENCHMARK
# ============================================================

def test_hanabi(model, device, n_train=300, n_test=100, label="Model"):
    """Train and test on simplified Hanabi."""
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4)
    env = HanabiEnv(seed=42)

    train_rewards = []
    for ep in range(n_train):
        model.reset()
        obs = env.reset()
        done = False
        log_probs = []
        values = []
        rewards = []

        while not done:
            obs_t = torch.from_numpy(obs).float().to(device).unsqueeze(0)
            output = model(obs_t, training=True)
            action_dist = dist.Categorical(logits=output['logits'])
            action = action_dist.sample()
            log_prob = action_dist.log_prob(action)

            obs, reward, done = env.step(action.item())
            log_probs.append(log_prob)
            values.append(output['value'].squeeze())
            rewards.append(reward)

        # REINFORCE with baseline
        returns = []
        G = 0
        for r in reversed(rewards):
            G = r + 0.99 * G
            returns.insert(0, G)
        returns = torch.tensor(returns, dtype=torch.float32, device=device)
        log_probs = torch.stack(log_probs)
        values = torch.stack(values)
        advantages = returns - values.detach()

        policy_loss = -(log_probs * advantages).sum()
        value_loss = advantages.pow(2).sum()
        entropy_bonus = -0.01 * output['entropy'].mean()
        loss = policy_loss + 0.5 * value_loss + entropy_bonus

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if hasattr(model, 'detach_states'):
            model.detach_states()

        train_rewards.append(sum(rewards))

    # Test
    model.eval()
    test_rewards = []
    for _ in range(n_test):
        model.reset()
        obs = env.reset()
        done = False
        ep_r = 0
        while not done:
            obs_t = torch.from_numpy(obs).float().to(device).unsqueeze(0)
            with torch.no_grad():
                output = model(obs_t, training=False)
            action = output['logits'].argmax(dim=-1)
            obs, reward, done = env.step(action.item())
            ep_r += reward
        test_rewards.append(ep_r)
    model.train()

    return train_rewards, test_rewards


# ============================================================
# TEST B: CATASTROPHIC FORGETTING
# ============================================================

def test_catastrophic_forgetting(model, device, label="Model"):
    """
    1. Train on Task A (patterns 0-1 -> actions 0-1)
    2. Train on Task B (patterns 2-3 -> actions 2-3)
    3. Test on Task A (if accuracy > 60%, memory survived)
    """
    optimizer = torch.optim.Adam(model.parameters(), lr=0.003)

    def make_data(task, batch=32, n_input=658):
        x = torch.randn(batch, n_input, device=device) * 0.05
        if task == 'A':
            targets = torch.randint(0, 2, (batch,), device=device)
            for i in range(batch):
                x[i, targets[i].item() * 100:(targets[i].item() + 1) * 100] += 1.0
        else:
            targets = torch.randint(2, 4, (batch,), device=device)
            for i in range(batch):
                t = targets[i].item()
                x[i, t * 100:(t + 1) * 100] += 1.0
        return x, targets

    # Phase 1: Train on Task A
    model.reset()
    for _ in range(200):
        model.reset()
        x, targets = make_data('A')
        output = model(x, training=True)
        loss = F.cross_entropy(output['logits'], targets)
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if hasattr(model, 'detach_states'):
            model.detach_states()

    # Eval Task A after training A
    model.eval()
    model.reset()
    with torch.no_grad():
        x, targets = make_data('A', batch=200)
        output = model(x, training=False)
        acc_A_after_A = (output['logits'].argmax(-1) == targets).float().mean().item()
    model.train()

    # Phase 2: Train on Task B (potentially forgetting A)
    for _ in range(200):
        model.reset()
        x, targets = make_data('B')
        output = model(x, training=True)
        loss = F.cross_entropy(output['logits'], targets)
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if hasattr(model, 'detach_states'):
            model.detach_states()

    # Eval Task B
    model.eval()
    model.reset()
    with torch.no_grad():
        x, targets = make_data('B', batch=200)
        output = model(x, training=False)
        acc_B = (output['logits'].argmax(-1) == targets).float().mean().item()

    # Eval Task A AFTER training B (catastrophic forgetting test)
    model.reset()
    with torch.no_grad():
        x, targets = make_data('A', batch=200)
        output = model(x, training=False)
        acc_A_after_B = (output['logits'].argmax(-1) == targets).float().mean().item()
    model.train()

    forgetting = acc_A_after_A - acc_A_after_B
    return acc_A_after_A, acc_B, acc_A_after_B, forgetting


# ============================================================
# TEST C: FEW-SHOT LEARNING
# ============================================================

def test_few_shot(model, device, n_shots=5, label="Model"):
    """
    Present a NEW pattern n_shots times, then test recall after 50 distractors.
    """
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    n_input = 658
    # Create a unique pattern -> action mapping
    target_action = 7  # Unusual action

    # Few-shot: present the pattern n_shots times
    model.reset()
    for _ in range(n_shots):
        x = torch.randn(1, n_input, device=device) * 0.05
        x[0, 400:500] += 2.0  # Unique pattern in dims 400-500
        targets = torch.tensor([target_action], device=device)

        output = model(x, training=True)
        loss = F.cross_entropy(output['logits'], targets)
        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        if hasattr(model, 'detach_states'):
            model.detach_states()

    # Distractors: 50 random inputs (don't train on these)
    model.eval()
    for _ in range(50):
        x = torch.randn(1, n_input, device=device) * 0.1
        with torch.no_grad():
            model(x, training=False)

    # Recall: present the pattern again
    x = torch.randn(1, n_input, device=device) * 0.05
    x[0, 400:500] += 2.0
    with torch.no_grad():
        output = model(x, training=False)
        pred = output['logits'].argmax(-1).item()
        correct = pred == target_action

    model.train()
    return correct, pred, target_action


# ============================================================
# MAIN EXPERIMENT
# ============================================================

def run_experiment():
    with open(LOG_FILE, "w") as f:
        f.write("--- EXPERIMENT 29: COMPREHENSIVE V28 BENCHMARK ---\n")

    log("--- EXPERIMENT 29: COMPREHENSIVE V28 BENCHMARK ---")
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    log(f"Device: {device}")

    # ====== TEST A: HANABI ======
    log("\n" + "=" * 60)
    log("TEST A: SIMPLIFIED HANABI BENCHMARK")
    log("=" * 60)

    v28 = SKYNET_V28_PHYSICAL_CYBORG(device=device).to(device)
    gru = GRUBaseline().to(device)
    log(f"V28 params: {sum(p.numel() for p in v28.parameters()):,}")
    log(f"GRU params: {sum(p.numel() for p in gru.parameters()):,}")

    log("\nTraining V28 on Hanabi (300 episodes)...")
    v28_train, v28_test = test_hanabi(v28, device, label="V28")
    v28_mean = np.mean(v28_test)
    v28_std = np.std(v28_test)
    log(f"  V28 Test: {v28_mean:.2f} +/- {v28_std:.2f}")

    log("\nTraining GRU baseline on Hanabi (300 episodes)...")
    gru_train, gru_test = test_hanabi(gru, device, label="GRU")
    gru_mean = np.mean(gru_test)
    gru_std = np.std(gru_test)
    log(f"  GRU Test: {gru_mean:.2f} +/- {gru_std:.2f}")

    v20_baseline = 22.71
    log(f"\n  V20 Bifasic baseline: {v20_baseline}")
    log(f"  V28 vs V20: {((v28_mean - v20_baseline) / v20_baseline) * 100:+.1f}%")
    log(f"  V28 vs GRU: {((v28_mean - gru_mean) / (gru_mean + 1e-6)) * 100:+.1f}%")

    # ====== TEST B: CATASTROPHIC FORGETTING ======
    log("\n" + "=" * 60)
    log("TEST B: CATASTROPHIC FORGETTING RESISTANCE")
    log("=" * 60)

    # Run multiple times for robustness
    v28_forget_results = []
    gru_forget_results = []

    for trial in range(5):
        v28_b = SKYNET_V28_PHYSICAL_CYBORG(device=device).to(device)
        gru_b = GRUBaseline().to(device)

        v28_results = test_catastrophic_forgetting(v28_b, device, "V28")
        gru_results = test_catastrophic_forgetting(gru_b, device, "GRU")

        v28_forget_results.append(v28_results)
        gru_forget_results.append(gru_results)

        log(f"  Trial {trial+1}: V28 forget={v28_results[3]:.2f}, "
            f"GRU forget={gru_results[3]:.2f}")

    v28_avg_forget = np.mean([r[3] for r in v28_forget_results])
    gru_avg_forget = np.mean([r[3] for r in gru_forget_results])
    v28_avg_A_after_B = np.mean([r[2] for r in v28_forget_results])
    gru_avg_A_after_B = np.mean([r[2] for r in gru_forget_results])

    log(f"\n  V28 avg forgetting: {v28_avg_forget:.3f} "
        f"(A accuracy after B: {v28_avg_A_after_B:.1%})")
    log(f"  GRU avg forgetting: {gru_avg_forget:.3f} "
        f"(A accuracy after B: {gru_avg_A_after_B:.1%})")

    # ====== TEST C: FEW-SHOT ======
    log("\n" + "=" * 60)
    log("TEST C: FEW-SHOT CRYSTALLIZATION")
    log("=" * 60)

    v28_shots = []
    gru_shots = []
    for n_shots in [1, 3, 5, 10]:
        v28_correct = 0
        gru_correct = 0
        n_trials = 10
        for _ in range(n_trials):
            v28_c = SKYNET_V28_PHYSICAL_CYBORG(device=device).to(device)
            gru_c = GRUBaseline().to(device)
            v28_ok, _, _ = test_few_shot(v28_c, device, n_shots=n_shots)
            gru_ok, _, _ = test_few_shot(gru_c, device, n_shots=n_shots)
            v28_correct += v28_ok
            gru_correct += gru_ok
        v28_rate = v28_correct / n_trials
        gru_rate = gru_correct / n_trials
        v28_shots.append((n_shots, v28_rate))
        gru_shots.append((n_shots, gru_rate))
        log(f"  {n_shots}-shot: V28={v28_rate:.0%}, GRU={gru_rate:.0%}")

    # ====== VERDICT ======
    log("\n" + "=" * 60)
    log("VERDICT")
    log("=" * 60)

    pass_A = v28_mean >= v20_baseline or v28_mean > gru_mean
    pass_B = v28_avg_forget < gru_avg_forget
    pass_C = sum(r for _, r in v28_shots) >= sum(r for _, r in gru_shots)

    log(f"[{'PASS' if pass_A else 'FAIL'}] Hanabi: V28={v28_mean:.2f} vs "
        f"GRU={gru_mean:.2f} vs V20={v20_baseline}")
    log(f"[{'PASS' if pass_B else 'FAIL'}] Forgetting: V28={v28_avg_forget:.3f} "
        f"vs GRU={gru_avg_forget:.3f} (lower=better)")
    log(f"[{'PASS' if pass_C else 'FAIL'}] Few-shot: V28 total="
        f"{sum(r for _, r in v28_shots):.1f} vs "
        f"GRU total={sum(r for _, r in gru_shots):.1f}")

    all_pass = pass_A and pass_B and pass_C
    status = "[!!! V28 SUPERIOR !!!]" if all_pass else "[PARCIAL]"
    log(f"\n{status}")
    if all_pass:
        log("V28 Physical Cyborg supera baselines en las 3 dimensiones criticas.")

    # ====== VISUALIZATION ======
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))

    # Top-left: Hanabi training curves
    w = 20
    if len(v28_train) > w:
        v28_sm = np.convolve(v28_train, np.ones(w)/w, mode='valid')
        gru_sm = np.convolve(gru_train, np.ones(w)/w, mode='valid')
        axes[0, 0].plot(v28_sm, 'b-', linewidth=2, label='V28')
        axes[0, 0].plot(gru_sm, 'r-', linewidth=2, label='GRU')
    axes[0, 0].axhline(y=v20_baseline, color='green', linestyle='--',
                        label=f'V20 baseline ({v20_baseline})')
    axes[0, 0].set_title('Test A: Hanabi Training')
    axes[0, 0].set_xlabel('Episode')
    axes[0, 0].set_ylabel('Reward')
    axes[0, 0].legend()

    # Top-center: Hanabi test distribution
    axes[0, 1].hist(v28_test, bins=20, alpha=0.5, label=f'V28 ({v28_mean:.1f})',
                    color='blue')
    axes[0, 1].hist(gru_test, bins=20, alpha=0.5, label=f'GRU ({gru_mean:.1f})',
                    color='red')
    axes[0, 1].axvline(x=v20_baseline, color='green', linestyle='--',
                       label='V20 baseline')
    axes[0, 1].set_title('Test A: Hanabi Test Distribution')
    axes[0, 1].legend()

    # Top-right: Forgetting comparison
    cats = ['A after A', 'B', 'A after B']
    v28_vals = [np.mean([r[0] for r in v28_forget_results]),
                np.mean([r[1] for r in v28_forget_results]),
                v28_avg_A_after_B]
    gru_vals = [np.mean([r[0] for r in gru_forget_results]),
                np.mean([r[1] for r in gru_forget_results]),
                gru_avg_A_after_B]
    x_pos = np.arange(3)
    axes[0, 2].bar(x_pos - 0.15, v28_vals, 0.3, label='V28', color='blue',
                   alpha=0.7)
    axes[0, 2].bar(x_pos + 0.15, gru_vals, 0.3, label='GRU', color='red',
                   alpha=0.7)
    axes[0, 2].set_xticks(x_pos)
    axes[0, 2].set_xticklabels(cats)
    axes[0, 2].set_title(f'Test B: Catastrophic Forgetting')
    axes[0, 2].set_ylabel('Accuracy')
    axes[0, 2].legend()
    axes[0, 2].set_ylim(0, 1.1)

    # Bottom-left: Few-shot comparison
    shots = [s for s, _ in v28_shots]
    v28_rates = [r for _, r in v28_shots]
    gru_rates = [r for _, r in gru_shots]
    axes[1, 0].plot(shots, v28_rates, 'bo-', linewidth=2, label='V28')
    axes[1, 0].plot(shots, gru_rates, 'ro-', linewidth=2, label='GRU')
    axes[1, 0].set_title('Test C: Few-Shot Learning')
    axes[1, 0].set_xlabel('Number of shots')
    axes[1, 0].set_ylabel('Recall accuracy')
    axes[1, 0].legend()
    axes[1, 0].set_ylim(-0.05, 1.05)

    # Bottom-center: Forgetting magnitude
    axes[1, 1].bar(['V28', 'GRU'], [v28_avg_forget, gru_avg_forget],
                   color=['blue', 'red'], alpha=0.7)
    axes[1, 1].set_title('Forgetting Magnitude (lower = better)')
    axes[1, 1].set_ylabel('Forgetting (acc_A_before - acc_A_after)')

    # Bottom-right: Summary
    axes[1, 2].axis('off')
    summary = (
        f"V28 PHYSICAL CYBORG BENCHMARK\n"
        f"{'=' * 35}\n\n"
        f"Test A (Hanabi):\n"
        f"  V28: {v28_mean:.2f} +/- {v28_std:.1f}\n"
        f"  GRU: {gru_mean:.2f} +/- {gru_std:.1f}\n"
        f"  V20: {v20_baseline:.2f}\n"
        f"  {'PASS' if pass_A else 'FAIL'}\n\n"
        f"Test B (Forgetting):\n"
        f"  V28: {v28_avg_forget:.3f}\n"
        f"  GRU: {gru_avg_forget:.3f}\n"
        f"  {'PASS' if pass_B else 'FAIL'}\n\n"
        f"Test C (Few-shot):\n"
        f"  V28: {[f'{r:.0%}' for _, r in v28_shots]}\n"
        f"  GRU: {[f'{r:.0%}' for _, r in gru_shots]}\n"
        f"  {'PASS' if pass_C else 'FAIL'}\n\n"
        f"OVERALL: {status}"
    )
    axes[1, 2].text(0.05, 0.95, summary, fontsize=10, fontfamily='monospace',
                    transform=axes[1, 2].transAxes, verticalalignment='top')

    plt.suptitle('Exp29: V28 Physical Cyborg - Comprehensive Benchmark',
                 fontsize=14, fontweight='bold')
    plt.tight_layout()
    plt.savefig(IMG_FILE, dpi=150)
    log(f"\nSaved to {IMG_FILE}")
    plt.close()

    return all_pass, {
        'hanabi_v28': v28_mean, 'hanabi_gru': gru_mean,
        'forget_v28': v28_avg_forget, 'forget_gru': gru_avg_forget,
        'fewshot_v28': v28_shots, 'fewshot_gru': gru_shots,
    }


if __name__ == "__main__":
    success, metrics = run_experiment()
