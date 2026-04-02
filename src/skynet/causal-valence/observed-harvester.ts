import fs from "node:fs/promises";
import { classifyOpenSkynetRuntimeFailure } from "../../infra/runtime-failure.js";
import type {
  SkynetCausalContinuityFreshness,
  SkynetCausalEpisode,
  SkynetCausalEpisodeContext,
  SkynetCausalFailureClass,
  SkynetCausalFailureDomain,
  SkynetCausalEpisodeOutcome,
} from "./episode-ledger.js";
import { deriveSkynetBootstrapValenceLabel } from "./episode-ledger.js";
import { extractSkynetShellAction } from "./shell-action-extractor.js";
import type {
  SkynetTransitionOperationKind,
  SkynetWorldTransitionObservation,
} from "./world-transition.js";

type TranscriptLine = {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    toolCallId?: string;
    toolName?: string;
    details?: Record<string, unknown>;
    content?: unknown[];
  };
};

type PendingToolCall = {
  id: string;
  toolName: string;
  recordedAt: number;
  arguments: Record<string, unknown>;
};

type DerivedAction =
  | {
      transition: SkynetWorldTransitionObservation;
      validationIntensity: number;
      mutative: boolean;
      semanticKind:
        | "discover"
        | "read"
        | "validate"
        | "create"
        | "delete"
        | "rename"
        | "edit"
        | "gateway";
    }
  | undefined;

export type SkynetObservedHarvestResult = {
  episodes: SkynetCausalEpisode[];
  skippedToolResults: number;
  harvestedToolResults: number;
  sourceSessionFiles: string[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseTimestamp(timestamp: string | undefined, fallback: number): number {
  const value = timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

function deriveContinuityFreshness(
  previousRecordedAt: number | undefined,
  currentRecordedAt: number,
): SkynetCausalContinuityFreshness {
  if (previousRecordedAt === undefined) {
    return "missing";
  }
  const deltaMs = Math.max(0, currentRecordedAt - previousRecordedAt);
  if (deltaMs <= 15 * 60 * 1000) {
    return "fresh";
  }
  if (deltaMs <= 2 * 60 * 60 * 1000) {
    return "aging";
  }
  return "stale";
}

function parseWritePathFromContent(content: unknown[] | undefined): string | undefined {
  const firstText = content?.find(
    (part) => part && typeof part === "object" && (part as { type?: string }).type === "text",
  ) as { text?: string } | undefined;
  const text = firstText?.text;
  if (typeof text !== "string") {
    return undefined;
  }
  const match = text.match(/Successfully wrote \d+ bytes to (.+)$/m);
  return match?.[1]?.trim();
}

function deriveToolTransition(
  toolCall: PendingToolCall,
  toolResult: TranscriptLine["message"],
): DerivedAction {
  if (toolCall.toolName === "exec" && typeof toolCall.arguments.command === "string") {
    const extraction = extractSkynetShellAction(toolCall.arguments.command);
    if (!extraction.extractable) {
      return undefined;
    }
    const kindMap: Record<string, SkynetTransitionOperationKind> = {
      discover: "noop",
      read: "noop",
      validate: "noop",
      create: "create",
      delete: "delete",
      rename: "rename",
    };
    const validationIntensity =
      extraction.kind === "validate"
        ? 0.95
        : extraction.kind === "discover" || extraction.kind === "read"
          ? 0.2
          : 0.7;
    return {
      transition: {
        targetPaths: extraction.referencedPaths,
        operations: extraction.referencedPaths.map((path) => ({
          path,
          kind: kindMap[extraction.kind] ?? "noop",
          isTarget: true,
        })),
      },
      validationIntensity,
      mutative:
        extraction.kind === "create" ||
        extraction.kind === "delete" ||
        extraction.kind === "rename",
      semanticKind:
        extraction.kind === "discover" ||
        extraction.kind === "read" ||
        extraction.kind === "validate" ||
        extraction.kind === "create" ||
        extraction.kind === "delete" ||
        extraction.kind === "rename"
          ? extraction.kind
          : "discover",
    };
  }

  if (toolCall.toolName === "read") {
    const filePath =
      typeof toolCall.arguments.file_path === "string"
        ? toolCall.arguments.file_path
        : typeof toolCall.arguments.filePath === "string"
          ? toolCall.arguments.filePath
          : undefined;
    if (!filePath) {
      return undefined;
    }
    return {
      transition: {
        targetPaths: [filePath],
        operations: [{ path: filePath, kind: "noop", isTarget: true }],
      },
      validationIntensity: 0.2,
      mutative: false,
      semanticKind: "read",
    };
  }

  if (toolCall.toolName === "edit") {
    const filePath =
      typeof toolCall.arguments.file_path === "string"
        ? toolCall.arguments.file_path
        : typeof toolCall.arguments.filePath === "string"
          ? toolCall.arguments.filePath
          : undefined;
    if (!filePath) {
      return undefined;
    }
    return {
      transition: {
        targetPaths: [filePath],
        operations: [{ path: filePath, kind: "edit", isTarget: true }],
      },
      validationIntensity: 0.85,
      mutative: true,
      semanticKind: "edit",
    };
  }

  if (toolCall.toolName === "write") {
    const filePath =
      (typeof toolCall.arguments.file_path === "string" && toolCall.arguments.file_path) ||
      (typeof toolCall.arguments.filePath === "string" && toolCall.arguments.filePath) ||
      parseWritePathFromContent(toolResult?.content);
    if (!filePath) {
      return undefined;
    }
    return {
      transition: {
        targetPaths: [filePath],
        operations: [{ path: filePath, kind: "edit", isTarget: true }],
      },
      validationIntensity: 0.8,
      mutative: true,
      semanticKind: "edit",
    };
  }

  if (toolCall.toolName === "gateway") {
    const action =
      typeof toolCall.arguments.action === "string" ? toolCall.arguments.action : undefined;
    const targetPath =
      typeof toolCall.arguments.path === "string" ? toolCall.arguments.path : undefined;
    if (!action || !targetPath) {
      return undefined;
    }
    return {
      transition: {
        targetPaths: [`gateway:${action}:${targetPath}`],
        operations: [{ path: `gateway:${action}:${targetPath}`, kind: "noop", isTarget: true }],
      },
      validationIntensity: 0.3,
      mutative: false,
      semanticKind: "gateway",
    };
  }

  return undefined;
}

function deriveOutcome(params: {
  details: Record<string, unknown> | undefined;
  toolResult: TranscriptLine["message"];
  mutative: boolean;
  semanticKind:
    | "discover"
    | "read"
    | "validate"
    | "create"
    | "delete"
    | "rename"
    | "edit"
    | "gateway";
  targetCount: number;
  validationIntensity: number;
}): SkynetCausalEpisodeOutcome | undefined {
  const details = params.details ?? {};
  const detailStatus = typeof details.status === "string" ? details.status : undefined;
  if (detailStatus === "running") {
    return undefined;
  }
  const exitCode = typeof details.exitCode === "number" ? details.exitCode : undefined;
  const textBlocks = (params.toolResult?.content ?? [])
    .filter(
      (part) =>
        part &&
        typeof part === "object" &&
        (part as { type?: string }).type === "text" &&
        typeof (part as { text?: string }).text === "string",
    )
    .map((part) => String((part as { text: string }).text));
  const combinedText = [typeof details.error === "string" ? details.error : "", ...textBlocks]
    .join("\n")
    .toLowerCase();
  const hasErrorText =
    typeof details.error === "string" ||
    textBlocks.some((text) => text.includes('"status": "error"'));
  const isOk =
    !hasErrorText && detailStatus !== "error" && (exitCode === undefined || exitCode === 0);
  const failure: {
    failureDomain: SkynetCausalFailureDomain;
    failureClass: SkynetCausalFailureClass;
  } = classifyOpenSkynetRuntimeFailure({
    status: detailStatus,
    errorText: combinedText,
    isOk,
  });
  const targetSatisfied =
    isOk &&
    (params.targetCount > 0 ||
      params.semanticKind === "discover" ||
      params.semanticKind === "read" ||
      params.semanticKind === "validate" ||
      params.semanticKind === "gateway");
  const status: SkynetCausalEpisodeOutcome["status"] = isOk
    ? "ok"
    : detailStatus === "timeout"
      ? "timeout"
      : "error";
  return {
    status,
    failureDomain: failure.failureDomain,
    failureClass: failure.failureClass,
    targetSatisfied,
    validationPassed: isOk,
    continuityDelta: isOk
      ? params.mutative
        ? 0.65
        : params.validationIntensity >= 0.75
          ? 0.4
          : 0.2
      : 0,
    recoveryBurden: isOk
      ? 0.1
      : failure.failureDomain === "environmental"
        ? params.mutative
          ? 0.45
          : 0.25
        : params.mutative
          ? 0.75
          : 0.45,
    collateralDamage:
      !isOk &&
      failure.failureDomain !== "environmental" &&
      params.mutative &&
      params.targetCount > 1
        ? 0.45
        : !isOk && failure.failureDomain !== "environmental" && params.mutative
          ? 0.25
          : 0,
  };
}

function createEpisode(params: {
  sessionFile: string;
  toolCall: PendingToolCall;
  transition: SkynetWorldTransitionObservation;
  validationIntensity: number;
  outcome: SkynetCausalEpisodeOutcome;
  failureStreak: number;
  freshness: SkynetCausalContinuityFreshness;
}): SkynetCausalEpisode {
  const context: SkynetCausalEpisodeContext = {
    continuityFreshness: params.freshness,
    failureStreak: params.failureStreak,
    targetCount: params.transition.targetPaths?.length ?? 0,
    validationIntensity: clamp01(params.validationIntensity),
  };
  return {
    id: `${params.toolCall.id}:${params.toolCall.recordedAt}`,
    sessionKey: params.sessionFile,
    recordedAt: params.toolCall.recordedAt,
    context,
    transition: params.transition,
    outcome: params.outcome,
    bootstrapLabel: deriveSkynetBootstrapValenceLabel({ context, outcome: params.outcome }),
  };
}

export async function harvestSkynetObservedCausalEpisodes(params: {
  sessionFiles: string[];
}): Promise<SkynetObservedHarvestResult> {
  const episodes: SkynetCausalEpisode[] = [];
  let harvestedToolResults = 0;
  let skippedToolResults = 0;

  for (const sessionFile of params.sessionFiles) {
    const raw = await fs.readFile(sessionFile, "utf-8");
    const pending = new Map<string, PendingToolCall>();
    let failureStreak = 0;
    let previousRecordedAt: number | undefined;

    for (const line of raw.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const parsed = JSON.parse(line) as TranscriptLine;
      const message = parsed.message;
      if (
        parsed.type === "message" &&
        message?.role === "assistant" &&
        Array.isArray(message.content)
      ) {
        const recordedAt = parseTimestamp(parsed.timestamp, Date.now());
        for (const part of message.content) {
          if (
            !part ||
            typeof part !== "object" ||
            (part as { type?: string }).type !== "toolCall"
          ) {
            continue;
          }
          const toolCall = part as {
            id?: string;
            name?: string;
            arguments?: Record<string, unknown>;
          };
          if (typeof toolCall.id !== "string" || typeof toolCall.name !== "string") {
            continue;
          }
          pending.set(toolCall.id, {
            id: toolCall.id,
            toolName: toolCall.name,
            recordedAt,
            arguments: toolCall.arguments ?? {},
          });
        }
      }

      if (
        parsed.type === "message" &&
        message?.role === "toolResult" &&
        typeof message.toolCallId === "string"
      ) {
        const toolCall = pending.get(message.toolCallId);
        if (!toolCall) {
          skippedToolResults += 1;
          continue;
        }
        const derived = deriveToolTransition(toolCall, message);
        if (!derived) {
          skippedToolResults += 1;
          continue;
        }
        const outcome = deriveOutcome({
          details: message.details,
          toolResult: message,
          mutative: derived.mutative,
          semanticKind: derived.semanticKind,
          targetCount: derived.transition.targetPaths?.length ?? 0,
          validationIntensity: derived.validationIntensity,
        });
        if (!outcome) {
          skippedToolResults += 1;
          continue;
        }
        const freshness = deriveContinuityFreshness(previousRecordedAt, toolCall.recordedAt);
        const episode = createEpisode({
          sessionFile,
          toolCall,
          transition: derived.transition,
          validationIntensity: derived.validationIntensity,
          outcome,
          failureStreak,
          freshness,
        });
        episodes.push(episode);
        harvestedToolResults += 1;
        previousRecordedAt = toolCall.recordedAt;
        failureStreak = outcome.status === "ok" ? 0 : failureStreak + 1;
      }
    }
  }

  return {
    episodes,
    skippedToolResults,
    harvestedToolResults,
    sourceSessionFiles: params.sessionFiles,
  };
}
