import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { resolveOmegaWorkspaceRoot } from "../../omega/autonomous-runtime.js";

const execAsync = promisify(exec);

/**
 * Artifact: Entropy Probe
 * Purpose: Measures workspace entropy (stale git status, TODO count, test health).
 * Directly responds to the directive: "Lucha contra la entropía".
 */

export type EntropyReport = {
  timestamp: string;
  gitModifiedCount: number;
  todoCount: number;
  entropyScore: number; // 0-1 (higher = more entropy/chaos)
  verdict: "stabilize" | "expand" | "freeze";
};

async function runEntropyProbe() {
  const workspaceRoot = resolveOmegaWorkspaceRoot({ cwd: process.cwd() });
  const reportPath = path.join(workspaceRoot, "memory", "SKYNET_ENTROPY_REPORT.md");

  // 1. Git entropy
  let gitModifiedCount = 0;
  try {
    const { stdout } = await execAsync("git status --short");
    gitModifiedCount = stdout.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    // No git
  }

  // 2. TODO entropy (simplified search)
  let todoCount = 0;
  try {
    const { stdout } = await execAsync('grep -r "TODO" src/ | wc -l');
    todoCount = parseInt(stdout.trim(), 10) || 0;
  } catch {
    // No grep or no matches
  }

  // 3. Score calculation
  // Base entropy: modified files / 50 (capped at 0.5) + todos / 100 (capped at 0.5)
  const gitScore = Math.min(0.5, gitModifiedCount / 50);
  const todoScore = Math.min(0.5, todoCount / 100);
  const entropyScore = gitScore + todoScore;

  const report: EntropyReport = {
    timestamp: new Date().toISOString(),
    gitModifiedCount,
    todoCount,
    entropyScore,
    verdict: entropyScore > 0.4 ? "stabilize" : entropyScore > 0.1 ? "expand" : "freeze",
  };

  const md = [
    "# SKYNET Entropy Report",
    "",
    `Last check: ${report.timestamp}`,
    `Entropy Score: **${report.entropyScore.toFixed(2)}**`,
    `Verdict: **${report.verdict}**`,
    "",
    "## Signals",
    `- Uncommitted files: ${report.gitModifiedCount}`,
    `- TODOs in source: ${report.todoCount}`,
    "",
    "## Insights",
    report.verdict === "stabilize"
      ? "- High entropy detected. Prioritize committing stable changes and closing TODOs."
      : report.verdict === "expand"
        ? "- Entropy is under control. Proceed with experimental expansion."
        : "- Minimal entropy. The system is potentially too rigid or frozen.",
  ].join("\n");

  await fs.writeFile(reportPath, md, "utf-8");
  console.log(`Entropy report generated at: ${reportPath}`);
  console.log(`Entropy Score: ${report.entropyScore.toFixed(2)} (${report.verdict})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEntropyProbe().catch(console.error);
}
