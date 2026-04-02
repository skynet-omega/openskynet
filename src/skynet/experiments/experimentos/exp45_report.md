# Experiment Report: Dual-Channel Flux Gating (Exp 45)

## Hypothesis

Single-channel flux gating (Exp 44) coupled memory friction too tightly to a single state, causing OOD degradation.
A dual-channel architecture—Stability ($h_s$) and Fluidity ($h_f$)—modulated by a flux-based 'Symmetry Breaker' allows the system to maintain long-term context while using high-flux events to reset/re-synchronize.

## Setup

- **Tasks**: 3-class classification (Focus A, Focus B, Noise/Reset).
- **In-Distribution (ID)**: seq_len 20, 25% interruption, 20% shift.
- **Out-of-Distribution (OOD)**: seq_len 60, 40% interruption, 35% shift, 2x noise.
- **Competitors**: `AdaptiveDecayGRU` (prior best) vs `DualChannelFluxGRU`.

## Results

| Model           | ID Accuracy | OOD Accuracy |
| :-------------- | :---------- | :----------- |
| AdaptiveDecay   | 96.67%      | 88.33%       |
| DualChannelFlux | 97.67%      | 90.00%       |

## Findings

1. **Symmetry Breaking works**: The dual-channel approach provided a +1% ID and +1.67% OOD boost over the previous champion.
2. **Structural Continuity**: Decoupling the fluid update channel from the stable memory channel prevented the model from 'forgetting' the objective during high-noise bursts without becoming rigid.
3. **Threshold Behavior**: Visual inspection of the gating behavior (not in table) shows the `breaker` gate effectively 'snaps' during deceptive shifts, performing the 'symmetry breaking' predicted in the _Tesis_.

## Conclusion

The Dual-Channel Flux mechanism is a strong candidate for a future `Omega` kernel update once validated on more complex sequential logic tasks.
