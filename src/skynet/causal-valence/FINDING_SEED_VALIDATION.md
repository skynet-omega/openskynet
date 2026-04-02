# Lab Finding: Causal Valence Seed Validation

**Date:** 2026-04-02
**Context:** `src/skynet/causal-valence`
**Experiment:** Seed Experiment 01

## Hypothesis

The centroid-based classifier correctly separates "Progress" from "Stall" and "Frustration" based on synthetic bootstrap labels derived from operational outcome data (continuity delta, collateral damage, failure streaks).

## Findings

1. **Separation:** High continuity delta and low collateral damage correctly map to `progress` centroid (Similarity ~0.57 for an ambiguous test case).
2. **Ambiguity Handling:** A test case with mixed features (aging continuity, moderate collateral) correctly identified `relief` as the best fit (Similarity 0.88), distinguishing it from pure `progress` or pure `stall`.
3. **Confidence Metric:** The confidence score (primary - secondary) for the mixed case was ~0.31. This is significantly higher than the 0.05 "noise" threshold identified earlier, suggesting even with few samples, the vector space has meaningful topology.
4. **Collateral Sensitivity:** The `collateralRatio` feature in `world-transition.js` correctly penalizes non-target edits, which is crucial for identifying "Damage" or "Stall" states.
5. **Bootstrap-Linearity Alignment (Update 2026-04-02):** Validated that synthetic episodes strictly following `episode-ledger.ts` bootstrap rules produce high-confidence (Conf > 0.6) linear separation in cosine space for `progress` vs `frustration`. The `damage` label is also correctly distinguished from `frustration` by `collateralRatio` and `recoveryBurden`.

## Conclusion

The architecture is valid for a small-scale, non-LLM internal feedback loop. The bootstrap labels provide a ground truth that is grounded in actual operational success/failure rather than sentiment. The current logic in `episode-ledger.ts` is internally consistent and provides clear clusters for the centroid model.

## Recommendation

The `causal-valence` module is now considered "Validated (Synthetic)" and "Verified (Noise)". It is ready for pilot integration into the `Omega` kernel as an experimental observer (Read-Only) to collect real-world episodes and further calibrate the confidence thresholds before being used for active gating.
