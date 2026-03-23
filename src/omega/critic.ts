import type { OmegaSessionTaskValidationSummary } from "./session-task.js";
import type { OmegaStructuredTask } from "./types.js";

export type OmegaCriticVerdict = "high_value" | "useful" | "low_value" | "invalid";

export type OmegaOutcomeCritique = {
  verdict: OmegaCriticVerdict;
  score: number;
  reasons: string[];
  errorKind?:
    | "low_value_result"
    | "invalid_structured_result"
    | "target_not_touched"
    | "missing_target_writes"
    | "unexpected_collateral_writes";
  message: string;
};

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function countWords(value: string | undefined): number {
  return (value ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function fileName(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

function replyMentionsTargets(reply: string | undefined, expectedPaths: string[]): boolean {
  const normalizedReply = normalizeText(reply);
  if (!normalizedReply || expectedPaths.length === 0) {
    return false;
  }
  return expectedPaths.some((expectedPath) => {
    const normalizedPath = normalizeText(expectedPath);
    return (
      normalizedReply.includes(normalizedPath) ||
      normalizedReply.includes(normalizeText(fileName(expectedPath)))
    );
  });
}

function replyLooksSubstantive(reply: string | undefined): boolean {
  const normalizedReply = normalizeText(reply);
  if (!normalizedReply) {
    return false;
  }
  if (normalizedReply.startsWith("{") && normalizedReply.endsWith("}")) {
    return true;
  }
  return countWords(reply) >= 6;
}

function replyJustRepeatsTask(task: string, reply: string | undefined): boolean {
  const normalizedTask = normalizeText(task);
  const normalizedReply = normalizeText(reply);
  if (!normalizedTask || !normalizedReply) {
    return false;
  }
  return normalizedReply === normalizedTask || normalizedReply.includes(`task: ${normalizedTask}`);
}

export function critiqueOmegaOutcome(params: {
  task: string;
  validation?: OmegaSessionTaskValidationSummary;
  reply?: string;
  observedChangedFiles?: string[];
  expectedPaths?: OmegaStructuredTask["expectedPaths"];
}): OmegaOutcomeCritique {
  const reasons: string[] = [];
  const expectedPaths = params.expectedPaths ?? [];
  const observedChangedFiles = params.observedChangedFiles ?? [];

  if (params.validation?.structured && !params.validation.structured.ok) {
    return {
      verdict: "invalid",
      score: 0.05,
      reasons: ["structured_contract_failed"],
      errorKind: params.validation.structured.errorKind,
      message: params.validation.structured.message,
    };
  }

  if (params.validation?.write && !params.validation.write.ok) {
    return {
      verdict: "invalid",
      score: 0.05,
      reasons: ["required_target_writes_missing"],
      errorKind: params.validation.write.errorKind,
      message: params.validation.write.message,
    };
  }

  const hasObservedWrites = observedChangedFiles.length > 0;
  const substantiveReply = replyLooksSubstantive(params.reply);
  const mentionsTargets = replyMentionsTargets(params.reply, expectedPaths);

  if (!hasObservedWrites && !substantiveReply) {
    return {
      verdict: "low_value",
      score: 0.2,
      reasons: ["no_disk_delta", "no_substantive_reply"],
      errorKind: "low_value_result",
      message: "OMEGA completed the turn without evidence of useful work or a substantive reply.",
    };
  }

  if (!hasObservedWrites && replyJustRepeatsTask(params.task, params.reply)) {
    return {
      verdict: "low_value",
      score: 0.25,
      reasons: ["reply_repeats_task_without_progress"],
      errorKind: "low_value_result",
      message: "OMEGA repeated the request without showing useful progress.",
    };
  }

  if (hasObservedWrites && (mentionsTargets || params.validation?.structured?.ok)) {
    reasons.push("verified_disk_delta");
    if (mentionsTargets) {
      reasons.push("reply_mentions_targets");
    }
    if (params.validation?.structured?.ok) {
      reasons.push("structured_contract_satisfied");
    }
    return {
      verdict: "high_value",
      score: 0.9,
      reasons,
      message: "OMEGA produced verified work aligned with the requested outcome.",
    };
  }

  if (hasObservedWrites || substantiveReply) {
    if (hasObservedWrites) {
      reasons.push("verified_disk_delta");
    }
    if (substantiveReply) {
      reasons.push("substantive_reply");
    }
    return {
      verdict: "useful",
      score: hasObservedWrites ? 0.75 : 0.6,
      reasons,
      message: "OMEGA produced evidence of useful progress.",
    };
  }

  return {
    verdict: "low_value",
    score: 0.3,
    reasons: ["ambiguous_progress"],
    errorKind: "low_value_result",
    message: "OMEGA did not produce enough evidence to justify the turn as useful.",
  };
}
