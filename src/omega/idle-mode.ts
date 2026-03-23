import { isTruthyEnvValue } from "../infra/env.js";

export const OPENSKYNET_OMEGA_SPECULATIVE_IDLE_ENV = "OPENSKYNET_OMEGA_SPECULATIVE_IDLE";

/**
 * Speculative idle cognition remains opt-in until it demonstrates value beyond
 * the evidence-based world model path.
 */
export function isOmegaSpeculativeIdleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env[OPENSKYNET_OMEGA_SPECULATIVE_IDLE_ENV]);
}
