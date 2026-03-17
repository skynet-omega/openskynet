import type { OmegaSessionSelfState } from "../event-model.js";
import {
  interpretOmegaInput,
  type OmegaInputInterpretation,
  type OmegaInteractionKind,
} from "../interaction-model.js";
import type {
  OmegaSessionTimelineEntry,
  OmegaSessionValidationSnapshot,
} from "../session-context.js";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";
import { deriveOmegaTensionState, type OmegaTensionState } from "./tension-engine.js";

export type OmegaFrontalAction =
  | {
      kind: "none";
      interaction: OmegaInputInterpretation;
      tension: OmegaTensionState;
    }
  | {
      kind: "reuse_verified_result";
      interaction: OmegaInputInterpretation;
      tension: OmegaTensionState;
      cachedReply: string;
      cachedAt: number;
    }
  | {
      kind: "escalate_isolated_repair";
      interaction: OmegaInputInterpretation;
      tension: OmegaTensionState;
      reason: string;
    };

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sameValidation(
  left: OmegaSessionValidationSnapshot,
  right: OmegaSessionValidationSnapshot,
): boolean {
  return (
    left.expectsJson === right.expectsJson &&
    JSON.stringify(left.expectedKeys) === JSON.stringify(right.expectedKeys) &&
    JSON.stringify(left.expectedPaths) === JSON.stringify(right.expectedPaths)
  );
}

function isCacheableInteraction(kind: OmegaInteractionKind): boolean {
  return kind === "verification_request" || kind === "analysis_request";
}

function trackedFileChangedAfter(params: {
  kernel?: OmegaSelfTimeKernelState;
  filePath: string;
  turnIndex?: number;
  createdAt: number;
}): boolean {
  const tracked = params.kernel?.causalGraph.files.find((file) => file.path === params.filePath);
  if (typeof params.turnIndex === "number" && typeof tracked?.lastWriteTurn === "number") {
    return tracked.lastWriteTurn > params.turnIndex;
  }
  return typeof tracked?.lastWriteAt === "number" && tracked.lastWriteAt > params.createdAt;
}

function hasSuccessfulWriteAfter(params: {
  timeline: OmegaSessionTimelineEntry[];
  startIndex: number;
}): boolean {
  for (let index = params.startIndex + 1; index < params.timeline.length; index += 1) {
    const entry = params.timeline[index];
    if (entry.outcome.status !== "ok") {
      continue;
    }
    if ((entry.outcome.observedChangedFiles?.length ?? 0) > 0) {
      return true;
    }
    if (entry.validation.expectedPaths.length > 0) {
      return true;
    }
  }
  return false;
}

function findReusableReply(params: {
  task: string;
  validation: OmegaSessionValidationSnapshot;
  timeline: OmegaSessionTimelineEntry[];
  kernel?: OmegaSelfTimeKernelState;
}): OmegaSessionTimelineEntry | undefined {
  const currentTurnCount = params.kernel?.turnCount ?? params.timeline.length;
  for (let index = params.timeline.length - 1; index >= 0; index -= 1) {
    const entry = params.timeline[index];
    const entryTurn = currentTurnCount - (params.timeline.length - 1 - index);
    const causalTargets =
      entry.causalTargets && entry.causalTargets.length > 0
        ? entry.causalTargets
        : params.validation.expectedPaths;
    if (
      entry.outcome.status === "ok" &&
      typeof entry.reply === "string" &&
      entry.reply.trim().length > 0 &&
      normalizeText(entry.task) === normalizeText(params.task) &&
      sameValidation(entry.validation, params.validation)
    ) {
      if (causalTargets.length === 0 && hasSuccessfulWriteAfter({
        timeline: params.timeline,
        startIndex: index,
      })) {
        continue;
      }
      if (
        causalTargets.length > 0 &&
        causalTargets.some((filePath) =>
          trackedFileChangedAfter({
            kernel: params.kernel,
            filePath,
            turnIndex: entryTurn,
            createdAt: entry.createdAt,
          }),
        )
      ) {
        continue;
      }
      return entry;
    }
  }
  return undefined;
}

function currentTargetsHaveRepeatedWriteFailure(params: {
  kernel?: OmegaSelfTimeKernelState;
  expectedPaths: string[];
}): boolean {
  if (!params.kernel || params.expectedPaths.length === 0) {
    return false;
  }
  return params.expectedPaths.some((filePath) => {
    const tracked = params.kernel?.causalGraph.files.find((file) => file.path === filePath);
    return (
      !!tracked &&
      tracked.failureCount >= 2 &&
      ["target_not_touched", "missing_target_writes"].includes(tracked.lastFailureKind ?? "") &&
      (tracked.lastFailureTurn ?? 0) >= (tracked.lastWriteTurn ?? 0)
    );
  });
}

export function decideOmegaFrontalAction(params: {
  task: string;
  validation: OmegaSessionValidationSnapshot;
  timeline: OmegaSessionTimelineEntry[];
  state?: OmegaSessionSelfState;
  kernel?: OmegaSelfTimeKernelState;
}): OmegaFrontalAction {
  const interaction = interpretOmegaInput({
    task: params.task,
    validation: params.validation,
    timeline: params.timeline,
  });
  const tension = deriveOmegaTensionState({
    timeline: params.timeline,
    state: params.state,
    kernel: params.kernel,
    interpretation: interaction,
  });

  const cachedEntry = findReusableReply({
    task: params.task,
    validation: params.validation,
    timeline: params.timeline,
    kernel: params.kernel,
  });
  if (
    cachedEntry &&
    isCacheableInteraction(interaction.kind) &&
    cachedEntry.outcome.status === "ok" &&
    typeof cachedEntry.reply === "string" &&
    cachedEntry.reply.trim().length > 0
  ) {
    return {
      kind: "reuse_verified_result",
      interaction,
      tension,
      cachedReply: cachedEntry.reply,
      cachedAt: cachedEntry.createdAt,
    };
  }

  if (
    params.validation.expectedPaths.length > 0 &&
    (interaction.kind === "corrective_feedback" || interaction.kind === "mixed_turn") &&
    currentTargetsHaveRepeatedWriteFailure({
      kernel: params.kernel,
      expectedPaths: params.validation.expectedPaths,
    }) &&
    tension.failureStreak >= 2
  ) {
    return {
      kind: "escalate_isolated_repair",
      interaction,
      tension,
      reason: "repeated_verified_write_failure",
    };
  }

  return {
    kind: "none",
    interaction,
    tension,
  };
}
