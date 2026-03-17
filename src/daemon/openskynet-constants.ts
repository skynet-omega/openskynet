/**
 * OPENSKYNET DAEMON CONSTANTS
 * Service labels y nombres según plataforma
 */

export const OPENSKYNET_SERVICE_KIND = "OPENSKYNET_AUTONOMOUS";
export const OPENSKYNET_SERVICE_MARKER = "OpenSkyNetAutonomous";

export function resolveOpenSkyNetLaunchAgentLabel(): string {
  return "com.openclaw.openskynet-autonomous";
}

export function resolveOpenSkyNetSystemdServiceName(): string {
  return "openclaw-openskynet-autonomous";
}

export function resolveOpenSkyNetWindowsTaskName(): string {
  return "OpenClawOpenSkyNetAutonomous";
}

export const OPENSKYNET_DAEMON_SCRIPT_NAME = "openskynet-autonomous";
