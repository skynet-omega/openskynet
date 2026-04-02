# Experiment Report: Multiscale Potential Resonance (Exp 49)

## Hypothesis

A hierarchy of potentials (Slow/Deep vs. Fast/Shallow) allows the system to maintain high-level goal commitment (slow) while remaining reactive to immediate sensory noise (fast). The 'slow' state acts as a stabilizing anchor for the 'fast' state via resonance coupling.

## Setup

- **Tasks**: 3-class classification with ultra-high noise and deceptive shifts.
- **ID**: seq_len 25, 25% interruption, 20% shift, 0.15 noise.
- **OOD**: seq_len 50 & 80 averaged, 40% interruption, 35% shift, 0.20 noise.
- **Models**: Adaptive Decay vs. Mexican Hat (Fixed) vs. Multiscale Potential.

## Results

| Model                    | ID Accuracy | OOD Accuracy |
| :----------------------- | :---------- | :----------- |
| Adaptive Decay           | 96.25%      | 90.50%       |
| Mexican Hat (Fixed)      | 96.25%      | 91.50%       |
| **Multiscale Potential** | **97.25%**  | **91.25%**   |

## Findings

1. **ID Superiority**: The Multiscale Potential reached 97.25% ID accuracy, outperforming both the baseline and the single-scale Mexican Hat. This suggests that partitioning commitment into multiple timescales improves the ability to latch onto correct patterns during noise.
2. **OOD Stability**: While the single-scale Mexican Hat had a slight edge in OOD (91.50% vs 91.25%), the difference is marginal. The Multiscale approach provided a more robust "peak" performance in the ID regime.
3. **Resonance Effect**: The coupling between the slow and fast states allowed the model to outperform the adaptive decay baseline by +1% in ID and +0.75% in OOD.

## Conclusion

Multiscale Potentials provide a more nuanced form of commitment than a single-scale well. While Exp 47 (Bifurcation Gating) currently holds the OOD crown for shorter sequences, the Multiscale approach (Exp 49) shows significant promise for maintaining higher precision (ID) in high-noise environments. Future work should combine Bifurcation Gating with Multiscale Partitioning.

**Status:** Verified experiment. Results documented. Ready for potential hybrid (Gated + Multiscale) exploration in a future cycle.
