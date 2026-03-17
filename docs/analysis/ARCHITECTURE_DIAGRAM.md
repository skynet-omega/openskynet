# 🏗️ OpenSkyNet Architecture: The 5 Jewels Integration

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          HEARTBEAT LOOP (~1 Hz)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────┐                                           │
│  │  SPARSE METABOLISM       │ ← Decides WHAT to compute                │
│  │  (5% of cycle)           │   Based on frustration                   │
│  └──────────────────────────┘                                           │
│         ↓                                                                │
│  ┌──────────────────────────────────┐                                   │
│  │  READ KERNEL STATE + JEPA        │                                   │
│  │  - successRate, failureCount     │                                   │
│  │  - frustration (0-1)             │                                   │
│  └──────────────────────────────────┘                                   │
│         ↓                                                                │
│  ┌──────────────────────────────────┐                                   │
│  │  INNER DRIVES                    │ ← EXISTING (unchanged)            │
│  │  - curiosity, exploration, etc   │                                   │
│  └──────────────────────────────────┘                                   │
│         ↓ (only if metabolism says so)                                   │
│  ┌──────────────────────────────────────────┐                           │
│  │  NEURAL LOGIC ENGINE                     │ ← NEW Jewel #1            │
│  │  64 learned rules in latent space        │   SIN LLM                 │
│  │  - Infer state based on patterns         │   10-15ms                 │
│  │  - Return confidence                     │                           │
│  └──────────────────────────────────────────┘                           │
│         ↓ (only if metabolism says so)                                   │
│  ┌──────────────────────────────────────────┐                           │
│  │  HIERARCHICAL MEMORY                     │ ← NEW Jewel #2            │
│  │  ┌─ Level 0: Working Memory (7 items)    │   4 LEVELS               │
│  │  ├─ Level 1: Episodic (tensor states)    │   30-40ms                │
│  │  ├─ Level 2: Semantic (concepts)    ←────┤   Consolidation          │
│  │  └─ Level 3: Procedural (skills)         │                           │
│  └──────────────────────────────────────────┘                           │
│         ↓                                                                │
│  ┌──────────────────────────────────────────┐                           │
│  │  JEPA DRIVE ENHANCEMENT (+ Logic)        │ ← Plan B (existing)       │
│  │  frustration > 0.5 → boost drive         │   + NLE input             │
│  │  + Lyapunov damping (next step)          │                           │
│  └──────────────────────────────────────────┘                           │
│         ↓ (only if metabolism says so)                                   │
│  ┌──────────────────────────────────────────┐                           │
│  │  LYAPUNOV CONTROLLER                     │ ← NEW Jewel #3            │
│  │  Compute divergence → damping factor     │   Homeostasis             │
│  │  Prevents "thermal epilepsy" (V7 bug)    │   5-8ms                   │
│  │  Apply damping to drive.urgency          │                           │
│  └──────────────────────────────────────────┘                           │
│         ↓ (only if complexity high)                                      │
│  ┌──────────────────────────────────────────┐                           │
│  │  CAUSAL REASONER                         │ ← NEW Jewel #4            │
│  │  Build DAG of cause-effect               │   Causal not correl       │
│  │  Reason about interventions              │   10-20ms                 │
│  │  Detect confounders                      │                           │
│  └──────────────────────────────────────────┘                           │
│         ↓                                                                │
│  ┌──────────────────────────────────────────┐                           │
│  │  AUTONOMY LOGGER                         │ ← Plan B (existing)       │
│  │  Log decision + all context              │   + Extended fields       │
│  │  nleConfidence, hmSize, lyapunovDamping  │   <1ms                    │
│  └──────────────────────────────────────────┘                           │
│         ↓                                                                │
│  ┌──────────────────────────────────────────┐                           │
│  │  EXECUTE DECISION                        │                           │
│  │  If drive.kind != 'idle'                 │                           │
│  └──────────────────────────────────────────┘                           │
│         ↓                                                                │
│  ┌──────────────────────────────────────────┐                           │
│  │  OPTIONAL: BIFÁSIC ODE INTEGRATION       │ ← Phase 5 (conditional)   │
│  │  If autonomy >= 95%, add spike generation│   Decision trigger         │
│  └──────────────────────────────────────────┘                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                              ↓ LOOP ~1Hz
```

---

## 🔄 Memory Consolidation (Sleep-like Process)

```
┌─────────────────────────────────────────────────────────────────┐
│                    OVER TIME (Idle Periods)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Heartbeat #1     Heartbeat #2      Heartbeat #3              │
│   ────────────     ────────────      ────────────              │
│                                                                  │
│   Working Memory:  Working Memory:   Working Memory:           │
│   [ drive_A ]      [ drive_B ]       [ drive_C ]               │
│                         ↓ (3+ episodes similar)                │
│                         ↓                                       │
│   Episodic:        Episodic:                                   │
│   [z₁]             [z₁, z₂, z₃]      Consolidate →            │
│                                                                 │
│                                       Semantic Memory:         │
│                                       "Pattern: high-frustration│
│                                        → exploration"          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 Metabolism Levels by Frustration

```
Frustration   Total        Active Components
0.0           ██░░░░░░░░  [NLE, Logger]
0.3           ███░░░░░░░  [NLE, HM, JEPA, Logger]  
0.5           █████░░░░░  [NLE, HM, JEPA, Lyapunov, Logger]
0.7           ███████░░░  [ALL 5 fully active]
1.0           ██████████  [FULL EMERGENCY MODE]
```

---

## 🎓 Why Each Jewel Matters

### 1️⃣ Neural Logic Engine
- **Problem:** OpenSkyNet asks LLM "what next?" → slow, depends on API
- **Solution:** Learn 64 pattern-rules in latent space, infer instantly
- **Result:** <10ms per decision, zero LLM calls

### 2️⃣ Hierarchical Memory
- **Problem:** Logs are write-only, no learning from past
- **Solution:** 4-level memory + automatic consolidation
- **Result:** Can retrieve similar past situations, find patterns

### 3️⃣ Lyapunov Controller  
- **Problem:** V7_METABOLISM "epileptic" when frustrated
- **Solution:** Monitor divergence, apply dynamic damping
- **Result:** Stays stable under pressure, doesn't explode

### 4️⃣ Causal Reasoner
- **Problem:** LLMs see "A happened before B" → assume A caused B
- **Solution:** Build DAG of true causal chains, detect confounders
- **Result:** Interventions are smarter (avoid backfires)

### 5️⃣ Sparse Metabolism
- **Problem:** Run all 5 components every cycle → inefficient
- **Solution:** Activate only what's needed based on frustration
- **Result:** Stays fast, scales to 10Hz+ if needed

---

## 🚦 Decision Flow Example

### Scenario: "Frustration spike to 0.8, need to act"

```
1. SPARSE METABOLISM
   frustration=0.8 → Activate ALL 5 components
   metabolic_rate = 95%

2. NEURAL LOGIC ENGINE  
   State: [frustration=0.8, success_rate=0.2, ...]
   Active rules: [curiosity_boost, exploration_trigger]
   Confidence: 0.87

3. HIERARCHICAL MEMORY
   Query episodic: Found 3 similar states from yesterday
   All led to "exploration" → semantic pattern confirms
   Suggest: "Try alternatives"

4. JEPA DRIVE ENHANCEMENT
   Base drive: curiosity@0.4
   JEPA boost: +0.3 (frustration > 0.5)
   New drive: curiosity@0.7

5. LYAPUNOV CONTROLLER
   Divergence: 0.38 (high but rising)
   Damping: 0.4 (moderate brake)
   Final drive: curiosity@0.42 (dampened from 0.7)

6. CAUSAL REASONER
   Action "explore_alternatives" → causes?
   Direct: [success_rate ↑, entropy ↑]
   Indirect: [frustration ↓ (if success)]
   Confounders: "previous_failures" may backfire
   Confidence: 0.65

7. EXECUTE
   → Execute: curiosity@0.42 with monitoring

8. LOG
   Recorded: [nleConfidence=0.87, hmMatches=3, 
              lyapunovDamping=0.4, causalConfidence=0.65
              metabolicRate=0.95]

9. NEXT CYCLE
   See result → update episodic memory
   If success → consolidate to semantic
   If backfire → Causal Reasoner learns confounder
```

---

## 🎯 Performance Targets

| Metric | Before | After | Unit |
|--------|--------|-------|------|
| Autonomy | 90% | 99% | % |
| LLM calls | 80% | <5% | % of decisions |
| Heartbeat latency | 50ms | <100ms | ms |
| Memory levels | 1 | 4 | count |
| Causal nodes learned | 0 | 10-50 | count |
| Metabolic overhead | 100% | 30-95% | % adaptive |
| Divergence max | 0.5 | <0.35 | exponent |

---

## 📁 File Structure

```
src/omega/
├── heartbeat.ts (MODIFIED - new flow)
├── neural-logic-engine.ts (NEW - 350 lines)
├── hierarchical-memory.ts (NEW - 380 lines)
├── lyapunov-controller.ts (NEW - 300 lines)
├── causal-reasoner.ts (NEW - 280 lines)
├── sparse-metabolism.ts (NEW - 320 lines)
├── jepa-drive-enhancement.ts (EXISTING - optimized)
└── autonomy-logger.ts (EXISTING - extended)

docs/
└── UPGRADE_PLAN_PHASE4.md (NEW - integration guide)
```

---

## ✅ Readiness Checklist

- ✅ Neural Logic Engine (implemented)
- ✅ Hierarchical Memory (implemented)
- ✅ Lyapunov Controller (implemented)
- ✅ Causal Reasoner (implemented)
- ✅ Sparse Metabolism (implemented)
- ⏳ Integrate into heartbeat.ts
- ⏳ Test each component individually
- ⏳ Test integration
- ⏳ Validate autonomy >= 99%
- ⏳ Measure latency
- ⏳ Monitoring dashboard (extend live-autonomy-monitor.mjs)

---

## 🔮 Future Directions

### Phase 5 (Optional, if autonomy > 95%)
- Integrate Bifásic ODE for spike-based decisions
- Add "dreaming" mode (offline replay + consolidation)

### Phase 6 (Optional, if needed)
- Attention mechanism between memory levels
- Cross-memory retrieval (episodic → semantic → procedural)
- Skill learning (procedural memory update)

### Phase 7 (Research)
- Multi-scale reasoning (microsecond to hours)
- Modal reasoning (different reasoning modes per domain)
- Symbolic-neural integration (ASP + neural jointly)
