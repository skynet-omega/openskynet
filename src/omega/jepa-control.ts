import { isTruthyEnvValue } from "../infra/env.js";
import { OMEGA_JEPA_MIN_CONFIDENCE } from "./policy.js";
import type { OmegaJepaTensionResult } from "./types.js";

export const OPENSKYNET_OMEGA_JEPA_CONTROL_ENV = "OPENSKYNET_OMEGA_JEPA_CONTROL";
export const OPENSKYNET_OMEGA_JEPA_WARN_ENV = "OPENSKYNET_OMEGA_JEPA_WARN";

type JepaLikeSignal = Pick<OmegaJepaTensionResult, "confidence" | "error">;

/**
 * JEPA is observational by default. Control-path use must be explicit.
 */
export function isOmegaJepaControlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env[OPENSKYNET_OMEGA_JEPA_CONTROL_ENV]);
}

export function shouldApplyOmegaJepaControlSignal(
  signal: JepaLikeSignal,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isOmegaJepaControlEnabled(env)) {
    return false;
  }
  return !signal.error && signal.confidence >= OMEGA_JEPA_MIN_CONFIDENCE;
}

export function shouldSurfaceOmegaJepaWarnings(env: NodeJS.ProcessEnv = process.env): boolean {
  return isOmegaJepaControlEnabled(env) || isTruthyEnvValue(env[OPENSKYNET_OMEGA_JEPA_WARN_ENV]);
}
