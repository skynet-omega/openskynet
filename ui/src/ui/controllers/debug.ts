import type { GatewayBrowserClient } from "../gateway.ts";
import type { AgentsFilesGetResult, HealthSnapshot, StatusSummary } from "../types.ts";

const SKYNET_DEBUG_FILES = [
  "INTERNAL_PROJECT.json",
  ".openskynet/living-memory/state/agent_openskynet_main.json",
  ".openskynet/living-memory/history.jsonl",
  "memory/SKYNET_PULSE.md",
  "memory/SKYNET_CONTINUITY.md",
  "memory/SKYNET_COMMITMENT.md",
  "memory/SKYNET_ACTIVE_EXPERIMENT.md",
] as const;

export type DebugWorkspaceFile = {
  name: string;
  content: string;
};

export type DebugState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  debugLoading: boolean;
  debugStatus: StatusSummary | null;
  debugHealth: HealthSnapshot | null;
  debugModels: unknown[];
  debugHeartbeat: unknown;
  debugProjectFiles: DebugWorkspaceFile[];
  debugCallMethod: string;
  debugCallParams: string;
  debugCallResult: string | null;
  debugCallError: string | null;
};

export async function loadDebug(state: DebugState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.debugLoading) {
    return;
  }
  state.debugLoading = true;
  try {
    const [status, health, models, heartbeat] = await Promise.all([
      state.client.request("status", {}),
      state.client.request("health", {}),
      state.client.request("models.list", {}),
      state.client.request("last-heartbeat", {}),
    ]);
    state.debugStatus = status as StatusSummary;
    state.debugHealth = health as HealthSnapshot;
    const modelPayload = models as { models?: unknown[] } | undefined;
    state.debugModels = Array.isArray(modelPayload?.models) ? modelPayload?.models : [];
    state.debugHeartbeat = heartbeat;
    const healthSummary = health as { defaultAgentId?: unknown } | null;
    const defaultAgentId =
      typeof healthSummary?.defaultAgentId === "string" ? healthSummary.defaultAgentId.trim() : "";
    if (defaultAgentId) {
      const fileResults = await Promise.allSettled(
        SKYNET_DEBUG_FILES.map(async (name) => {
          const res = await state.client!.request<AgentsFilesGetResult | null>("agents.files.get", {
            agentId: defaultAgentId,
            name,
          });
          return {
            name,
            content: res?.file?.content ?? "",
          };
        }),
      );
      state.debugProjectFiles = fileResults.flatMap((result) =>
        result.status === "fulfilled" && result.value.content.trim() ? [result.value] : [],
      );
    } else {
      state.debugProjectFiles = [];
    }
  } catch (err) {
    state.debugCallError = String(err);
  } finally {
    state.debugLoading = false;
  }
}

export async function callDebugMethod(state: DebugState) {
  if (!state.client || !state.connected) {
    return;
  }
  state.debugCallError = null;
  state.debugCallResult = null;
  try {
    const params = state.debugCallParams.trim()
      ? (JSON.parse(state.debugCallParams) as unknown)
      : {};
    const res = await state.client.request(state.debugCallMethod.trim(), params);
    state.debugCallResult = JSON.stringify(res, null, 2);
  } catch (err) {
    state.debugCallError = String(err);
  }
}
