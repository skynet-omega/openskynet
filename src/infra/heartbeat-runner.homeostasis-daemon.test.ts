import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as replyModule from "../auto-reply/reply.js";
import type { OpenSkynetConfig } from "../config/config.js";
import { resolveMainSessionKey } from "../config/sessions.js";
import { withEnvAsync } from "../test-utils/env.js";

vi.mock("jiti", () => ({ createJiti: () => () => ({}) }));

import { runHeartbeatOnce } from "./heartbeat-runner.js";

const tmpDirs: string[] = [];

async function withHeartbeatFixture(
  run: (ctx: { tmpDir: string; storePath: string }) => Promise<void>,
): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-hb-homeostasis-"));
  tmpDirs.push(tmpDir);
  const storePath = path.join(tmpDir, "sessions.json");
  await fs.writeFile(path.join(tmpDir, "HEARTBEAT.md"), "- Check status\n", "utf-8");
  await run({ tmpDir, storePath });
}

describe("runHeartbeatOnce homeostasis daemon isolation", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(
      tmpDirs.splice(0, tmpDirs.length).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  async function runFixture(): Promise<void> {
    await withHeartbeatFixture(async ({ tmpDir, storePath }) => {
      const cfg: OpenSkynetConfig = {
        agents: {
          defaults: {
            workspace: tmpDir,
            heartbeat: {
              every: "5m",
              target: "none",
            },
          },
        },
        session: { store: storePath },
      };
      const sessionKey = resolveMainSessionKey(cfg);
      await fs.writeFile(
        storePath,
        JSON.stringify({
          [sessionKey]: {
            sessionId: "sid",
            updatedAt: Date.now(),
            lastChannel: "whatsapp",
            lastProvider: "whatsapp",
            lastTo: "+1555",
          },
        }),
      );
      vi.spyOn(replyModule, "getReplyFromConfig").mockResolvedValue({ text: "HEARTBEAT_OK" });

      await runHeartbeatOnce({
        cfg,
        deps: {
          getQueueSize: () => 0,
          nowMs: () => 0,
        },
      });
    });
  }

  it("ignores the experimental homeostasis env flag on the main heartbeat path", async () => {
    await withEnvAsync({ OPENSKYNET_OMEGA_HOMEOSTASIS_DAEMON: "1" }, async () => {
      await runFixture();
    });
  });
});
