# Skynet EX - Next Cycle Recommendation

Date: 2026-04-02

## Executive View

`EX/` does not contain one hidden final architecture ready to replace `OpenSkyNet`.

It contains multiple hypothesis families.

The correct move is to split the agenda in two:

- keep extracting small transferable mechanisms from the family that already produces wins
- dedicate one deeper research cycle to the family most likely to yield a genuinely different brain

## What Already Paid Off

The family that already paid off is:

- **Cheap Fast Path + Rare Deep Path**

Source line:

- [SKYNET_CORE_V67_OMEGA.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V67_OMEGA.py)
- [SKYNET_V7000_HYBRID_BRAIN.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V7000_HYBRID_BRAIN.py)

It already contributed to the runtime through small mechanisms such as:

- surprise-gated metabolism
- JEPA surprise-sensitive drive enhancement
- context-aware WSP drive selection
- better wake-policy prioritization for active recovery

This is the productive bridge family.

## What Should Become The Main Brain Search Line

The next deeper cycle should center on:

- **Cyborg / Biphasic Substrates**

Primary source line:

- [SKYNET_V28_PHYSICAL_CYBORG.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V28_PHYSICAL_CYBORG.py)
- [V28_PHYSICAL_CORE.py](/home/daroch/openskynet/src/skynet/experiments/EX/V28_PHYSICAL_CORE.py)
- [SKYNET_CORE_V77_5_CHIMERA.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_CORE_V77_5_CHIMERA.py)

Reason:

- this family is the clearest attempt to build a genuinely different brain
- it directly encodes your long-term goal
- it does not collapse into "just another GRU variant"

## Why Not The Others First

### Not spectral memory first

Reason:

- recent extraction benchmarks did not show a win yet
- likely needs a better task before spending more effort

### Not adaptive decay first

Reason:

- still alive
- but it has not yet beaten good simple rules in runtime-shaped settings

### Not matrix/hamiltonian first

Reason:

- interesting but under-specified for current platform needs
- no direct extraction path proven yet

## Proposed Next Cycle

### Product track

Keep doing what works:

- continue extracting small Family D mechanisms into `Omega`
- only when they pass cheap, falsable benchmarks

### Brain track

Start a dedicated `cyborg_minimal` line in the lab:

Goal:

- not to port `V28` whole
- but to build a minimal benchmarkable family with only three moving parts:
  - discrete cortex
  - continuous organ
  - learned bridge

The benchmark should test things a normal model may actually struggle with:

- pattern + sequential recall at once
- local regime change
- persistence under selective disturbance
- transfer to longer sequences than training

## Promotion Rule

No family should be promoted whole.

Only mechanisms move up.

That means:

- `OpenSkyNet` remains the platform
- `Skynet Brain Lab` remains the place where failure is acceptable
- the promotion unit is always smaller than the myth that generated it

## Practical Decision

For the next cycle:

1. Keep `V67`-style extractions as the incremental runtime modernization path.
2. Make `V28/V77` the main line for serious new-brain research.
3. Treat papers and docs only as generators of mechanism hypotheses and benchmark dimensions.
