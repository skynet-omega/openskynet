import fs from "node:fs/promises";
import path from "node:path";
import {
  hasRecentResearchProse,
  runResearchLoop,
  type ResearchLoopResult,
} from "../omega/research-loop.js";
import { writeOpenSkynetBenchmarkCycleSnapshot } from "./benchmark-cycle.js";
import { formatSkynetCommitmentBlock, type SkynetCommitmentDecision } from "./commitment-engine.js";
import { formatSkynetExperimentPlanBlock, type SkynetExperimentPlan } from "./experiment-cycle.js";
import {
  deriveOpenSkynetRecommendedAction,
  syncOpenSkynetRuntimeAuthority,
} from "./runtime-authority.js";

export type SkynetPulseResult = {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  focusTitle?: string;
  nucleusMode?: string;
  continuityScore?: number;
  topWorkItem?: string;
  recommendedAction?: string;
  researchLoop?: ResearchLoopResult;
  experimentPlan?: SkynetExperimentPlan;
  commitment?: SkynetCommitmentDecision;
  filePath: string;
  benchmarkSnapshotPath?: string;
  degradedComponents: Array<{
    component: string;
    reason: string;
  }>;
};

function resolveSkynetPulseFile(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_PULSE.md");
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
    `# ${result.projectName.toUpperCase()} Pulse`,
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
    `- Degraded components: ${result.degradedComponents.length > 0 ? result.degradedComponents.map((entry) => entry.component).join(", ") : "none"}`,
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
  const runtimeAuthority = await syncOpenSkynetRuntimeAuthority({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const benchmarkSnapshot = await writeOpenSkynetBenchmarkCycleSnapshot({
    workspaceRoot: params.workspaceRoot,
    runtimeAuthority,
  });
  const { snapshot } = runtimeAuthority;

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

  const result: SkynetPulseResult = {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: runtimeAuthority.project.name,
    focusTitle: snapshot.studySupervisor?.focus.title,
    nucleusMode: snapshot.internalProjectNucleus?.mode,
    continuityScore: snapshot.internalProjectContinuity?.continuityScore,
    topWorkItem: snapshot.internalProjectStudyProgram?.items[0]?.title,
    recommendedAction: deriveOpenSkynetRecommendedAction({
      focusTitle: snapshot.studySupervisor?.focus.title,
      nucleusMode: snapshot.internalProjectNucleus?.mode,
      continuityScore: snapshot.internalProjectContinuity?.continuityScore,
      topWorkItem: snapshot.internalProjectStudyProgram?.items[0]?.title,
    }),
    researchLoop,
    experimentPlan: runtimeAuthority.experimentPlan,
    commitment: runtimeAuthority.commitment,
    filePath: resolveSkynetPulseFile(params.workspaceRoot),
    benchmarkSnapshotPath: benchmarkSnapshot.runtime.benchmarkSnapshotFile,
    degradedComponents: runtimeAuthority.degradedComponents,
  };

  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, buildPulseMarkdown(result), "utf-8");
  return result;
}
