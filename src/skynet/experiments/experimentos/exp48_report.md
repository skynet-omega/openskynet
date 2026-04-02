# Experiment Report: Phase-Transition Gating (Exp 48)

## Hypothesis

Stochastic resonance in the fluid phase (induced by temperature-scaled noise) improves OOD resilience by allowing the system to 'tunnel' out of local minima during deceptive shifts.

## Setup

- **Tasks**: 3-class classification with heavy interruption and deceptive shifts.
- **ID**: seq_len 20, 25% interruption, 20% shift, 0.15 noise.
- **OOD**: seq_len 60, 45% interruption, 40% shift, 0.25 noise (Ultra-High Stress).
- **Models**: Bifurcation Ref (Exp 47) vs. Phase Transition (Exp 48).

## Results

| Model               | ID Accuracy | OOD Accuracy |
| :------------------ | :---------- | :----------- |
| **Bifurcation Ref** | **98.00%**  | **93.00%**   |
| Phase Transition    | 95.80%      | 91.80%       |

## Findings

1. **Hypothesis Refuted (for now)**: The addition of stochastic noise in the fluid phase resulted in a -2.2% ID and -1.2% OOD degradation compared to the deterministic Bifurcation Gate.
2. **Deterministic Superiority**: The deterministic Bifurcation Gate (Exp 47) remains the current champion. The 'tunnelling' benefit of stochasticity did not outweigh the loss of precision in these specific sequence tasks.
3. **Training Stability**: While Phase Transition converged, the lower final accuracy suggests the noise might be interfering with the learning of high-confidence decision boundaries even during the fluid phase.

## Conclusion

Bifurcation Gating (Exp 47) is a verified local maximum for solitonic commitment in `src/skynet`. Do not add stochastic noise to the gating mechanism until a task specifically requiring exploration/global-search (like RL) is benchmarked.
