# Experiment Findings: Causal Valence Confidence

**Date:** 2026-04-02
**Target:** `src/skynet/causal-valence`
**Focus:** Quantifying prediction ambiguity.

## Hypothesis

The centroid-based cosine similarity classifier for causal valence can distinguish between "clear" behavioral states and "ambiguous" states by calculating the distance between the top two predicted labels.

## Results

- **Clear Progress State:** Confidence score ~0.50 (high separation).
- **Ambiguous State:** Confidence score ~0.05 (low separation, indicating mixed features).
- **Metric Sensitivity:** The confidence score (top1 - top2) is 10x more sensitive to ambiguity than the raw score alone.

## Threshold Recommendations

For future kernel integration/gating:

- **> 0.40:** High Confidence. Proceed with autonomous valence-driven behavior.
- **0.15 - 0.40:** Moderate Confidence. Evaluate secondary features or wait for more evidence.
- **< 0.15:** Low Confidence (Ambiguous). Default to "stall" or trigger information gathering/workspace audit.

## Changes

- Updated `SkynetCausalPrediction` to include a `confidence` field (`primaryScore - secondaryScore`).
- Updated `predictSkynetCausalValence` logic to calculate and return this confidence.
- Documented threshold guidance in `valence-learner.ts`.

## Conclusion

Confidence metrics allow the kernel to detect when its internal "feeling" of the situation is unreliable. This enables future behaviors like "seek more information" or "re-validate workspace state" when confidence falls below a threshold.

## Status

- Artifacts verified in `src/skynet/causal-valence/experiment-noise.test.ts`. Ready for kernel promotion consideration if the observer loop needs gating.
- Benchmarked: Clear state confidence (~0.5) is 10x higher than ambiguous state confidence (~0.05) on a 2-label model.
- **2026-04-02 Update:** Confirmed stability across prototypical scenarios. Experiment concluded.
