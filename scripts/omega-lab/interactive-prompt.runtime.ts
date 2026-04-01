import { getGlobalCognitiveContext } from "./cognitive-context.js";
import { formatInternalReflection } from "./integrated-brain.js";
import { loadOmegaOperationalMemorySummary } from "./operational-memory.js";
import { getOmegaPolicySnapshot } from "./policy-engine.js";
import { loadOmegaSelfTimeKernel } from "./session-context.js";

export type OmegaInteractivePromptContext = {
  reflectionLines: string[];
  invariants: string;
};

export async function loadOmegaInteractivePromptContext(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaInteractivePromptContext | undefined> {
  const [kernel, operationalSummary, cognitiveContext] = await Promise.all([
    loadOmegaSelfTimeKernel({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }),
    loadOmegaOperationalMemorySummary({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    }).catch(() => undefined),
    getGlobalCognitiveContext(params.workspaceRoot),
  ]);

  const policy = await getOmegaPolicySnapshot({
    workspaceRoot: params.workspaceRoot,
    kernel,
    operationalSummary,
    cognitiveContext,
  });

  const invariants = await cognitiveContext.ruleEngine.loadRulesForPrompt();
  const reflectionLines = policy.integratedState
    ? formatInternalReflection(policy.integratedState)
    : [];

  if (reflectionLines.length === 0 && !invariants) {
    return undefined;
  }

  return {
    reflectionLines,
    invariants,
  };
}
