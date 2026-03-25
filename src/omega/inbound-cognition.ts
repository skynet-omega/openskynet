import type { FinalizedMsgContext } from "../auto-reply/templating.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { HolographicMemoryManager } from "./holographic-memory.js";
import { getNeuralLogicEngine } from "./neural-logic-engine.js";

export const OPENSKYNET_OMEGA_INBOUND_COGNITION_ENV = "OPENSKYNET_OMEGA_INBOUND_COGNITION";

/**
 * The inbound Omega cognition hook stays enabled by default for backward
 * compatibility, but it is now explicitly controllable instead of being
 * hard-wired into the generic reply path.
 */
export function isOmegaInboundCognitionEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[OPENSKYNET_OMEGA_INBOUND_COGNITION_ENV];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return true;
  }
  return isTruthyEnvValue(raw);
}

function buildLatentState(bodyText: string): number[] {
  return [
    Math.min(1, bodyText.length / 500),
    bodyText.includes("?") ? 0.8 : 0.2,
    bodyText.match(/error|fail|bug|wrong|bad/i) ? 0.9 : 0.1,
  ];
}

function appendUntrustedContext(ctx: FinalizedMsgContext, entry: string): void {
  if (!ctx.UntrustedContext) {
    ctx.UntrustedContext = [entry];
    return;
  }
  ctx.UntrustedContext.push(entry);
}

export async function applyOmegaInboundCognition(params: {
  workspaceRoot: string;
  sessionKey?: string;
  ctx: FinalizedMsgContext;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  if (!isOmegaInboundCognitionEnabled(params.env)) {
    return;
  }

  const bodyText = params.ctx.Body ?? "";
  if (bodyText.trim().length === 0) {
    return;
  }

  const nle = getNeuralLogicEngine();
  const hmem = new HolographicMemoryManager(params.workspaceRoot);
  await hmem.initialize();

  await hmem.fossilize(bodyText, {
    source: "user_input",
    sessionKey: params.sessionKey ?? "main",
  });

  const nleState = nle.infer(buildLatentState(bodyText));
  if (nleState.activeRules.length === 0) {
    return;
  }

  const nleContext =
    `[Omega NLE Active: ${nleState.activeRules.join(",")} | ` +
    `Confidence: ${nleState.inferenceConfidence.toFixed(2)} | ` +
    `Delta: ${nleState.logicalDelta[0].toFixed(2)}]`;
  appendUntrustedContext(params.ctx, nleContext);
}
