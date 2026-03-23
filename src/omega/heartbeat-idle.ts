import fs from "node:fs/promises";
import path from "node:path";
import { getActiveLearningStrategy } from "./active-learning-strategy.js";
import { CognitiveRuleEngine } from "./cognitive-rules.js";
import { getEntropyMinimizationLoop } from "./entropy-minimization-loop.js";
import {
  getContinuousThinkingEngine,
  type ContinuousThought,
} from "./experimental/continuous-thinking-engine.js";
import type { FrontalLobeState } from "./frontal/frontal-lobe.js";
import { RicciGraphAnalytics } from "./graph-analytics.js";
import { HolographicMemoryManager } from "./holographic-memory.js";
import { isOmegaSpeculativeIdleEnabled } from "./idle-mode.js";
import { buildAutonomousDirectivePrompt, type InnerDriveSignal } from "./inner-life/index.js";
import { shouldApplyOmegaJepaControlSignal } from "./jepa-control.js";
import {
  enhanceDriveWithJepaTension,
  parseJepaTensionFromKernelTimeline,
} from "./jepa-drive-enhancement.js";
import { createMemoryEmbedding } from "./memory-vectors.js";
import { deriveOmegaPolicySnapshot } from "./policy-engine.js";
import {
  OMEGA_MAX_THOUGHT_CONFIDENCE_FOR_HYPOTHESIS,
  OMEGA_MIN_THOUGHT_ENTROPY_REDUCTION,
} from "./policy.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import { loadOmegaSessionTimeline } from "./session-context.js";
import { formatOmegaWorldModelSnapshot, loadOmegaWorldModelSnapshot } from "./world-model.js";

type ThoughtObservation = {
  domain: string;
  observation: string;
  priorConfidence: number;
};

async function collectOmegaMemoryCandidates(workspaceRoot: string): Promise<string[]> {
  const candidates: string[] = [];
  try {
    const memoryDir = path.join(workspaceRoot, "memory");
    const files = await fs.readdir(memoryDir).catch(() => []);
    candidates.push(...files.map((file) => path.join("memory", file)));

    const memoryMd = path.join(workspaceRoot, "MEMORY.md");
    const hasMemoryMd = await fs
      .stat(memoryMd)
      .then(() => true)
      .catch(() => false);
    if (hasMemoryMd) {
      candidates.push("MEMORY.md");
    }
  } catch (error) {
    console.warn("[OMEGA] Failed to collect memory candidates:", error);
  }
  return candidates;
}

function buildThoughtObservation(
  thought: Pick<ContinuousThought, "drive" | "question" | "reasoning">,
): ThoughtObservation {
  const domainByDrive: Record<ContinuousThought["drive"], string> = {
    learning: "pattern",
    entropy_minimization: "feedback",
    adaptive_depth: "causality",
  };
  return {
    domain: domainByDrive[thought.drive],
    observation: `${thought.question} | ${thought.reasoning}`,
    priorConfidence: OMEGA_MAX_THOUGHT_CONFIDENCE_FOR_HYPOTHESIS / 2,
  };
}

async function fossilizeIdleExperience(params: {
  workspaceRoot: string;
  lobeState?: FrontalLobeState;
  thoughts: ContinuousThought[];
  graphFocus: string | null;
}): Promise<void> {
  const { lobeState, thoughts, graphFocus } = params;
  const hasStatefulContext =
    thoughts.length > 0 ||
    (lobeState && lobeState.macroIntent !== "Awaiting autonomous directive or user input.");
  if (!hasStatefulContext) {
    return;
  }

  const memoryManager = new HolographicMemoryManager(params.workspaceRoot);
  try {
    await memoryManager.initialize();
    const fossilContent = `Intent: ${lobeState?.macroIntent} | Focus: ${lobeState?.currentFocus}`;
    const fossilMetadata = {
      thoughts: thoughts.map((thought) => thought.id),
      ricci_bottleneck: graphFocus,
    };
    const embedding = createMemoryEmbedding({
      content: fossilContent,
      metadata: fossilMetadata,
    });
    await memoryManager.fossilize(fossilContent, fossilMetadata, embedding);
  } catch (error) {
    console.warn("[OMEGA] Failed to fossilize idle experience:", error);
  } finally {
    memoryManager.close();
  }
}

async function loadLearningContext(params: {
  workspaceRoot: string;
  kernel: OmegaSelfTimeKernelState;
}): Promise<string> {
  void params.kernel;
  const ruleEngine = new CognitiveRuleEngine(params.workspaceRoot);
  const promptRules = await ruleEngine.loadRulesForPrompt();
  if (!promptRules.trim()) {
    return "";
  }
  return `\n\n=== COGNITIVE RULES ===\n${promptRules.trim()}`;
}

function buildContradictionsContext(
  contradictions: ReturnType<ReturnType<typeof getEntropyMinimizationLoop>["detectContradictions"]>,
): string {
  if (contradictions.length === 0) {
    return "";
  }
  return (
    "\n\n=== DETECTED CONTRADICTIONS ===\n" +
    contradictions
      .slice(0, 3)
      .map((item, index) => `${index + 1}. ${item.kind} (severity=${item.severity.toFixed(2)})`)
      .join("\n")
  );
}

function buildIdlePrompt(params: {
  kernel: OmegaSelfTimeKernelState;
  driveSignal: InnerDriveSignal;
  thoughts: ContinuousThought[];
  lobeState?: FrontalLobeState;
  graphFocus: string | null;
  learningContext: string;
  contradictionsContext: string;
}): string | undefined {
  if (params.driveSignal.kind === "idle" && params.thoughts.length === 0) {
    return undefined;
  }

  let prompt = buildAutonomousDirectivePrompt({
    signal: params.driveSignal,
    kernel: params.kernel,
  });

  if (!params.lobeState) {
    return prompt;
  }

  const graphContext = params.graphFocus
    ? `\n\n=== RICCI GRAPH SIGNAL ===\n- Recommendation: ${params.graphFocus}\n`
    : "";
  const lobeContext =
    `\n\n=== FRONTAL LOBE ===\n` +
    `- Macro Intent: ${params.lobeState.macroIntent}\n` +
    `- Current Focus: ${params.lobeState.currentFocus}\n` +
    graphContext +
    params.learningContext +
    params.contradictionsContext;
  const thoughtLines = params.thoughts
    .map((thought, index) => `${index + 1}. [${thought.drive.toUpperCase()}] ${thought.question}`)
    .join("\n");
  prompt =
    (prompt || "Reflect on your frontal lobe and active continuous thoughts.") +
    lobeContext +
    "\n--- ACTIVE THOUGHTS ---\n" +
    thoughtLines +
    "\n\nUpdate the frontal lobe if this cycle changed your internal priorities.";
  return prompt;
}

export async function buildIdleOmegaHeartbeatPrompt(params: {
  workspaceRoot: string;
  sessionKey: string;
  kernel?: OmegaSelfTimeKernelState;
}): Promise<string> {
  const worldModel = await loadOmegaWorldModelSnapshot({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });

  if (!params.kernel) {
    const lines = [
      "[CORE DIRECTIVE: SOUL]",
      "Mission: Reconstruct your internal state from persisted evidence, not source-code introspection.",
      "Action: Use the current world model and durable memory to restore continuity.",
      ...formatOmegaWorldModelSnapshot(worldModel),
      "If no real maintenance or recovery work follows from this state, reply HEARTBEAT_OK.",
    ];
    return lines.join("\n");
  }

  const speculativeIdleEnabled = isOmegaSpeculativeIdleEnabled();
  let lobeState: FrontalLobeState | undefined;
  let thoughts: ContinuousThought[] = [];
  let graphFocus: string | null = null;
  let contradictions: ReturnType<
    ReturnType<typeof getEntropyMinimizationLoop>["detectContradictions"]
  > = [];

  if (speculativeIdleEnabled) {
    const thinkingEngine = getContinuousThinkingEngine();
    lobeState = thinkingEngine.getState().frontalLobe;
    thoughts = await thinkingEngine.think(params.kernel, params.workspaceRoot);
    graphFocus = RicciGraphAnalytics.getFocusRecommendation(params.kernel);
    contradictions = getEntropyMinimizationLoop().detectContradictions(params.kernel);

    const learningStrategy = getActiveLearningStrategy();
    for (const thought of thoughts) {
      if (
        thought.expectedEntropyReduction > OMEGA_MIN_THOUGHT_ENTROPY_REDUCTION &&
        thought.confidence < OMEGA_MAX_THOUGHT_CONFIDENCE_FOR_HYPOTHESIS
      ) {
        learningStrategy.generateHypothesis(buildThoughtObservation(thought));
      }
    }
  }

  const memoryCandidates = await collectOmegaMemoryCandidates(params.workspaceRoot);
  let driveSignal = deriveOmegaPolicySnapshot({
    kernel: params.kernel,
    nowMs: Date.now(),
    memoryCandidates,
  }).driveSignal;

  const sessionTimeline = await loadOmegaSessionTimeline(params);
  const jepaTension = parseJepaTensionFromKernelTimeline(sessionTimeline);
  if (shouldApplyOmegaJepaControlSignal(jepaTension)) {
    driveSignal = enhanceDriveWithJepaTension(driveSignal, jepaTension);
  }

  if (speculativeIdleEnabled) {
    await fossilizeIdleExperience({
      workspaceRoot: params.workspaceRoot,
      lobeState,
      thoughts,
      graphFocus,
    });
  }

  const learningContext = speculativeIdleEnabled
    ? await loadLearningContext({
        workspaceRoot: params.workspaceRoot,
        kernel: params.kernel,
      })
    : "";
  const prompt = buildIdlePrompt({
    kernel: params.kernel,
    driveSignal,
    thoughts,
    lobeState,
    graphFocus,
    learningContext,
    contradictionsContext: buildContradictionsContext(contradictions),
  });
  if (prompt) {
    return `${prompt}\n\n${formatOmegaWorldModelSnapshot(worldModel).join("\n")}`;
  }

  return (
    "[CORE DIRECTIVE: SOUL]\n" +
    "Status: Idle / No immediate tension.\n" +
    "Action: Perform a routine self-evaluation using persisted state.\n" +
    `${formatOmegaWorldModelSnapshot(worldModel).join("\n")}\n` +
    "If the world model shows no unresolved work, reply HEARTBEAT_OK."
  );
}
