import {
  loadOmegaSessionTimeline,
  type OmegaSessionTimelineEntry,
  type OmegaSessionValidationSnapshot,
} from "./session-context.js";
import {
  formatOmegaRecoveryEpisodeRecall,
  formatOmegaSemanticRecoveryRecall,
  loadOmegaRecoveryEpisodeRecall,
  loadOmegaSemanticRecoveryRecall,
} from "./episodic-recall.js";

const FEEDBACK_MARKERS = [
  "still",
  "again",
  "didn't",
  "did not",
  "not enough",
  "failed",
  "failure",
  "broken",
  "wrong",
  "sigue",
  "otra vez",
  "no arreglo",
  "no arregl",
  "fallo",
  "falló",
  "rompio",
  "rompió",
  "mal",
] as const;

const VERIFICATION_MARKERS = [
  "check",
  "verify",
  "validate",
  "inspect",
  "review",
  "confirm",
  "revisa",
  "verifica",
  "valida",
  "comprueba",
  "confirma",
] as const;

const ANALYSIS_MARKERS = [
  "why",
  "because",
  "root cause",
  "cause",
  "reason",
  "por que",
  "por qué",
  "causa",
  "motivo",
  "explica",
] as const;

const ACTION_MARKERS = [
  "fix",
  "patch",
  "edit",
  "update",
  "change",
  "modify",
  "write",
  "implement",
  "repair",
  "arregla",
  "corrige",
  "cambia",
  "modifica",
  "edita",
  "implementa",
  "repara",
] as const;

const TEMPORAL_MARKERS = [
  "before",
  "after",
  "previous",
  "prior",
  "again",
  "still",
  "first",
  "then",
  "antes",
  "despues",
  "después",
  "previo",
  "anterior",
  "luego",
  "despues",
] as const;

export type OmegaInteractionKind =
  | "direct_instruction"
  | "corrective_feedback"
  | "verification_request"
  | "analysis_request"
  | "mixed_turn";

export type OmegaInputInterpretation = {
  kind: OmegaInteractionKind;
  summary: string;
  hasTemporalReference: boolean;
  hasCausalFocus: boolean;
  hasActionRequest: boolean;
  hasVerificationRequest: boolean;
  recentFailureKinds: string[];
};

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markerMatches(text: string, marker: string): boolean {
  if (marker.includes(" ")) {
    return text.includes(marker);
  }
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(marker)}($|[^\\p{L}\\p{N}_])`, "u");
  return pattern.test(text);
}

function includesAny(text: string, markers: readonly string[]): boolean {
  return markers.some((marker) => markerMatches(text, marker));
}

function uniqueFailureKinds(entries: OmegaSessionTimelineEntry[]): string[] {
  return Array.from(
    new Set(
      entries
        .map((entry) => entry.outcome.errorKind)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
}

export function interpretOmegaInput(params: {
  task: string;
  validation: OmegaSessionValidationSnapshot;
  timeline?: OmegaSessionTimelineEntry[];
}): OmegaInputInterpretation {
  const normalizedTask = normalizeText(params.task);
  const timeline = params.timeline ?? [];
  const recentEntries = timeline.slice(-3);
  const recentFailureKinds = uniqueFailureKinds(recentEntries.filter((entry) => entry.outcome.status !== "ok"));
  const hasActionRequest =
    params.validation.expectedPaths.length > 0 || includesAny(normalizedTask, ACTION_MARKERS);
  const hasVerificationRequest =
    params.validation.expectsJson ||
    params.validation.expectedKeys.length > 0 ||
    includesAny(normalizedTask, VERIFICATION_MARKERS);
  const hasCausalFocus = includesAny(normalizedTask, ANALYSIS_MARKERS);
  const hasFeedbackMarker =
    includesAny(normalizedTask, FEEDBACK_MARKERS) ||
    (recentFailureKinds.length > 0 && includesAny(normalizedTask, TEMPORAL_MARKERS));
  const hasTemporalReference = includesAny(normalizedTask, TEMPORAL_MARKERS);

  let kind: OmegaInteractionKind = "direct_instruction";
  if (hasFeedbackMarker && hasActionRequest) {
    kind = "corrective_feedback";
  } else if (hasVerificationRequest && hasActionRequest) {
    kind = "mixed_turn";
  } else if (hasCausalFocus) {
    kind = "analysis_request";
  } else if (hasVerificationRequest) {
    kind = "verification_request";
  }

  const summaryMap: Record<OmegaInteractionKind, string> = {
    direct_instruction:
      "This turn is a direct instruction. Act on the current request and preserve unrelated behavior.",
    corrective_feedback:
      "This turn contains feedback about a prior failed attempt plus a request to correct it now.",
    verification_request:
      "This turn asks for validation or inspection. Prefer evidence-backed checking over speculative edits.",
    analysis_request:
      "This turn asks for diagnosis or explanation. Focus on causes, failure mode, and concrete next step.",
    mixed_turn:
      "This turn mixes diagnosis or verification with a concrete action request. Identify the failure mode, then apply the smallest sufficient fix.",
  };

  return {
    kind,
    summary: summaryMap[kind],
    hasTemporalReference,
    hasCausalFocus,
    hasActionRequest,
    hasVerificationRequest,
    recentFailureKinds,
  };
}

export async function buildOmegaInteractionPrompt(params: {
  workspaceRoot: string;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  sessionKey?: string;
  includeTimeline?: boolean;
}): Promise<string | undefined> {
  const timeline =
    params.includeTimeline === false || !params.sessionKey
      ? []
      : await loadOmegaSessionTimeline({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
        });

  const interpretation = interpretOmegaInput({
    task: params.task,
    validation: params.validation,
    timeline,
  });

  const episodicRecall = params.sessionKey
    ? await loadOmegaRecoveryEpisodeRecall({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        task: params.task,
        validation: params.validation,
        errorKind: interpretation.recentFailureKinds[0],
        maxResults: 2,
      })
    : [];

  const semanticRecall = params.sessionKey
    ? await loadOmegaSemanticRecoveryRecall({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        task: params.task,
        validation: params.validation,
        errorKind: interpretation.recentFailureKinds[0],
      })
    : [];

  const useful =
    interpretation.hasActionRequest ||
    interpretation.hasVerificationRequest ||
    interpretation.hasTemporalReference ||
    interpretation.hasCausalFocus ||
    interpretation.recentFailureKinds.length > 0 ||
    episodicRecall.length > 0 ||
    semanticRecall.length > 0;

  if (!useful) {
    return undefined;
  }

  const lines: string[] = [
    "[OMEGA Input Interpretation]",
    `Interaction kind: ${interpretation.kind}`,
    interpretation.summary,
    `Temporal references: ${interpretation.hasTemporalReference ? "present" : "absent"}`,
    `Causal analysis focus: ${interpretation.hasCausalFocus ? "present" : "absent"}`,
  ];

  if (interpretation.recentFailureKinds.length > 0) {
    lines.push(`Recent verified failure signals: ${interpretation.recentFailureKinds.join(", ")}`);
  }
  if (params.validation.expectedPaths.length > 0) {
    lines.push(`Operational targets: ${params.validation.expectedPaths.join(", ")}`);
  }
  if (params.validation.expectedKeys.length > 0) {
    lines.push(`Required evidence keys: ${params.validation.expectedKeys.join(", ")}`);
  }

  if (episodicRecall.length > 0) {
    lines.push("");
    lines.push(...formatOmegaRecoveryEpisodeRecall(episodicRecall));
  }

  if (semanticRecall.length > 0) {
    lines.push("");
    lines.push(...formatOmegaSemanticRecoveryRecall(semanticRecall));
  }

  lines.push("");
  lines.push("[OMEGA Outcome Model]");
  if (interpretation.kind === "corrective_feedback") {
    lines.push(
      "Treat criticism of the previous attempt as new evidence. Do not defend the old answer; update behavior and satisfy the current contract.",
    );
  } else if (interpretation.kind === "verification_request") {
    lines.push(
      "Do not fabricate edits if the turn is asking for checking or confirmation. Return only evidence-backed conclusions.",
    );
  } else if (interpretation.kind === "analysis_request") {
    lines.push(
      "Name the observed failure mode and its cause before proposing a next action. Keep the explanation tied to current evidence.",
    );
  } else if (interpretation.kind === "mixed_turn") {
    lines.push(
      "First identify the failure mode from the current evidence, then apply the smallest change that resolves it.",
    );
  } else {
    lines.push("Act directly, but keep the change local and preserve unrelated state.");
  }

  return lines.join("\n");
}
