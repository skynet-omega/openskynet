import fs from "node:fs/promises";
import path from "node:path";
import { resolveOmegaWorkspaceRoot } from "../../../src/omega/autonomous-runtime.js";

/**
 * Artifact: Autonomous Focal Point
 * Purpose: Measures and preserves the 'pressure' of the active agenda.
 * Helps Skynet detect if it's following its own endogeneous focus or just reacting.
 */

export type FocalPointReport = {
  timestamp: string;
  focusTitle: string;
  adherenceScore: number; // 0-1
  driftDetected: boolean;
  verdict: "stabilize" | "reframe" | "push";
};

async function runFocalPointProbe() {
  const workspaceRoot = resolveOmegaWorkspaceRoot({ cwd: process.cwd() });
  const pulsePath = path.join(workspaceRoot, "memory", "SKYNET_PULSE.md");
  const reportPath = path.join(workspaceRoot, "memory", "SKYNET_FOCAL_POINT.md");

  let pulseContent = "";
  try {
    pulseContent = await fs.readFile(pulsePath, "utf-8");
  } catch {
    // No pulse yet
  }

  const focusMatch = pulseContent.match(/- Focus: (.+)/);
  const currentFocus = focusMatch ? focusMatch[1] : "none";

  // Heuristic: if focus is 'none' or hasn't changed in many cycles without results, drift is high.
  // For this first version, we just establish the baseline.
  const adherenceScore = currentFocus !== "none" ? 1.0 : 0.0;
  const driftDetected = adherenceScore < 0.5;

  const report: FocalPointReport = {
    timestamp: new Date().toISOString(),
    focusTitle: currentFocus,
    adherenceScore,
    driftDetected,
    verdict: adherenceScore > 0.8 ? "push" : "stabilize",
  };

  const md = [
    "# SKYNET Focal Point",
    "",
    `Last check: ${report.timestamp}`,
    `Active Focus: **${report.focusTitle}**`,
    `Adherence Score: ${report.adherenceScore.toFixed(2)}`,
    `Drift Detected: ${report.driftDetected ? "YES" : "NO"}`,
    `Verdict: **${report.verdict}**`,
    "",
    "## Insights",
    `- Agenda pressure is ${report.adherenceScore > 0.5 ? "nominal" : "low"}.`,
    `- Continuity is being maintained via persistent memory artifacts.`,
  ].join("\n");

  await fs.writeFile(reportPath, md, "utf-8");
  console.log(`Focal point report generated at: ${reportPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFocalPointProbe().catch(console.error);
}
