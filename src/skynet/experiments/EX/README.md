# EX - Hypothesis Families

`EX/` is not a hall of winners.
It is a compressed fossil record of architectural hypotheses.

The right question here is not:

- "Which version should replace OpenSkyNet?"

The right questions are:

- what mechanism does this family propose
- what problem should it solve better than a traditional architecture
- what is still alive
- what should remain only as inspiration

## Family A - Adaptive / Local Plasticity

### Files

- [SKYNET_V11_PURE_ADAPTIVE.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V11_PURE_ADAPTIVE.py)
- [SKYNET_CORE_V11_FUSION.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V11_FUSION.py)

### Core idea

Memory should not only persist.
It should adapt locally depending on flux, strain, or context.

### Mechanisms worth extracting

- adaptive decay
- thermodynamic homeostat
- liquid / gel / crystal style staged memory

### What we already learned

- `adaptive_decay` is alive in lab
- it improved against weak RNN baselines
- it did not yet justify replacement of good runtime rules

### Status

Alive, but still lab-only.

## Family B - Spectral / Holographic Memory

### Files

- [SKYNET_CORE_V27_HOLO_KOOPMAN.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V27_HOLO_KOOPMAN.py)
- [SKYNET_CORE_V55_HOLODYNAMICS.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V55_HOLODYNAMICS.py)
- [SKYNET_V1_Kerr.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V1_Kerr.py)
- [SKYNET_V202_MIRROR.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V202_MIRROR.py)
- [SKYNET_V203_RESONANCE.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V203_RESONANCE.py)
- [SKYNET_V302_FUSION.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V302_FUSION.py)
- [SKYNET_V304_THERMODYNAMIC.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V304_THERMODYNAMIC.py)

### Core idea

Continuity, memory, and perception may be better represented as oscillatory or complex spectral state, not only as plain vectors.

### Mechanisms worth extracting

- phase-preserving recurrence
- spectral evolution / Koopman-style memory
- memory token separation between perception and memory
- soft thermodynamic saturation instead of hard clipping

### What we already learned

- spectral memory has not yet won a fair benchmark in our recent extraction cycle
- this family probably needs tasks with:
  - periodicity
  - phase continuity
  - long latent recurrence
- judged only on conventional tasks, it looks worse than it may really be

### Status

Promising, under-tested, easy to over-romanticize.

## Family C - Cyborg / Biphasic Substrates

### Files

- [SKYNET_V28_PHYSICAL_CYBORG.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V28_PHYSICAL_CYBORG.py)
- [V28_PHYSICAL_CORE.py](/home/daroch/openskynet/src/skynet/experiments/EX/V28_PHYSICAL_CORE.py)
- [SKYNET_CORE_V77_5_CHIMERA.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V77_5_CHIMERA.py)

### Core idea

A single homogeneous substrate may not be enough.
Use a hybrid:

- discrete / routing / sequential cortex
- continuous / physical / pattern organ
- learned bridge between both

### Mechanisms worth extracting

- biphasic organ
- temperature-conditioned routing
- explicit separation between pattern field and logical executive
- crystallization / override memory

### What we already learned

- `V28` is the most serious architecture in this family
- `exp34` gave the right methodological lesson:
  - compare `GRU-only`
  - `Organ-only`
  - `Cyborg`
- but that line still does not prove superiority over a good conventional baseline

### Status

Best candidate for a future "new brain" line, but not ready for promotion.

## Family D - Cheap Fast Path + Rare Deep Path

### Files

- [SKYNET_CORE_V67_OMEGA.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V67_OMEGA.py)
- [SKYNET_CORE_V67_GENESIS.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V67_GENESIS.py)
- [SKYNET_V7000_HYBRID_BRAIN.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V7000_HYBRID_BRAIN.py)

### Core idea

Do not think deeply all the time.
Use:

- cheap default path
- expensive mode only when surprise / frustration / uncertainty justifies it

### Mechanisms worth extracting

- surprise-gated compute
- ponder budget
- sparse deep reasoning
- hybrid fast-path / deep-path scheduling

### What we already learned

This is the family that has already produced the best kernel transfers:

- surprise-gated metabolism
- JEPA drive enhancement
- better WSP drive selection context
- better wake-policy priority for active recovery

### Status

Most transfer-worthy family so far.
Probably not the final brain, but currently the most useful bridge into OpenSkyNet.

## Family E - Structured Matrix / Binding Memory

### Files

- [SKYNET_CORE_V17_GATED.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V17_GATED.py)
- [SKYNET_CORE_V12_HAMILTON.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V12_HAMILTON.py)

### Core idea

Memory should store structured relations, not only decayed hidden state.

### Mechanisms worth extracting

- gated matrix memory
- structured binding capacity
- symplectic / conservative recurrence

### What we learned so far

These files look technically interesting, but we have not yet built the right extraction benchmark for them.

### Status

Unclear.
Worth revisiting only with a task that really requires structured binding or stable relational recurrence.

## Which family matters most right now?

### For OpenSkyNet product value

Family D:

- cheap fast path + rare deep path

Reason:

- it already transfers
- it aligns with real runtime pain
- it improves cost/benefit without inventing another architecture religion

### For the search for a new brain

Family C:

- cyborg / biphasic substrates

Reason:

- it is the clearest non-traditional architectural direction
- it directly addresses your real goal: a brain unlike a plain LLM
- it is radical enough to matter, but concrete enough to benchmark

## Recommendation

Do not try to crown one historical file as "the answer".

Do this instead:

1. keep extracting Family D mechanisms into the platform when they win
2. make Family C the main deep research line for the next architecture search cycle
3. keep Family A alive in lab
4. only revisit Family B or E when the benchmark is designed for their actual strengths
