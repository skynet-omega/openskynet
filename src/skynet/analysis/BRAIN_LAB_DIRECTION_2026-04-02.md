# Brain Lab Direction

Anchors:

- [analisis.md](/home/daroch/openskynet/src/skynet/doc/analisis.md)
- [problema.md](/home/daroch/openskynet/src/skynet/doc/problema.md)
- [EX](/home/daroch/openskynet/src/skynet/experiments/EX)

## Macro

The Brain Lab is not primarily trying to build:

- a better GRU
- a better runtime policy
- a cheaper `OpenSkyNet`

It is trying to search for a new brain substrate with:

- field dynamics
- symmetry breaking
- dissipation
- geometry
- eventually dynamic topology

That is the real reading of `analisis.md`.

## Families In EX

### 1. Organ / Cyborg line

Main files:

- [SKYNET_V28_PHYSICAL_CYBORG.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V28_PHYSICAL_CYBORG.py)
- [V28_PHYSICAL_CORE.py](/home/daroch/openskynet/src/skynet/experiments/EX/V28_PHYSICAL_CORE.py)
- [SKYNET_CORE_V77_5_CHIMERA.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V77_5_CHIMERA.py)

Meaning:

- strongest direct attempt at a genuinely different brain
- closest line to the Turing/Lenia side of the thesis

Status:

- primary deep-research family

### 2. Runtime-intelligence line

Main files:

- [SKYNET_CORE_V67_OMEGA.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V67_OMEGA.py)
- [SKYNET_CORE_V67_GENESIS.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V67_GENESIS.py)
- [SKYNET_V7000_HYBRID_BRAIN.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V7000_HYBRID_BRAIN.py)

Meaning:

- surprise/frustration
- fast path vs deep path
- compute allocation

Status:

- excellent source of transferable runtime mechanisms
- not the main “new brain” line

### 3. Memory/dynamics side families

Main files:

- [SKYNET_V11_PURE_ADAPTIVE.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V11_PURE_ADAPTIVE.py)
- [SKYNET_CORE_V11_FUSION.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V11_FUSION.py)
- [SKYNET_CORE_V12_HAMILTON.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V12_HAMILTON.py)
- [SKYNET_CORE_V17_GATED.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V17_GATED.py)
- [SKYNET_CORE_V27_HOLO_KOOPMAN.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V27_HOLO_KOOPMAN.py)
- [SKYNET_CORE_V55_HOLODYNAMICS.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V55_HOLODYNAMICS.py)
- [SKYNET_V1_Kerr.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V1_Kerr.py)
- [SKYNET_V202_MIRROR.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V202_MIRROR.py)
- [SKYNET_V203_RESONANCE.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V203_RESONANCE.py)
- [SKYNET_V302_FUSION.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V302_FUSION.py)
- [SKYNET_V304_THERMODYNAMIC.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V304_THERMODYNAMIC.py)

Meaning:

- useful mechanism mines
- not one coherent winning line yet

## Meso Priorities

If we stay aligned with `analisis.md`, the Brain Lab priorities are:

1. `organ search`
2. `geometric stabilization`
3. `dynamic topology return`
4. `spectral return` only with the right benchmark

The biggest missing piece relative to the thesis is still:

- dynamic topology / graph growth / metric warping

## Evaluation Rule

Measure hypotheses, not version names.

A living branch should win on at least one meaningful axis:

- OOD accuracy
- adaptation latency
- retention
- graceful degradation
- compute/quality balance

If it wins nowhere, it is a fossil, not a live branch.

## Current Decision

- `V28` family is the main Brain Lab line
- `V67` family remains a runtime/product bridge, not the main substrate search
- spectral family stays secondary until a fair task is designed for it

## Next Work

Short term:

- continue `organ search`
- stop inflating easy probes
- return to topology only when we can implement it cleanly
