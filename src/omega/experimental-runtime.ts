import { isTruthyEnvValue } from "../infra/env.js";

export const OPENSKYNET_OMEGA_EXPERIMENTAL_BOOTSTRAP_ENV =
  "OPENSKYNET_OMEGA_EXPERIMENTAL_BOOTSTRAP";
export const OPENSKYNET_OMEGA_SEED_SESSION_ENV = "OPENSKYNET_OMEGA_SEED_SESSION";
export const OPENSKYNET_OMEGA_HOMEOSTASIS_DAEMON_ENV = "OPENSKYNET_OMEGA_HOMEOSTASIS_DAEMON";

export function isOmegaExperimentalBootstrapEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env[OPENSKYNET_OMEGA_EXPERIMENTAL_BOOTSTRAP_ENV]);
}

export function shouldOmegaSeedDaemonSession(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env[OPENSKYNET_OMEGA_SEED_SESSION_ENV]);
}

export function shouldRunOmegaHomeostasisDaemon(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env[OPENSKYNET_OMEGA_HOMEOSTASIS_DAEMON_ENV]);
}
