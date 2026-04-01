import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  auditSkynetCausalObservability,
  collectSkynetSessionTranscriptFiles,
  type SkynetCausalObservabilityAudit,
} from "../causal-valence/observability-audit.js";

export type SkynetCausalValenceObservability01Result = SkynetCausalObservabilityAudit & {
  sessionKey: string;
  updatedAt: number;
  projectName: string;
  scannedSessionFiles: string[];
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

function defaultSessionsDir(): string {
  return path.join(os.homedir(), ".openskynet", "agents", "main", "sessions");
}

export function resolveSkynetCausalValenceObservability01JsonPath(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    `${sanitizeSessionKey(params.sessionKey)}-causal-valence-observability-01.json`,
  );
}

export function resolveSkynetCausalValenceObservability01MarkdownPath(
  workspaceRoot: string,
): string {
  return path.join(workspaceRoot, "memory", "SKYNET_EXPERIMENT_CAUSAL_VALENCE_OBSERVABILITY_01.md");
}

function buildMarkdown(result: SkynetCausalValenceObservability01Result): string {
  return [
    "# SKYNET Experiment - Causal Valence Observability 01",
    "",
    `Updated: ${new Date(result.updatedAt).toISOString()}`,
    `Session: ${result.sessionKey}`,
    `Verdict: ${result.verdict}`,
    `Scanned sessions: ${result.scannedSessionCount}`,
    `Tool calls: ${result.totalToolCalls}`,
    `Paired tool results: ${result.pairedToolResults}`,
    `Directly usable calls: ${result.directlyUsableCalls}`,
    `Usable ratio: ${result.usableRatio.toFixed(2)}`,
    `Extractable exec calls: ${result.extractableExecCalls}`,
    `Adapted usable calls: ${result.adaptedUsableCalls}`,
    `Adapted usable ratio: ${result.adaptedUsableRatio.toFixed(2)}`,
    `Exec dominance: ${result.execDominanceRatio.toFixed(2)}`,
    "",
    "## Tool Distribution",
    "",
    ...Object.entries(result.toolNameCounts).map(([toolName, count]) => `- ${toolName}: ${count}`),
    "",
    "## Rationale",
    "",
    ...result.rationale.map((line) => `- ${line}`),
    "",
  ].join("\n");
}

export async function runSkynetCausalValenceObservability01(params: {
  workspaceRoot: string;
  sessionKey: string;
  sessionsDir?: string;
}): Promise<SkynetCausalValenceObservability01Result> {
  const sessionFiles = await collectSkynetSessionTranscriptFiles(
    params.sessionsDir ?? defaultSessionsDir(),
  );
  const audit = await auditSkynetCausalObservability({ sessionFiles });
  const result: SkynetCausalValenceObservability01Result = {
    sessionKey: params.sessionKey,
    updatedAt: Date.now(),
    projectName: "Skynet",
    scannedSessionFiles: sessionFiles,
    ...audit,
  };
  const jsonPath = resolveSkynetCausalValenceObservability01JsonPath(params);
  const markdownPath = resolveSkynetCausalValenceObservability01MarkdownPath(params.workspaceRoot);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(result, null, 2) + "\n", "utf-8");
  await fs.writeFile(markdownPath, buildMarkdown(result), "utf-8");
  return result;
}

async function main() {
  const result = await runSkynetCausalValenceObservability01({
    workspaceRoot: process.cwd(),
    sessionKey: "agent:openskynet:main",
  });
  console.log(`--- ${result.projectName} Experiment: Causal Valence Observability 01 ---`);
  console.log(`Verdict: ${result.verdict}`);
  console.log(`Usable ratio: ${result.usableRatio.toFixed(2)}`);
  console.log(`Exec dominance: ${result.execDominanceRatio.toFixed(2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
