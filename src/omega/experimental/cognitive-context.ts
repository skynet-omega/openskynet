import { PredictiveVetoEngine } from "./causal-veto.js";
import { GoalViabilityEngine } from "./cognitive-economy.js";
import { CognitiveRuleEngine } from "./cognitive-rules.js";

export type CognitiveContext = {
  vetoEngine: PredictiveVetoEngine;
  viabilityEngine: GoalViabilityEngine;
  ruleEngine: CognitiveRuleEngine;
};

let globalContext: CognitiveContext | null = null;

export async function getGlobalCognitiveContext(workspaceRoot: string): Promise<CognitiveContext> {
  if (!globalContext) {
    globalContext = {
      vetoEngine: new PredictiveVetoEngine(workspaceRoot),
      viabilityEngine: new GoalViabilityEngine(workspaceRoot),
      ruleEngine: new CognitiveRuleEngine(workspaceRoot),
    };
    await Promise.all([
      globalContext.vetoEngine.load().catch(() => undefined),
      globalContext.viabilityEngine.load().catch(() => undefined),
    ]);
  }
  return globalContext;
}

export function clearGlobalCognitiveContext(): void {
  globalContext = null;
}
