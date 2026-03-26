import fs from "node:fs/promises";
import path from "node:path";
import type { SkynetContinuityState } from "./continuity-tracker.js";
import type { SkynetExperimentPlan } from "./experiment-cycle.js";
import type { SkynetNucleusState } from "./nucleus.js";
import type { SkynetStudyProgram } from "./study-program.js";

export type SkynetCommitmentKind = "artifact" | "reframe" | "stabilize";
export type SkynetArtifactKind = "module" | "benchmark" | "note";

export type SkynetCommitmentDecision = {
  sessionKey: string;
  updatedAt: number;
  kind: SkynetCommitmentKind;
  artifactKind: SkynetArtifactKind;
  targetFocusKey: string;
  chosenWorkItemId?: string;
  chosenWorkItemTitle?: string;
  rationale: string;
  executableTask: string;
  confidence: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resolveCommitmentJsonPath(params: { workspaceRoot: string; sessionKey: string }): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-commitment",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

function resolveCommitmentMarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_COMMITMENT.md");
}

function buildArtifactTask(params: {
  focusKey: string;
  itemTitle?: string;
  experiment: SkynetExperimentPlan;
}): string {
  if (params.focusKey === "endogenous_science_agenda") {
    return "Implement one executable Skynet study artifact that can be validated in the next cycle.";
  }
  return params.itemTitle
    ? `Implement or update the artifact implied by: ${params.itemTitle}.`
    : `Implement the active experiment deliverable: ${params.experiment.deliverable}`;
}

function buildReframeTask(params: {
  itemTitle?: string;
  experiment: SkynetExperimentPlan;
}): string {
  return params.itemTitle
    ? `Produce a new framing for ${params.itemTitle} that changes the next cycle's target or execution route.`
    : `Produce a new framing for the active experiment: ${params.experiment.hypothesis}`;
}

function buildStabilityTask(params: {
  continuity?: SkynetContinuityState;
  experiment: SkynetExperimentPlan;
}): string {
  return `Stabilize continuity before expansion; preserve focus and artifact carry-over above ${
    typeof params.continuity?.continuityScore === "number"
      ? params.continuity.continuityScore.toFixed(2)
      : "current"
  } while preparing the active experiment.`;
}

export function deriveSkynetCommitmentDecision(params: {
  sessionKey: string;
  nucleus: SkynetNucleusState;
  program: SkynetStudyProgram;
  experiment: SkynetExperimentPlan;
  continuity?: SkynetContinuityState;
}): SkynetCommitmentDecision {
  const topItem = params.program.items[0];
  const lowContinuity = (params.continuity?.continuityScore ?? 1) < 0.55;
  const mode = params.nucleus.mode;

  if (lowContinuity || mode === "stabilize") {
    return {
      sessionKey: params.sessionKey,
      updatedAt: Date.now(),
      kind: "stabilize",
      artifactKind: "benchmark",
      targetFocusKey: params.program.focusKey,
      chosenWorkItemId: topItem?.id,
      chosenWorkItemTitle: topItem?.title,
      rationale:
        "Continuity is too weak for aggressive expansion; the next cycle should preserve structure and measure carry-over first.",
      executableTask: buildStabilityTask({
        continuity: params.continuity,
        experiment: params.experiment,
      }),
      confidence: clamp01(0.66 + (0.55 - (params.continuity?.continuityScore ?? 0.55)) * 0.4),
    };
  }

  if (mode === "reframe") {
    return {
      sessionKey: params.sessionKey,
      updatedAt: Date.now(),
      kind: "reframe",
      artifactKind: "note",
      targetFocusKey: params.program.focusKey,
      chosenWorkItemId: topItem?.id,
      chosenWorkItemTitle: topItem?.title,
      rationale:
        "The nucleus is signaling reframe pressure; the next concrete artifact should change plan shape before more execution.",
      executableTask: buildReframeTask({
        itemTitle: topItem?.title,
        experiment: params.experiment,
      }),
      confidence: clamp01(params.nucleus.executive.commitment * 0.95),
    };
  }

  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    kind: "artifact",
    artifactKind: params.program.focusKey === "endogenous_science_agenda" ? "module" : "benchmark",
    targetFocusKey: params.program.focusKey,
    chosenWorkItemId: topItem?.id,
    chosenWorkItemTitle: topItem?.title,
    rationale:
      "Continuity is strong enough to commit to a concrete artifact instead of another planning-only cycle.",
    executableTask: buildArtifactTask({
      focusKey: params.program.focusKey,
      itemTitle: topItem?.title,
      experiment: params.experiment,
    }),
    confidence: clamp01(
      params.nucleus.executive.commitment * 0.72 +
        (params.continuity?.continuityScore ?? 0.7) * 0.28,
    ),
  };
}

function buildCommitmentMarkdown(decision: SkynetCommitmentDecision): string {
  return [
    "# SKYNET Commitment",
    "",
    `Updated: ${new Date(decision.updatedAt).toISOString()}`,
    `Session: ${decision.sessionKey}`,
    `Kind: ${decision.kind}`,
    `Artifact kind: ${decision.artifactKind}`,
    `Focus: ${decision.targetFocusKey}`,
    `Confidence: ${decision.confidence.toFixed(2)}`,
    "",
    "## Rationale",
    "",
    decision.rationale,
    "",
    "## Executable Task",
    "",
    decision.executableTask,
    "",
  ].join("\n");
}

export async function syncSkynetCommitmentDecision(params: {
  workspaceRoot: string;
  sessionKey: string;
  nucleus: SkynetNucleusState;
  program: SkynetStudyProgram;
  experiment: SkynetExperimentPlan;
  continuity?: SkynetContinuityState;
}): Promise<SkynetCommitmentDecision> {
  const decision = deriveSkynetCommitmentDecision(params);
  const jsonPath = resolveCommitmentJsonPath({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const markdownPath = resolveCommitmentMarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(decision, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildCommitmentMarkdown(decision), "utf-8");
  return decision;
}

export function formatSkynetCommitmentBlock(decision?: SkynetCommitmentDecision): string[] {
  if (!decision) {
    return [];
  }
  return [
    "",
    "[Skynet Commitment]",
    `Kind: ${decision.kind} | artifact ${decision.artifactKind} | confidence ${decision.confidence.toFixed(2)}`,
    `Rationale: ${decision.rationale}`,
    `Executable task: ${decision.executableTask}`,
  ];
}
