import { type ContinuousThought } from "../continuous-thinking-engine.js";
import { getOmegaHeartbeatEngineRegistry } from "../engines/registry.js";
import {
  mergeOmegaDriveSignalWithEngineScore,
  scoreOmegaEngineSignals,
} from "../engines/score-engine-signal.js";
import type { Contradiction, OmegaKernelSignalCollection } from "../engines/types.js";
import type { FrontalLobeState } from "../frontal/frontal-lobe.js";
import { RicciGraphAnalytics } from "../graph-analytics.js";
import { HolographicMemoryManager } from "../holographic-memory.js";
import { isOmegaSpeculativeIdleEnabled } from "../idle-mode.js";
import { buildAutonomousDirectivePrompt, type InnerDriveSignal } from "../inner-life/index.js";
import { shouldApplyOmegaJepaControlSignal } from "../jepa-control.js";
import {
  enhanceDriveWithJepaTension,
  parseJepaTensionFromKernelTimeline,
} from "../jepa-drive-enhancement.js";
import { collectOpenSkynetMemoryCandidates } from "../living-memory.js";
import { createMemoryEmbedding } from "../memory-vectors.js";
import { loadOmegaWSP } from "../omega-wsp.js";
import { deriveOmegaPolicySnapshot } from "../policy-engine.js";
import {
  OMEGA_MAX_THOUGHT_CONFIDENCE_FOR_HYPOTHESIS,
  OMEGA_MIN_THOUGHT_ENTROPY_REDUCTION,
} from "../policy.js";
import type { OmegaSelfTimeKernelState } from "../self-time-kernel.js";
import { loadOmegaSessionTimeline } from "../session-context.js";
import { formatOmegaWorldModelSnapshot, loadOmegaWorldModelSnapshot } from "../world-model.js";
import { CognitiveRuleEngine } from "./cognitive-rules.js";

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

function buildContradictionsContext(contradictions: Contradiction[]): string {
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
  lobeState?: FrontalLobeState;
}): Promise<string> {
  const [worldModel, wsp] = await Promise.all([
    loadOmegaWorldModelSnapshot({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    loadOmegaWSP(params.workspaceRoot, params.sessionKey).catch(() => undefined),
  ]);

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
  const engines = getOmegaHeartbeatEngineRegistry();
  let lobeState: FrontalLobeState | undefined = params.lobeState;
  let thoughts: ContinuousThought[] = [];
  let graphFocus: string | null = null;
  let contradictions: Contradiction[] = [];
  let collectedEngineSignals: OmegaKernelSignalCollection | undefined;

  if (speculativeIdleEnabled) {
    collectedEngineSignals = engines.collectKernelSignals({
      kernel: params.kernel,
      minEntropyReduction: OMEGA_MIN_THOUGHT_ENTROPY_REDUCTION,
      maxThoughtConfidence: OMEGA_MAX_THOUGHT_CONFIDENCE_FOR_HYPOTHESIS,
    });
    thoughts = collectedEngineSignals.thoughts;
    graphFocus = RicciGraphAnalytics.getFocusRecommendation(params.kernel);
    contradictions = collectedEngineSignals.contradictions;
  }

  const memoryCandidates = await collectOpenSkynetMemoryCandidates(params.workspaceRoot);
  let driveSignal = deriveOmegaPolicySnapshot({
    kernel: params.kernel,
    wsp,
    nowMs: Date.now(),
    memoryCandidates,
  }).driveSignal;
  if (collectedEngineSignals) {
    driveSignal = mergeOmegaDriveSignalWithEngineScore({
      baseDriveSignal: driveSignal,
      engineScore: scoreOmegaEngineSignals(collectedEngineSignals.signals),
    });
  }

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
