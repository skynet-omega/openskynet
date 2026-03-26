import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadOmegaWorldModelSnapshot } from "../../omega/world-model.js";
import type { SkynetCommitmentDecision } from "../commitment-engine.js";
import { syncSkynetCommitmentDecision } from "../commitment-engine.js";
import type { SkynetContinuityState } from "../continuity-tracker.js";
import { syncSkynetContinuityState } from "../continuity-tracker.js";
import type { SkynetExperimentPlan } from "../experiment-cycle.js";
import { syncSkynetExperimentPlan } from "../experiment-cycle.js";
import type { SkynetNucleusState } from "../nucleus.js";
import { syncSkynetNucleus } from "../nucleus.js";
import type { SkynetStudyProgram } from "../study-program.js";
import { syncSkynetStudyProgram } from "../study-program.js";

export type SkynetDecisionBifurcationVerdict = "hold" | "branch" | "commit";

export type SkynetDecisionBifurcationProbeResult = {
  sessionKey: string;
  updatedAt: number;
  focusKey?: string;
  bifurcationPressure: number;
  verdict: SkynetDecisionBifurcationVerdict;
  stalledTurns: number;
  rationale: string[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function resolveProbeJsonPath(params: { workspaceRoot: string; sessionKey: string }): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-artifacts",
    `${sanitizeSessionKey(params.sessionKey)}-decision-bifurcation-probe.json`,
  );
}

function resolveProbeMarkdownPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_DECISION_BIFURCATION_PROBE.md");
}

export function deriveSkynetDecisionBifurcationProbe(params: {
  sessionKey: string;
  nucleus?: SkynetNucleusState;
  continuity?: SkynetContinuityState;
  commitment?: SkynetCommitmentDecision;
  experiment?: SkynetExperimentPlan;
  program?: SkynetStudyProgram;
  stalledTurns: number;
}): SkynetDecisionBifurcationProbeResult {
  const continuity = params.continuity?.continuityScore ?? 0;
  const commitment = params.commitment?.confidence ?? 0;
  const curiosity = params.nucleus?.metabolism.curiosity ?? 0;
  const reframeBias = params.nucleus?.mode === "reframe" ? 0.24 : 0;
  const experimentBias = params.experiment ? 0.08 : 0;
  const stalledBias = Math.min(params.stalledTurns, 3) * 0.18;
  const pressure = clamp01(
    continuity * 0.18 +
      commitment * 0.22 +
      curiosity * 0.16 +
      reframeBias +
      experimentBias +
      stalledBias,
  );

  let verdict: SkynetDecisionBifurcationVerdict = "hold";
  if (params.nucleus?.mode === "reframe" || params.stalledTurns >= 2 || pressure >= 0.68) {
    verdict = "branch";
  } else if (
    params.commitment?.kind === "artifact" &&
    (params.continuity?.continuityScore ?? 0) >= 0.75 &&
    params.stalledTurns === 0
  ) {
    verdict = "commit";
  }

  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    focusKey: params.program?.focusKey,
    bifurcationPressure: pressure,
    verdict,
    stalledTurns: params.stalledTurns,
    rationale: [
      `continuity=${continuity.toFixed(2)}`,
      `commitment=${commitment.toFixed(2)}`,
      `curiosity=${curiosity.toFixed(2)}`,
      `stalledTurns=${params.stalledTurns}`,
      `mode=${params.nucleus?.mode ?? "unknown"}`,
      `verdict=${verdict}`,
    ],
  };
}

function buildProbeMarkdown(result: SkynetDecisionBifurcationProbeResult): string {
  return [
    "# SKYNET Decision Bifurcation Probe",
    "",
    `Updated: ${new Date(result.updatedAt).toISOString()}`,
    `Session: ${result.sessionKey}`,
    `Focus: ${result.focusKey ?? "none"}`,
    `Bifurcation pressure: ${result.bifurcationPressure.toFixed(2)}`,
    `Verdict: ${result.verdict}`,
    `Stalled turns: ${result.stalledTurns}`,
    "",
    "## Rationale",
    "",
    ...result.rationale.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

export async function runSkynetDecisionBifurcationProbe(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<SkynetDecisionBifurcationProbeResult> {
  const snapshot = await loadOmegaWorldModelSnapshot({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const studySupervisor = snapshot.studySupervisor;
  const nucleus = studySupervisor
    ? await syncSkynetNucleus({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        studyFocus: studySupervisor.focus,
        operationalSignals: snapshot.operationalSignals,
        learnedConstraints: snapshot.selfState?.learnedConstraints ?? [],
      })
    : snapshot.skynetNucleus;
  const program =
    studySupervisor && nucleus
      ? await syncSkynetStudyProgram({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          supervisor: studySupervisor,
          nucleus,
        })
      : snapshot.skynetStudyProgram;
  const continuity =
    nucleus && program
      ? await syncSkynetContinuityState({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus,
          program,
        })
      : snapshot.skynetContinuity;
  const experiment =
    nucleus && program
      ? await syncSkynetExperimentPlan({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus,
          program,
          continuity,
        })
      : undefined;
  const commitment =
    nucleus && program && experiment
      ? await syncSkynetCommitmentDecision({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus,
          program,
          experiment,
          continuity,
        })
      : undefined;

  const stalledTurns = snapshot.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;
  const result = deriveSkynetDecisionBifurcationProbe({
    sessionKey: params.sessionKey,
    nucleus,
    continuity,
    commitment,
    experiment,
    program,
    stalledTurns,
  });

  const jsonPath = resolveProbeJsonPath(params);
  const markdownPath = resolveProbeMarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildProbeMarkdown(result), "utf-8");
  return result;
}

async function main() {
  const workspaceRoot = process.cwd();
  const sessionKey = "agent:openskynet:main";
  const result = await runSkynetDecisionBifurcationProbe({
    workspaceRoot,
    sessionKey,
  });
  console.log("--- SKYNET Artifact: Decision Bifurcation Probe ---");
  console.log(`Bifurcation pressure: ${result.bifurcationPressure.toFixed(2)}`);
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Stalled turns: ${result.stalledTurns}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
