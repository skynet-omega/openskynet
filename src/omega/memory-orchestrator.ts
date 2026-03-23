import type { OmegaDurableMemoryEntry } from "./durable-memory.js";
import type { OmegaOperationalTurnMemoryEntry } from "./operational-memory.js";

export type OmegaMemoryHealth = "stable" | "needs_revalidation" | "stalled";

export type OmegaMemoryOrchestratorSummary = {
  health: OmegaMemoryHealth;
  promotionCandidates: number;
  revalidationCandidates: number;
  repeatedFailurePatterns: string[];
  recentUsefulSuccesses: number;
};

function collectRepeatedFailurePatterns(entries: OmegaDurableMemoryEntry[]): string[] {
  return Array.from(
    new Set(
      entries
        .filter((entry) => entry.kind === "repeated_failure" && typeof entry.errorKind === "string")
        .map((entry) => entry.errorKind as string),
    ),
  );
}

export function summarizeOmegaMemoryOrchestration(params: {
  durableMemory: OmegaDurableMemoryEntry[];
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
}): OmegaMemoryOrchestratorSummary {
  const promotionCandidates = params.durableMemory.filter(
    (entry) => entry.kind === "verified_success" && entry.successCount >= 2,
  ).length;
  const revalidationCandidates = params.durableMemory.filter(
    (entry) => entry.kind === "repeated_failure" && entry.failureCount >= 3,
  ).length;
  const recentUsefulSuccesses = params.durableMemory.filter(
    (entry) => entry.kind === "verified_success" && entry.successCount > 0,
  ).length;
  const recentStalledTurns = params.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;

  let health: OmegaMemoryHealth = "stable";
  if (recentStalledTurns >= 2) {
    health = "stalled";
  } else if (revalidationCandidates > 0) {
    health = "needs_revalidation";
  }

  return {
    health,
    promotionCandidates,
    revalidationCandidates,
    repeatedFailurePatterns: collectRepeatedFailurePatterns(params.durableMemory),
    recentUsefulSuccesses,
  };
}
