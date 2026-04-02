import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, resolveGatewayPort } from "../../config/config.js";
import { GatewayClient } from "../../gateway/client.js";
import { PROTOCOL_VERSION } from "../../gateway/protocol/index.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../../utils/message-channel.js";
import {
  normalizeSkynetRuntimeGatewayEvent,
  type SkynetRuntimeLiveObservation,
} from "../runtime-observer/live-event-normalizer.js";
import {
  acquireSkynetRuntimeObserverLiveLock,
  appendSkynetRuntimeObserverLiveObservation,
  releaseSkynetRuntimeObserverLiveLock,
  resolveSkynetRuntimeObserverLiveJsonlPath,
  resolveSkynetRuntimeObserverLiveSummaryPath,
  writeSkynetRuntimeObserverLiveSummary,
  type SkynetRuntimeObserverTapSummary,
} from "../runtime-observer/live-event-store.js";

export type SkynetRuntimeObserverLive01Result = SkynetRuntimeObserverTapSummary & {
  status: "ok";
  lockPath: string;
};

function buildGatewayUrl(): string {
  const cfg = loadConfig();
  const remoteUrl = cfg.gateway?.remote?.url?.trim();
  if (cfg.gateway?.mode === "remote" && remoteUrl) {
    return remoteUrl;
  }
  return `ws://127.0.0.1:${resolveGatewayPort(cfg)}`;
}

function gatewayToken(): string | undefined {
  const cfg = loadConfig();
  return typeof cfg.gateway?.auth?.token === "string" && cfg.gateway.auth.token.trim()
    ? cfg.gateway.auth.token.trim()
    : undefined;
}

export async function runSkynetRuntimeObserverLive01(params?: {
  workspaceRoot?: string;
  sessionKey?: string;
  durationMs?: number;
}): Promise<SkynetRuntimeObserverLive01Result> {
  const workspaceRoot = params?.workspaceRoot ?? process.cwd();
  const sessionKey = params?.sessionKey ?? "agent:openskynet:main";
  const durationMs = Math.max(500, params?.durationMs ?? 30_000);
  const gatewayUrl = buildGatewayUrl();
  const lockPath = await acquireSkynetRuntimeObserverLiveLock({ workspaceRoot, sessionKey });
  const summary: SkynetRuntimeObserverTapSummary = {
    sessionKey,
    updatedAt: Date.now(),
    gatewayUrl,
    eventCount: 0,
    eventCountsByType: {},
    messageSubscriptions: [],
    jsonlPath: resolveSkynetRuntimeObserverLiveJsonlPath({ workspaceRoot, sessionKey }),
    summaryPath: resolveSkynetRuntimeObserverLiveSummaryPath({ workspaceRoot, sessionKey }),
  };

  const subscribedMessages = new Set<string>();
  let writeQueue = Promise.resolve();
  let lastObservedAt = Date.now();
  const persistSyntheticObservation = async (
    observation: Omit<SkynetRuntimeLiveObservation, "source" | "recordedAt">,
  ) => {
    const normalized = {
      source: "gateway" as const,
      recordedAt: Date.now(),
      ...observation,
    };
    await appendSkynetRuntimeObserverLiveObservation({
      workspaceRoot,
      sessionKey,
      observation: normalized,
    });
    summary.eventCount += 1;
    summary.eventCountsByType[normalized.event] =
      (summary.eventCountsByType[normalized.event] ?? 0) + 1;
    summary.updatedAt = Date.now();
    lastObservedAt = normalized.recordedAt;
  };
  const maybeSubscribeSessionMessages = async (client: GatewayClient, key: string | undefined) => {
    const sessionToWatch = typeof key === "string" ? key.trim() : "";
    if (!sessionToWatch || subscribedMessages.has(sessionToWatch)) {
      return;
    }
    subscribedMessages.add(sessionToWatch);
    summary.messageSubscriptions = [...subscribedMessages].sort();
    try {
      await client.request("sessions.messages.subscribe", { key: sessionToWatch });
    } catch {
      // Keep the tap alive even if a session disappears mid-subscribe.
    }
  };

  let helloResolved = false;
  let finishConnected: (() => void) | undefined;
  let failConnected: ((error: Error) => void) | undefined;
  const connected = new Promise<void>((resolve, reject) => {
    finishConnected = resolve;
    failConnected = reject;
  });

  const client = new GatewayClient({
    url: gatewayUrl,
    token: gatewayToken(),
    role: "operator",
    scopes: ["operator.read"],
    clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
    clientDisplayName: "Skynet Runtime Observer",
    mode: GATEWAY_CLIENT_MODES.BACKEND,
    clientVersion: "runtime-observer-live-01",
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    onHelloOk: () => {
      helloResolved = true;
      summary.connectedAt = Date.now();
      writeQueue = writeQueue.then(() =>
        persistSyntheticObservation({
          event: "tap.connect",
          phase: "connected",
        }),
      );
      finishConnected?.();
    },
    onConnectError: (error) => {
      if (!helloResolved) {
        failConnected?.(error);
      }
    },
    onEvent: (frame) => {
      writeQueue = writeQueue
        .then(async () => {
          const normalized = normalizeSkynetRuntimeGatewayEvent(frame);
          if (!normalized) {
            return;
          }
          await appendSkynetRuntimeObserverLiveObservation({
            workspaceRoot,
            sessionKey,
            observation: normalized,
          });
          summary.eventCount += 1;
          summary.eventCountsByType[normalized.event] =
            (summary.eventCountsByType[normalized.event] ?? 0) + 1;
          summary.updatedAt = Date.now();
          lastObservedAt = normalized.recordedAt;
          if (normalized.sessionKey) {
            await maybeSubscribeSessionMessages(client, normalized.sessionKey);
          }
        })
        .catch(() => {});
    },
    onClose: () => {
      summary.disconnectedAt = Date.now();
      summary.updatedAt = Date.now();
    },
  });

  try {
    client.start();
    await Promise.race([
      connected,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("runtime observer live connect timeout")), 10_000),
      ),
    ]);

    await client.request("sessions.subscribe");
    const listResult = await client.request<{ sessions?: Array<{ key?: string }> }>(
      "sessions.list",
      {
        limit: 24,
      },
    );
    for (const entry of listResult?.sessions ?? []) {
      await maybeSubscribeSessionMessages(client, entry?.key);
    }

    const idleThresholdMs = Math.max(1_500, Math.min(15_000, Math.floor(durationMs / 2)));
    const idleTimer = setInterval(
      () => {
        if (Date.now() - lastObservedAt < idleThresholdMs) {
          return;
        }
        writeQueue = writeQueue.then(() =>
          persistSyntheticObservation({
            event: "tap.idle",
            phase: "idle",
            textPreview: `idle gap >= ${idleThresholdMs}ms`,
          }),
        );
      },
      Math.max(750, Math.floor(idleThresholdMs / 3)),
    );
    idleTimer.unref?.();
    await new Promise((resolve) => setTimeout(resolve, durationMs));
    clearInterval(idleTimer);
    await writeQueue;
    summary.updatedAt = Date.now();
    summary.disconnectedAt ??= Date.now();
    await persistSyntheticObservation({
      event: "tap.disconnect",
      phase: "disconnected",
    });
    await writeSkynetRuntimeObserverLiveSummary(summary);
    return {
      status: "ok",
      lockPath,
      ...summary,
    };
  } finally {
    client.stop();
    await writeQueue;
    await writeSkynetRuntimeObserverLiveSummary(summary);
    await releaseSkynetRuntimeObserverLiveLock(lockPath);
  }
}

async function main() {
  const durationMs = Number(process.env.OPENSKYNET_RUNTIME_OBSERVER_LIVE_MS ?? "10000");
  const result = await runSkynetRuntimeObserverLive01({
    workspaceRoot: process.cwd(),
    sessionKey: `agent:openskynet:${os.hostname().toLowerCase()}`,
    durationMs,
  });
  console.log(`--- Skynet Experiment: Runtime Observer Live 01 ---`);
  console.log(`Gateway: ${result.gatewayUrl}`);
  console.log(`Events: ${result.eventCount}`);
  console.log(`JSONL: ${path.relative(process.cwd(), result.jsonlPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
