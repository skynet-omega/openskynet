# V28 Organ Track

Files:

- [SKYNET_V28_PHYSICAL_CYBORG.py](/home/daroch/openskynet/src/skynet/experiments/EX/SKYNET_V28_PHYSICAL_CYBORG.py)
- [V28_PHYSICAL_CORE.py](/home/daroch/openskynet/src/skynet/experiments/EX/V28_PHYSICAL_CORE.py)
- [exp50_cyborg_minimal_benchmark.py](/home/daroch/openskynet/src/skynet/experiments/experimentos/exp50_cyborg_minimal_benchmark.py)
- [exp51_cyborg_minimal_multiseed.py](/home/daroch/openskynet/src/skynet/experiments/experimentos/exp51_cyborg_minimal_multiseed.py)
- [exp52_organ_search_benchmark.py](/home/daroch/openskynet/src/skynet/experiments/experimentos/exp52_organ_search_benchmark.py)
- [exp53_v28_geometric_quantizer_suite.py](/home/daroch/openskynet/src/skynet/experiments/experimentos/exp53_v28_geometric_quantizer_suite.py)
- [exp54_quantized_organ_perception.py](/home/daroch/openskynet/src/skynet/experiments/experimentos/exp54_quantized_organ_perception.py)

## Main Read

The likely jewel inside `V28` is not the whole cyborg fusion.
It is the continuous organ.

## What Recent Probes Showed

### Cyborg Minimal

`cyborg_minimal` did not justify itself against a plain baseline.

Takeaway:

- the bridge-heavy hybrid is not yet the right next step

### Organ Search

The `organ_only` branch is the strongest live signal in this family.

Key result from `exp52`:

- mean OOD:
  - `gru_baseline`: `0.7318`
  - `organ_only`: `0.9987`

Takeaway:

- the continuous organ deserves its own research cycle

## Geometric Quantizer

Important:

- already existed in `V28`
- was not recreated

What we learned:

- strong anti-aliasing signal in synthetic scaling tests
- useful against block interference
- not yet proven downstream in a harder organ-side task

Takeaway:

- keep as a real mechanism
- do not overrate it

## Current Track Decision

For now:

- prioritize the organ itself
- treat quantization as auxiliary
- deprioritize full cyborg fusion

## Next Questions

1. How robust is the organ with larger, messier observations?
2. What organ parameters matter most:
   - temperature
   - diffusion
   - crystal strength
   - dissipation
3. What is the smallest clean path back toward dynamic topology?
