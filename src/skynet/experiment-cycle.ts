import fs from "node:fs/promises";
import path from "node:path";
import type { SkynetContinuityState } from "./continuity-tracker.js";
import type { SkynetNucleusState } from "./nucleus.js";
import type { SkynetStudyProgram } from "./study-program.js";

export type SkynetExperimentPlan = {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  focusKey: string;
  mode: SkynetNucleusState["mode"];
  hypothesis: string;
  deliverable: string;
  killCriteria: string;
  benchmarkHook: string;
  notes: string[];
};

function resolveExperimentPlanPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "SKYNET_ACTIVE_EXPERIMENT.md");
}

function resolveExperimentStatePath(params: { workspaceRoot: string; sessionKey: string }): string {
  const safe =
    (params.sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
  return path.join(params.workspaceRoot, ".openskynet", "skynet-experiments", `${safe}.json`);
}

function deriveHypothesis(params: {
  projectName: string;
  focusKey: string;
  topWorkItem?: string;
  continuity?: SkynetContinuityState;
}): string {
  if (params.focusKey === "endogenous_science_agenda") {
    return `A persistent study queue is not enough; ${params.projectName} needs a concrete experimental artifact per cycle to preserve initiative across awakenings.`;
  }
  if (params.focusKey === "decision_bifurcation") {
    return `Decision quality will improve if ${params.projectName} materializes a reframe artifact instead of retaining only a textual recommendation.`;
  }
  if ((params.continuity?.continuityScore ?? 0) < 0.5) {
    return "Low continuity indicates the current cycle is not preserving enough structure to sustain autonomous work.";
  }
  return `Materializing the current top work item should improve carry-over value for ${params.topWorkItem ?? "the active study line"}.`;
}

function deriveDeliverable(params: {
  projectName: string;
  focusKey: string;
  topWorkItem?: string;
  mode: SkynetNucleusState["mode"];
}): string {
  if (params.focusKey === "endogenous_science_agenda") {
    return `Create or update one executable experiment/module that moves ${params.projectName} from planning into measurable autonomous study work.`;
  }
  if (params.mode === "reframe") {
    return "Produce one alternate framing artifact that changes the next cycle's target or decision route.";
  }
  return params.topWorkItem
    ? `Materialize the active work item in code, benchmark, or persistent experiment form: ${params.topWorkItem}.`
    : "Materialize one concrete study artifact in the repository.";
}

function deriveKillCriteria(params: {
  focusKey: string;
  continuity?: SkynetContinuityState;
}): string {
  if (params.focusKey === "endogenous_science_agenda") {
    return "Kill this line if it does not produce a new runnable artifact or measurable benchmark within the next cycle.";
  }
  if ((params.continuity?.continuityScore ?? 1) < 0.5) {
    return "Kill or reframe this cycle if continuity remains below 0.50 after the next pulse.";
  }
  return "Kill or reframe this cycle if it only produces prose and no verifiable artifact.";
}

function deriveBenchmarkHook(params: { focusKey: string }): string {
  if (params.focusKey === "endogenous_science_agenda") {
    return "Measure whether the next cycle preserves focus, work item continuity, and produces a new artifact.";
  }
  if (params.focusKey === "decision_bifurcation") {
    return "Measure whether the next cycle changes plan/route materially instead of repeating the same local optimum.";
  }
  return "Measure whether the artifact changes future routing, continuity, or execution behavior.";
}

function buildExperimentMarkdown(plan: SkynetExperimentPlan): string {
  return [
    `# ${plan.projectName.toUpperCase()} Active Experiment`,
    "",
    `Updated: ${new Date(plan.updatedAt).toISOString()}`,
    `Session: ${plan.sessionKey}`,
    `Focus: ${plan.focusKey}`,
    `Mode: ${plan.mode}`,
    "",
    "## Hypothesis",
    "",
    plan.hypothesis,
    "",
    "## Deliverable",
    "",
    plan.deliverable,
    "",
    "## Kill Criteria",
    "",
    plan.killCriteria,
    "",
    "## Benchmark Hook",
    "",
    plan.benchmarkHook,
    "",
    "## Notes",
    "",
    ...plan.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}

export function deriveSkynetExperimentPlan(params: {
  sessionKey: string;
  nucleus: SkynetNucleusState;
  program: SkynetStudyProgram;
  continuity?: SkynetContinuityState;
}): SkynetExperimentPlan {
  const topWorkItem = params.program.items[0];
  return {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: params.nucleus.name,
    focusKey: params.program.focusKey,
    mode: params.nucleus.mode,
    hypothesis: deriveHypothesis({
      projectName: params.nucleus.name,
      focusKey: params.program.focusKey,
      topWorkItem: topWorkItem?.title,
      continuity: params.continuity,
    }),
    deliverable: deriveDeliverable({
      projectName: params.nucleus.name,
      focusKey: params.program.focusKey,
      topWorkItem: topWorkItem?.title,
      mode: params.nucleus.mode,
    }),
    killCriteria: deriveKillCriteria({
      focusKey: params.program.focusKey,
      continuity: params.continuity,
    }),
    benchmarkHook: deriveBenchmarkHook({
      focusKey: params.program.focusKey,
    }),
    notes: [
      `Top work item: ${topWorkItem?.title ?? "none"}`,
      `Continuity score: ${
        typeof params.continuity?.continuityScore === "number"
          ? params.continuity.continuityScore.toFixed(2)
          : "n/a"
      }`,
    ],
  };
}

export async function syncSkynetExperimentPlan(params: {
  workspaceRoot: string;
  sessionKey: string;
  nucleus: SkynetNucleusState;
  program: SkynetStudyProgram;
  continuity?: SkynetContinuityState;
}): Promise<SkynetExperimentPlan> {
  const plan = deriveSkynetExperimentPlan(params);
  const markdownPath = resolveExperimentPlanPath(params.workspaceRoot);
  const statePath = resolveExperimentStatePath(params);
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(markdownPath, buildExperimentMarkdown(plan), "utf-8");
  await fs.writeFile(statePath, JSON.stringify(plan, null, 2) + "\n", "utf-8");
  return plan;
}

export function formatSkynetExperimentPlanBlock(plan?: SkynetExperimentPlan): string[] {
  if (!plan) {
    return [];
  }
  return [
    "",
    `[${plan.projectName} Active Experiment]`,
    `Focus: ${plan.focusKey} | mode ${plan.mode}`,
    `Hypothesis: ${plan.hypothesis}`,
    `Deliverable: ${plan.deliverable}`,
    `Kill criteria: ${plan.killCriteria}`,
  ];
}
