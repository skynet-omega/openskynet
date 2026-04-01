import type {
  SkynetCausalEpisode,
  SkynetCausalValenceLabel,
} from "../causal-valence/episode-ledger.js";
import { deriveSkynetWorldTransitionFeatures } from "../causal-valence/world-transition.js";

export type SkynetRuntimeTrajectorySample = {
  id: string;
  sessionKey: string;
  recordedAt: number;
  lookbackCount: number;
  historyEpisodes: SkynetCausalEpisode[];
  currentEpisode: SkynetCausalEpisode;
  targetLabel: SkynetCausalValenceLabel;
};

export type SkynetRuntimeTrajectoryFeatures = {
  historyCount: number;
  historyProgressRatio: number;
  historyReliefRatio: number;
  historyStallRatio: number;
  historyFrustrationRatio: number;
  historyDamageRatio: number;
  historyOkRatio: number;
  historyErrorRatio: number;
  historyMutationRatio: number;
  historyAverageRecoveryBurden: number;
  historyAverageCollateralDamage: number;
  currentOperationCount: number;
  currentUniquePathCount: number;
  currentCreateRatio: number;
  currentEditRatio: number;
  currentDeleteRatio: number;
  currentRenameRatio: number;
  currentNoopRatio: number;
  currentTargetCoverage: number;
  currentCollateralRatio: number;
  currentFailureStreak: number;
  currentValidationIntensity: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ratio(count: number, total: number): number {
  return total > 0 ? clamp01(count / total) : 0;
}

export function buildSkynetRuntimeTrajectorySamples(params: {
  episodes: SkynetCausalEpisode[];
  lookback?: number;
}): SkynetRuntimeTrajectorySample[] {
  const lookback = Math.max(1, Math.min(8, params.lookback ?? 3));
  const sortedEpisodes = [...params.episodes].sort((left, right) => {
    if (left.sessionKey !== right.sessionKey) {
      return left.sessionKey.localeCompare(right.sessionKey);
    }
    return left.recordedAt - right.recordedAt;
  });
  const bySession = new Map<string, SkynetCausalEpisode[]>();
  for (const episode of sortedEpisodes) {
    const bucket = bySession.get(episode.sessionKey) ?? [];
    bucket.push(episode);
    bySession.set(episode.sessionKey, bucket);
  }

  const samples: SkynetRuntimeTrajectorySample[] = [];
  for (const [sessionKey, sessionEpisodes] of bySession) {
    for (let index = 1; index < sessionEpisodes.length; index += 1) {
      const historyStart = Math.max(0, index - lookback);
      const historyEpisodes = sessionEpisodes.slice(historyStart, index);
      const currentEpisode = sessionEpisodes[index];
      samples.push({
        id: `${sessionKey}:${currentEpisode.id}`,
        sessionKey,
        recordedAt: currentEpisode.recordedAt,
        lookbackCount: historyEpisodes.length,
        historyEpisodes,
        currentEpisode,
        targetLabel: currentEpisode.bootstrapLabel,
      });
    }
  }
  return samples;
}

export function deriveSkynetRuntimeTrajectoryFeatureSummary(
  sample: SkynetRuntimeTrajectorySample,
): SkynetRuntimeTrajectoryFeatures {
  const historyEpisodes = sample.historyEpisodes;
  const historyCount = historyEpisodes.length;
  const labelCount = (label: SkynetCausalValenceLabel): number =>
    historyEpisodes.filter((episode) => episode.bootstrapLabel === label).length;
  const okCount = historyEpisodes.filter((episode) => episode.outcome.status === "ok").length;
  const errorCount = historyEpisodes.filter((episode) => episode.outcome.status !== "ok").length;
  const mutationCount = historyEpisodes.filter((episode) =>
    episode.transition.operations.some((operation) => operation.kind !== "noop"),
  ).length;
  const averageRecoveryBurden =
    historyCount > 0
      ? historyEpisodes.reduce((sum, episode) => sum + episode.outcome.recoveryBurden, 0) /
        historyCount
      : 0;
  const averageCollateralDamage =
    historyCount > 0
      ? historyEpisodes.reduce((sum, episode) => sum + episode.outcome.collateralDamage, 0) /
        historyCount
      : 0;
  const currentTransition = deriveSkynetWorldTransitionFeatures(sample.currentEpisode.transition);

  return {
    historyCount,
    historyProgressRatio: ratio(labelCount("progress"), historyCount),
    historyReliefRatio: ratio(labelCount("relief"), historyCount),
    historyStallRatio: ratio(labelCount("stall"), historyCount),
    historyFrustrationRatio: ratio(labelCount("frustration"), historyCount),
    historyDamageRatio: ratio(labelCount("damage"), historyCount),
    historyOkRatio: ratio(okCount, historyCount),
    historyErrorRatio: ratio(errorCount, historyCount),
    historyMutationRatio: ratio(mutationCount, historyCount),
    historyAverageRecoveryBurden: clamp01(averageRecoveryBurden),
    historyAverageCollateralDamage: clamp01(averageCollateralDamage),
    currentOperationCount: currentTransition.operationCount,
    currentUniquePathCount: currentTransition.uniquePathCount,
    currentCreateRatio: currentTransition.createRatio,
    currentEditRatio: currentTransition.editRatio,
    currentDeleteRatio: currentTransition.deleteRatio,
    currentRenameRatio: currentTransition.renameRatio,
    currentNoopRatio: currentTransition.noopRatio,
    currentTargetCoverage: currentTransition.targetCoverage,
    currentCollateralRatio: currentTransition.collateralRatio,
    currentFailureStreak: sample.currentEpisode.context.failureStreak,
    currentValidationIntensity: sample.currentEpisode.context.validationIntensity,
  };
}

export function encodeSkynetRuntimeTrajectoryFeatures(
  sample: SkynetRuntimeTrajectorySample,
): number[] {
  const summary = deriveSkynetRuntimeTrajectoryFeatureSummary(sample);
  return [
    clamp01(Math.min(summary.historyCount, 4) / 4),
    summary.historyProgressRatio,
    summary.historyReliefRatio,
    summary.historyStallRatio,
    summary.historyFrustrationRatio,
    summary.historyDamageRatio,
    summary.historyOkRatio,
    summary.historyErrorRatio,
    summary.historyMutationRatio,
    summary.historyAverageRecoveryBurden,
    summary.historyAverageCollateralDamage,
    clamp01(Math.min(summary.currentOperationCount, 8) / 8),
    clamp01(Math.min(summary.currentUniquePathCount, 8) / 8),
    summary.currentCreateRatio,
    summary.currentEditRatio,
    summary.currentDeleteRatio,
    summary.currentRenameRatio,
    summary.currentNoopRatio,
    summary.currentTargetCoverage,
    summary.currentCollateralRatio,
    clamp01(Math.min(summary.currentFailureStreak, 4) / 4),
    clamp01(summary.currentValidationIntensity),
  ];
}
