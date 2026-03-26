import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "vitest";
import { runOneHeartbeatCycleWithDeps, createDefaultHeartbeatDeps } from "./heartbeat.js";

test("Heartbeat Stress Test", async () => {
  const workspaceRoot = process.cwd();
  const sessionKey = "stress:main";
  const metricsPath = path.join(workspaceRoot, ".openskynet", "omega-heartbeat-metrics.jsonl");

  await fs.mkdir(path.dirname(metricsPath), { recursive: true }).catch(() => {});
  await fs.unlink(metricsPath).catch(() => {});

  let currentIteration = 0;
  const iterationsCount = 50;
  const stableKernelUpdatedAt = Date.now();

  const mockDeps = {
    ...createDefaultHeartbeatDeps(),
    buildPrompt: async () => "Simulated prompt",
    loadRuntimeSnapshot: async () => ({
      timeline: [],
      kernel: { updatedAt: stableKernelUpdatedAt },
    }),
    sendAgentTurn: async () => {
      await new Promise((r) => setTimeout(r, 10));
    },
    appendConsciousnessLog: async () => {},
    applyExecutiveAction: async () => ({ kind: "none", wakeAction: { kind: "heartbeat_ok" } }),
    readLatestReply: async () => {
      currentIteration++;
      return currentIteration < iterationsCount ? "Continue" : "HEARTBEAT_OK";
    },
    sleep: async () => {},
  };

  const startTime = performance.now();
  await runOneHeartbeatCycleWithDeps({ workspaceRoot, sessionKey }, mockDeps as any);
  const endTime = performance.now();
  const totalDuration = endTime - startTime;

  const stats = await fs.stat(metricsPath).catch(() => ({ size: 0 }));

  console.log("\n📊 Results:");
  console.log(`Total duration: ${totalDuration.toFixed(2)}ms`);
  console.log(
    `Average overhead per iteration: ${(totalDuration / Math.max(currentIteration, 1)).toFixed(2)}ms`,
  );
  console.log(`Metrics file size: ${stats.size} bytes`);

  expect(totalDuration).toBeLessThan(10000); // 50 iterations * 10ms network + < 5000ms overhead
});
