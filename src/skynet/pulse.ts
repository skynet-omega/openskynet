import fs from "node:fs/promises";
import path from "node:path";
import { syncOpenSkynetLivingMemory } from "../omega/living-memory.js";
import {
  hasRecentResearchProse,
  runResearchLoop,
  type ResearchLoopResult,
} from "../omega/research-loop.js";
import { loadOmegaWorldModelSnapshot } from "../omega/world-model.js";
import {
  formatSkynetCommitmentBlock,
  syncSkynetCommitmentDecision,
  type SkynetCommitmentDecision,
} from "./commitment-engine.js";
import {
  formatSkynetExperimentPlanBlock,
  syncSkynetExperimentPlan,
  type SkynetExperimentPlan,
} from "./experiment-cycle.js";

export type SkynetPulseResult = {
  sessionKey: string;
  updatedAt: number;
  focusTitle?: string;
  nucleusMode?: string;
  continuityScore?: number;
  topWorkItem?: string;
  recommendedAction?: string;
  researchLoop?: ResearchLoopResult;
  experimentPlan?: SkynetExperimentPlan;
  commitment?: SkynetCommitmentDecision;
  filePath: string;
};

function resolveSkynetPulseFile(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_PULSE.md");
}

function deriveRecommendedAction(params: {
  focusTitle?: string;
  nucleusMode?: string;
  continuityScore?: number;
  topWorkItem?: string;
}): string {
  if (typeof params.continuityScore === "number" && params.continuityScore < 0.5) {
    return "Re-establish continuity before expanding the study scope.";
  }
  if (params.nucleusMode === "reframe") {
    return "Produce a structural reframe before insisting on the same work item.";
  }
  if (params.topWorkItem) {
    return `Execute or refine the top work item: ${params.topWorkItem}`;
  }
  if (params.focusTitle) {
    return `Advance the active focus: ${params.focusTitle}`;
  }
  return "No active Skynet focus detected.";
}

function formatResearchLoop(result?: ResearchLoopResult): string[] {
  if (!result) {
    return [];
  }
  const lines = ["", "## Research Loop"];
  if (result.kind === "prose_written") {
    lines.push(`- Result: prose_written`);
    lines.push(`- Correlation: ${result.correlationScore.toFixed(2)}`);
    lines.push(`- File: ${result.filePath}`);
    if (result.hypotheses.length > 0) {
      lines.push(`- Hypotheses: ${result.hypotheses.join(" | ")}`);
    }
    return lines;
  }
  if (result.kind === "below_threshold") {
    lines.push(`- Result: below_threshold`);
    lines.push(`- Correlation: ${result.correlationScore.toFixed(2)}`);
    return lines;
  }
  lines.push(`- Result: ${result.kind}`);
  lines.push(`- Reason: ${result.reason}`);
  return lines;
}

function buildPulseMarkdown(result: SkynetPulseResult): string {
  return [
    "# SKYNET Pulse",
    "",
    `Updated: ${new Date(result.updatedAt).toISOString()}`,
    `Session: ${result.sessionKey}`,
    "",
    "## Current State",
    "",
    `- Focus: ${result.focusTitle ?? "none"}`,
    `- Nucleus mode: ${result.nucleusMode ?? "unknown"}`,
    `- Continuity score: ${
      typeof result.continuityScore === "number" ? result.continuityScore.toFixed(2) : "n/a"
    }`,
    `- Top work item: ${result.topWorkItem ?? "none"}`,
    `- Recommended action: ${result.recommendedAction ?? "none"}`,
    ...formatSkynetExperimentPlanBlock(result.experimentPlan),
    ...formatSkynetCommitmentBlock(result.commitment),
    ...formatResearchLoop(result.researchLoop),
    "",
  ].join("\n");
}

export async function runSkynetPulse(params: {
  workspaceRoot: string;
  sessionKey: string;
  runResearch?: boolean;
}): Promise<SkynetPulseResult> {
  const snapshot = await loadOmegaWorldModelSnapshot({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });

  let researchLoop: ResearchLoopResult | undefined;
  if (params.runResearch) {
    const recentResearch = await hasRecentResearchProse(params.workspaceRoot);
    if (!recentResearch) {
      researchLoop = await runResearchLoop({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
      }).catch(() => undefined);
    }
  }

  const experimentPlan =
    snapshot.skynetNucleus && snapshot.skynetStudyProgram
      ? await syncSkynetExperimentPlan({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus: snapshot.skynetNucleus,
          program: snapshot.skynetStudyProgram,
          continuity: snapshot.skynetContinuity,
        }).catch(() => undefined)
      : undefined;
  const commitment =
    snapshot.skynetNucleus && snapshot.skynetStudyProgram && experimentPlan
      ? await syncSkynetCommitmentDecision({
          workspaceRoot: params.workspaceRoot,
          sessionKey: params.sessionKey,
          nucleus: snapshot.skynetNucleus,
          program: snapshot.skynetStudyProgram,
          experiment: experimentPlan,
          continuity: snapshot.skynetContinuity,
        }).catch(() => undefined)
      : undefined;

  const result: SkynetPulseResult = {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    focusTitle: snapshot.studySupervisor?.focus.title,
    nucleusMode: snapshot.skynetNucleus?.mode,
    continuityScore: snapshot.skynetContinuity?.continuityScore,
    topWorkItem: snapshot.skynetStudyProgram?.items[0]?.title,
    recommendedAction: deriveRecommendedAction({
      focusTitle: snapshot.studySupervisor?.focus.title,
      nucleusMode: snapshot.skynetNucleus?.mode,
      continuityScore: snapshot.skynetContinuity?.continuityScore,
      topWorkItem: snapshot.skynetStudyProgram?.items[0]?.title,
    }),
    researchLoop,
    experimentPlan,
    commitment,
    filePath: resolveSkynetPulseFile(params.workspaceRoot),
  };

  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, buildPulseMarkdown(result), "utf-8");
  await syncOpenSkynetLivingMemory({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    snapshot,
    recommendedAction: result.recommendedAction,
    commitment,
    experiment: experimentPlan,
  });
  return result;
}
