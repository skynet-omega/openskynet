import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { SkynetCommitmentDecision } from "../commitment-engine.js";
import type { SkynetContinuityState } from "../continuity-tracker.js";
import type { SkynetExperimentPlan } from "../experiment-cycle.js";
import type { SkynetNucleusState } from "../nucleus.js";
import { syncOpenSkynetRuntimeAuthority } from "../runtime-authority.js";
import type { SkynetStudyProgram } from "../study-program.js";

export type SkynetAutonomyPulseVerdict = "intensify" | "maintain" | "stabilize" | "reframe";

export type SkynetAutonomyPulse01Result = {
  sessionKey: string;
  updatedAt: number;
  initiativePressure: number;
  verdict: SkynetAutonomyPulseVerdict;
  focusKey?: string;
  topWorkItem?: string;
  executableTask?: string;
  rationale: string[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resolveResultJsonPath(params: { workspaceRoot: string; sessionKey: string }): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-autonomy-pulse-01.json`,
  );
}

function resolveResultMarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_AUTONOMY_PULSE_01.md");
}

function deriveInitiativePressure(params: {
  continuity?: SkynetContinuityState;
  nucleus?: SkynetNucleusState;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
  program?: SkynetStudyProgram;
}): number {
  const continuity = params.continuity?.continuityScore ?? 0;
  const commitment = params.commitment?.confidence ?? 0;
  const curiosity = params.nucleus?.metabolism.curiosity ?? 0;
  const commitmentBias =
    params.commitment?.kind === "artifact"
      ? 0.08
      : params.commitment?.kind === "reframe"
        ? -0.04
        : -0.08;
  const programBias = params.program?.items.length
    ? Math.min(params.program.items.length, 3) * 0.03
    : 0;
  const experimentBias = params.experiment ? 0.08 : 0;

  return clamp01(
    continuity * 0.34 +
      commitment * 0.28 +
      curiosity * 0.22 +
      commitmentBias +
      programBias +
      experimentBias,
  );
}

function deriveVerdict(params: {
  initiativePressure: number;
  continuity?: SkynetContinuityState;
  nucleus?: SkynetNucleusState;
  commitment?: SkynetCommitmentDecision;
}): SkynetAutonomyPulseVerdict {
  if ((params.continuity?.continuityScore ?? 1) < 0.55 || params.commitment?.kind === "stabilize") {
    return "stabilize";
  }
  if (params.nucleus?.mode === "reframe" || params.commitment?.kind === "reframe") {
    return "reframe";
  }
  if (params.initiativePressure >= 0.78) {
    return "intensify";
  }
  return "maintain";
}

export function deriveSkynetAutonomyPulse01(params: {
  continuity?: SkynetContinuityState;
  nucleus?: SkynetNucleusState;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
  program?: SkynetStudyProgram;
  sessionKey: string;
}): SkynetAutonomyPulse01Result {
  const initiativePressure = deriveInitiativePressure(params);
  const verdict = deriveVerdict({
    initiativePressure,
    continuity: params.continuity,
    nucleus: params.nucleus,
    commitment: params.commitment,
  });

  const rationale = [
    `continuity=${typeof params.continuity?.continuityScore === "number" ? params.continuity.continuityScore.toFixed(2) : "n/a"}`,
    `commitment=${typeof params.commitment?.confidence === "number" ? params.commitment.confidence.toFixed(2) : "n/a"}`,
    `curiosity=${typeof params.nucleus?.metabolism.curiosity === "number" ? params.nucleus.metabolism.curiosity.toFixed(2) : "n/a"}`,
    `verdict=${verdict}`,
  ];

  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    initiativePressure,
    verdict,
    focusKey: params.program?.focusKey,
    topWorkItem: params.program?.items[0]?.title,
    executableTask: params.commitment?.executableTask,
    rationale,
  };
}

function buildResultMarkdown(result: SkynetAutonomyPulse01Result): string {
  return [
    "# SKYNET Experiment - Autonomy Pulse 01",
    "",
    `Updated: ${new Date(result.updatedAt).toISOString()}`,
    `Session: ${result.sessionKey}`,
    `Focus: ${result.focusKey ?? "none"}`,
    `Initiative pressure: ${result.initiativePressure.toFixed(2)}`,
    `Verdict: ${result.verdict}`,
    "",
    "## Current Work",
    "",
    `- Top work item: ${result.topWorkItem ?? "none"}`,
    `- Executable task: ${result.executableTask ?? "none"}`,
    "",
    "## Rationale",
    "",
    ...result.rationale.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

export async function runSkynetAutonomyPulse01(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<SkynetAutonomyPulse01Result> {
  const runtimeAuthority = await syncOpenSkynetRuntimeAuthority({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const { snapshot } = runtimeAuthority;
  const result = deriveSkynetAutonomyPulse01({
    sessionKey: params.sessionKey,
    continuity: snapshot.skynetContinuity,
    nucleus: snapshot.skynetNucleus,
    commitment: runtimeAuthority.commitment,
    experiment: runtimeAuthority.experimentPlan,
    program: snapshot.skynetStudyProgram,
  });

  const jsonPath = resolveResultJsonPath(params);
  const markdownPath = resolveResultMarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildResultMarkdown(result), "utf-8");
  return result;
}

async function main() {
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:openskynet:main";
  const result = await runSkynetAutonomyPulse01({
    workspaceRoot,
    sessionKey,
  });
  console.log("--- SKYNET Experiment: Autonomy Pulse 01 ---");
  console.log(`Initiative pressure: ${result.initiativePressure.toFixed(2)}`);
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Top work item: ${result.topWorkItem ?? "none"}`);
  console.log(`Executable task: ${result.executableTask ?? "none"}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
