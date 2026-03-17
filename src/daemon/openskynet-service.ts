/**
 * OPENSKYNET DAEMON SERVICE REGISTRATION
 * Wraps the OpenClaw GatewayService system for OpenSkyNet autonomous daemon
 */

import {
  OPENSKYNET_DAEMON_SCRIPT_NAME,
  OPENSKYNET_SERVICE_KIND,
  OPENSKYNET_SERVICE_MARKER,
  resolveOpenSkyNetLaunchAgentLabel,
  resolveOpenSkyNetSystemdServiceName,
  resolveOpenSkyNetWindowsTaskName,
} from "./openskynet-constants.js";
import type { GatewayService, GatewayServiceInstallArgs } from "./service.js";
import { resolveGatewayService } from "./service.js";

function withOpenSkyNetServiceEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return {
    ...env,
    OPENCLAW_LAUNCHD_LABEL: resolveOpenSkyNetLaunchAgentLabel(),
    OPENCLAW_SYSTEMD_UNIT: resolveOpenSkyNetSystemdServiceName(),
    OPENCLAW_WINDOWS_TASK_NAME: resolveOpenSkyNetWindowsTaskName(),
    OPENCLAW_TASK_SCRIPT_NAME: OPENSKYNET_DAEMON_SCRIPT_NAME,
    OPENCLAW_LOG_PREFIX: "openskynet",
    OPENCLAW_SERVICE_MARKER: OPENSKYNET_SERVICE_MARKER,
    OPENCLAW_SERVICE_KIND: OPENSKYNET_SERVICE_KIND,
  };
}

function withOpenSkyNetInstallEnv(args: GatewayServiceInstallArgs): GatewayServiceInstallArgs {
  return {
    ...args,
    env: withOpenSkyNetServiceEnv(args.env),
    environment: {
      ...args.environment,
      OPENCLAW_LAUNCHD_LABEL: resolveOpenSkyNetLaunchAgentLabel(),
      OPENCLAW_SYSTEMD_UNIT: resolveOpenSkyNetSystemdServiceName(),
      OPENCLAW_WINDOWS_TASK_NAME: resolveOpenSkyNetWindowsTaskName(),
      OPENCLAW_TASK_SCRIPT_NAME: OPENSKYNET_DAEMON_SCRIPT_NAME,
      OPENCLAW_LOG_PREFIX: "openskynet",
      OPENCLAW_SERVICE_MARKER: OPENSKYNET_SERVICE_MARKER,
      OPENCLAW_SERVICE_KIND: OPENSKYNET_SERVICE_KIND,
    },
  };
}

export function resolveOpenSkyNetService(): GatewayService {
  const base = resolveGatewayService();
  return {
    ...base,
    label: `${base.label} (OpenSkyNet Autonomous)`,
    install: async (args) => {
      return base.install(withOpenSkyNetInstallEnv(args));
    },
    uninstall: async (args) => {
      return base.uninstall({
        ...args,
        env: withOpenSkyNetServiceEnv(args.env),
      });
    },
    stop: async (args) => {
      return base.stop({
        ...args,
        env: withOpenSkyNetServiceEnv(args.env ?? {}),
      });
    },
    restart: async (args) => {
      return base.restart({
        ...args,
        env: withOpenSkyNetServiceEnv(args.env ?? {}),
      });
    },
    isLoaded: async (args) => {
      return base.isLoaded({
        env: withOpenSkyNetServiceEnv(args.env ?? {}),
      });
    },
    readCommand: (env) => base.readCommand(withOpenSkyNetServiceEnv(env)),
    readRuntime: (env) => base.readRuntime(withOpenSkyNetServiceEnv(env)),
  };
}
