import { resolveCliName, ALT_CLI_NAME } from "../cli/cli-name.js";

// Default service labels (canonical + legacy compatibility)
export const GATEWAY_LAUNCH_AGENT_LABEL = "ai.openclaw.gateway";
export const GATEWAY_SYSTEMD_SERVICE_NAME = "openclaw-gateway";
export const GATEWAY_WINDOWS_TASK_NAME = "OpenClaw Gateway";
export const GATEWAY_SERVICE_MARKER = "openclaw";
export const GATEWAY_SERVICE_KIND = "gateway";
export const NODE_LAUNCH_AGENT_LABEL = "ai.openclaw.node";
export const NODE_SYSTEMD_SERVICE_NAME = "openclaw-node";
export const NODE_WINDOWS_TASK_NAME = "OpenClaw Node";
export const NODE_SERVICE_MARKER = "openclaw";
export const NODE_SERVICE_KIND = "node";
export const NODE_WINDOWS_TASK_SCRIPT_NAME = "node.cmd";

export const LEGACY_GATEWAY_SYSTEMD_SERVICE_NAMES: string[] = [
  "clawdbot-gateway",
  "moltbot-gateway",
];

export function resolveLegacyGatewayLaunchAgentLabels(profile?: string): string[] {
  const normalized = normalizeGatewayProfile(profile);
  const labels: string[] = [];
  if (resolveCliName() === ALT_CLI_NAME) {
    labels.push(normalized ? `ai.openclaw.${normalized}` : `ai.openclaw.gateway`);
  }
  return labels;
}

function resolveBaseName(): string {
  return resolveCliName();
}

function resolveDisplayName(): string {
  return resolveCliName() === ALT_CLI_NAME ? "OpenSkyNet" : "OpenClaw";
}

export function normalizeGatewayProfile(profile?: string): string | null {
  const trimmed = profile?.trim();
  if (!trimmed || trimmed.toLowerCase() === "default") {
    return null;
  }
  return trimmed;
}

export function resolveGatewayProfileSuffix(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  return normalized ? `-${normalized}` : "";
}

export function resolveGatewayLaunchAgentLabel(profile?: string): string {
  const normalized = normalizeGatewayProfile(profile);
  const base = resolveCliName() === ALT_CLI_NAME ? "ai.openskynet" : "ai.openclaw";
  if (!normalized) {
    return `${base}.gateway`;
  }
  return `${base}.${normalized}`;
}

export function resolveGatewaySystemdServiceName(profile?: string): string {
  const base = resolveBaseName();
  const suffix = resolveGatewayProfileSuffix(profile);
  return `${base}-gateway${suffix}`;
}

export function resolveGatewayWindowsTaskName(profile?: string): string {
  const base = resolveDisplayName();
  const normalized = normalizeGatewayProfile(profile);
  if (!normalized) {
    return `${base} Gateway`;
  }
  return `${base} Gateway (${normalized})`;
}

export function formatGatewayServiceDescription(params?: {
  profile?: string;
  version?: string;
}): string {
  const base = resolveDisplayName();
  const profile = normalizeGatewayProfile(params?.profile);
  const version = params?.version?.trim();
  const parts: string[] = [];
  if (profile) {
    parts.push(`profile: ${profile}`);
  }
  if (version) {
    parts.push(`v${version}`);
  }
  if (parts.length === 0) {
    return `${base} Gateway`;
  }
  return `${base} Gateway (${parts.join(", ")})`;
}

export function resolveGatewayServiceDescription(params: {
  env: Record<string, string | undefined>;
  environment?: Record<string, string | undefined>;
  description?: string;
}): string {
  return (
    params.description ??
    formatGatewayServiceDescription({
      profile: params.env.OPENCLAW_PROFILE,
      version: params.environment?.OPENCLAW_SERVICE_VERSION ?? params.env.OPENCLAW_SERVICE_VERSION,
    })
  );
}

export function resolveNodeLaunchAgentLabel(): string {
  const base = resolveCliName() === ALT_CLI_NAME ? "ai.openskynet" : "ai.openclaw";
  return `${base}.node`;
}

export function resolveNodeSystemdServiceName(): string {
  const base = resolveBaseName();
  return `${base}-node`;
}

export function resolveNodeWindowsTaskName(): string {
  const base = resolveDisplayName();
  return `${base} Node`;
}

export function formatNodeServiceDescription(params?: { version?: string }): string {
  const base = resolveDisplayName();
  const version = params?.version?.trim();
  if (!version) {
    return `${base} Node Host`;
  }
  return `${base} Node Host (v${version})`;
}
