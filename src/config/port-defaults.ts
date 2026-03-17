import { resolveCliName, ALT_CLI_NAME } from "../cli/cli-name.js";

export type PortRange = { start: number; end: number };

function isValidPort(port: number): boolean {
  return Number.isFinite(port) && port > 0 && port <= 65535;
}

function clampPort(port: number, fallback: number): number {
  return isValidPort(port) ? port : fallback;
}

function derivePort(base: number, offset: number, fallback: number): number {
  return clampPort(base + offset, fallback);
}

// Offset de puertos para OpenSkyNet (evita conflicto con OpenClaw)
const OPENSKYNET_PORT_OFFSET = 1000;

export function getPortOffset(): number {
  try {
    return resolveCliName() === ALT_CLI_NAME ? OPENSKYNET_PORT_OFFSET : 0;
  } catch {
    return 0;
  }
}

export function resolveDefaultGatewayPort(): number {
  return 18789 + getPortOffset();
}

export function resolveDefaultBridgePort(): number {
  return 18790 + getPortOffset();
}

export function resolveDefaultBrowserControlPort(): number {
  return 18791 + getPortOffset();
}

export function resolveDefaultCanvasHostPort(): number {
  return 18793 + getPortOffset();
}

export function resolveDefaultBrowserCdpPortRangeStart(): number {
  return 18800 + getPortOffset();
}

export function resolveDefaultBrowserCdpPortRangeEnd(): number {
  return 18899 + getPortOffset();
}

export const DEFAULT_GATEWAY_PORT = resolveDefaultGatewayPort();
export const DEFAULT_BRIDGE_PORT = resolveDefaultBridgePort();
export const DEFAULT_BROWSER_CONTROL_PORT = resolveDefaultBrowserControlPort();
export const DEFAULT_CANVAS_HOST_PORT = resolveDefaultCanvasHostPort();
export const DEFAULT_BROWSER_CDP_PORT_RANGE_START = resolveDefaultBrowserCdpPortRangeStart();
export const DEFAULT_BROWSER_CDP_PORT_RANGE_END = resolveDefaultBrowserCdpPortRangeEnd();

export function deriveDefaultBridgePort(gatewayPort: number): number {
  return derivePort(gatewayPort, 1, resolveDefaultBridgePort());
}

export function deriveDefaultBrowserControlPort(gatewayPort: number): number {
  return derivePort(gatewayPort, 2, resolveDefaultBrowserControlPort());
}

export function deriveDefaultCanvasHostPort(gatewayPort: number): number {
  return derivePort(gatewayPort, 4, resolveDefaultCanvasHostPort());
}

export function deriveDefaultBrowserCdpPortRange(browserControlPort: number): PortRange {
  const start = derivePort(browserControlPort, 9, resolveDefaultBrowserCdpPortRangeStart());
  const end = clampPort(
    start + (resolveDefaultBrowserCdpPortRangeEnd() - resolveDefaultBrowserCdpPortRangeStart()),
    resolveDefaultBrowserCdpPortRangeEnd(),
  );
  if (end < start) {
    return { start, end: start };
  }
  return { start, end };
}
