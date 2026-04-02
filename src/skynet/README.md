# Skynet Brain Lab

`src/skynet` is the experimental brain lab for `OpenSkyNet`, not the platform itself.

The separation should stay explicit:

- `OpenSkyNet` = runtime, channels, tools, memory, validation, autonomy substrate
- `Omega` = internal control/runtime line inside the platform
- `Skynet Brain Lab` = search for a new cognitive substrate beyond a plain LLM-centric agent

## Why This Exists

`OpenSkyNet` is already useful and relatively solid as an operational agent.
That makes it a bad place to invent an entirely new brain in-line.

`src/skynet` exists to do the opposite:

- test non-traditional substrates
- study limits of the current LLM-centric architecture
- run ugly or high-risk experiments without destabilizing the platform
- distill mechanisms small enough to survive falsification and later promotion

## What Belongs Here

### 1. Brain Search

Architectures that try to go beyond:

- next-token dependency
- flat textual memory
- purely heuristic control
- traditional monolithic nets

Examples:

- bifasic / cyborg architectures
- adaptive local plasticity
- surprise-gated compute
- spectral / oscillatory memory
- topology-changing or field-based substrates

### 2. Hypothesis Extraction

Not "which old version wins".
Instead:

- which mechanism is valuable
- in what task should it win
- what cost it adds
- whether it transfers to runtime reality

Examples:

- `adaptive_decay`
- `surprise_gated_compute`
- `runtime observers`
- `causal valence`

### 3. Promotion Gate

Nothing should move into `Omega` or the platform just because it sounds deep.

A lab result should only be promoted when:

1. the mechanism is isolated
2. the benchmark is falsable
3. the gain is real against a relevant baseline
4. the runtime integration is smaller than the added complexity
5. the platform still works without `src/skynet`

## Current Layout

- `doc/`
  Theory, papers, and conceptual roadmaps. Use as hypothesis fuel, not as proof.
- `experiments/`
  One-off runnable probes, historical lines, and benchmark scripts.
- `runtime-observer/`
  Learning from real runtime traces.
- `causal-valence/`
  Structured causal labeling and world-transition inference.
- `cognitive-kernel/`
  Lightweight online learners trained from trajectory data.
- `artifacts/`
  Reports, replay utilities, and derived evidence.
- `lab/`
  Reserved area for future cleaner lab surfaces; currently underused.

## Working Rule

If the goal is:

- make `OpenSkyNet` more reliable or cheaper -> work in platform / `Omega`
- discover a new mind topology -> work here first

The lab should be free to fail.
The platform should not pay for those failures prematurely.

## Priority Research Lines

### Line A: Cheap Fast Path + Rare Deep Path

Best current signal from old `EX` work.
This is where `V67`-style surprise gating has already produced transferable wins.

### Line B: Local Plasticity / Adaptive Decay

Still alive, but not yet strong enough for kernel promotion.
Needs tasks closer to real continuity and interruption handling.

### Line C: Spectral / Oscillatory Memory

Interesting, but currently under-validated.
Needs tasks where phase, periodicity, or latent continuity can actually win.

### Line D: Cyborg / Biphasic Substrates

Best treated as a research family, not as one giant file to import.
The useful unit is likely a mechanism, not a whole architecture.

## Anti-Pattern

Do not use `src/skynet` as:

- a dumping ground for mythology
- a hidden dependency of the kernel
- a second copy of `Omega`
- a narrative justification for unvalidated complexity

The lab is valuable only if it finds mechanisms the platform would not have discovered on its own.
