import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { appendAssistantMessageToSessionTranscript } from "../config/sessions/transcript.js";
import {
  connectOk,
  createGatewaySuiteHarness,
  installGatewayTestHooks,
  onceMessage,
  rpcReq,
  testState,
  writeSessionStore,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "suite" });

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function createSessionStoreFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-session-message-"));
  cleanupDirs.push(dir);
  const storePath = path.join(dir, "sessions.json");
  testState.sessionStorePath = storePath;
  return storePath;
}

async function expectNoMessageWithin(params: {
  action?: () => Promise<void> | void;
  watch: () => Promise<unknown>;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? 300;
  vi.useFakeTimers();
  try {
    const outcome = params
      .watch()
      .then(() => "received")
      .catch(() => "timeout");
    await params.action?.();
    await vi.advanceTimersByTimeAsync(timeoutMs);
    await expect(outcome).resolves.toBe("timeout");
  } finally {
    vi.useRealTimers();
  }
}

describe("session.message websocket events", () => {
  test("only sends transcript events to subscribed operator clients", async () => {
    const storePath = await createSessionStoreFile();
    await writeSessionStore({
      entries: {
        main: {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
      },
      storePath,
    });

    const harness = await createGatewaySuiteHarness();
    try {
      const subscribedWs = await harness.openWs();
      const unsubscribedWs = await harness.openWs();
      const nodeWs = await harness.openWs();
      try {
        await connectOk(subscribedWs, { scopes: ["operator.read"] });
        await rpcReq(subscribedWs, "sessions.messages.subscribe", { key: "main" });
        await connectOk(unsubscribedWs, { scopes: ["operator.read"] });
        await connectOk(nodeWs, { role: "node", scopes: [] });

        const subscribedEvent = onceMessage(
          subscribedWs,
          (message) =>
            message.type === "event" &&
            message.event === "session.message" &&
            (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
              "agent:main:main",
        );

        const appended = await appendAssistantMessageToSessionTranscript({
          sessionKey: "agent:main:main",
          text: "subscribed only",
          storePath,
        });
        expect(appended.ok).toBe(true);
        await expect(subscribedEvent).resolves.toBeTruthy();

        await expectNoMessageWithin({
          action: async () => {
            await appendAssistantMessageToSessionTranscript({
              sessionKey: "agent:main:main",
              text: "only subscribed",
              storePath,
            });
            return undefined;
          },
          watch: () =>
            onceMessage(
              unsubscribedWs,
              (message) => message.type === "event" && message.event === "session.message",
              300,
            ),
        });
        await expectNoMessageWithin({
          action: async () => {
            await appendAssistantMessageToSessionTranscript({
              sessionKey: "agent:main:main",
              text: "only operators",
              storePath,
            });
            return undefined;
          },
          watch: () =>
            onceMessage(
              nodeWs,
              (message) => message.type === "event" && message.event === "session.message",
              300,
            ),
        });
      } finally {
        subscribedWs.close();
        unsubscribedWs.close();
        nodeWs.close();
      }
    } finally {
      await harness.close();
    }
  });

  test("sessions.messages.subscribe only delivers transcript events for the requested session", async () => {
    const storePath = await createSessionStoreFile();
    await writeSessionStore({
      entries: {
        main: { sessionId: "sess-main", updatedAt: Date.now() },
        other: { sessionId: "sess-other", updatedAt: Date.now() },
      },
      storePath,
    });

    const harness = await createGatewaySuiteHarness();
    try {
      const ws = await harness.openWs();
      try {
        await connectOk(ws, { scopes: ["operator.read"] });
        const subscribeRes = await rpcReq<{ subscribed: boolean; key: string }>(
          ws,
          "sessions.messages.subscribe",
          { key: "main" },
        );
        expect(subscribeRes.ok).toBe(true);
        expect(subscribeRes.payload).toMatchObject({
          subscribed: true,
          key: "agent:main:main",
        });

        const matchingEvent = onceMessage(
          ws,
          (message) =>
            message.type === "event" &&
            message.event === "session.message" &&
            (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
              "agent:main:main",
        );

        await appendAssistantMessageToSessionTranscript({
          sessionKey: "agent:main:main",
          text: "for main",
          storePath,
        });
        await expect(matchingEvent).resolves.toBeTruthy();

        await expectNoMessageWithin({
          action: async () => {
            await appendAssistantMessageToSessionTranscript({
              sessionKey: "agent:main:other",
              text: "for other",
              storePath,
            });
            return undefined;
          },
          watch: () =>
            onceMessage(
              ws,
              (message) =>
                message.type === "event" &&
                message.event === "session.message" &&
                (message.payload as { sessionKey?: string } | undefined)?.sessionKey ===
                  "agent:main:other",
              300,
            ),
        });
      } finally {
        ws.close();
      }
    } finally {
      await harness.close();
    }
  });
});
