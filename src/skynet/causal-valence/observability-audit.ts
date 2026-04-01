import fs from "node:fs/promises";
import path from "node:path";
import { extractSkynetShellAction } from "./shell-action-extractor.js";

export type SkynetCausalObservabilityAudit = {
  scannedSessionCount: number;
  totalToolCalls: number;
  pairedToolResults: number;
  execCommandCalls: number;
  extractableExecCalls: number;
  structuredPathCalls: number;
  structuredActionCalls: number;
  directlyUsableCalls: number;
  adaptedUsableCalls: number;
  toolNameCounts: Record<string, number>;
  usableRatio: number;
  adaptedUsableRatio: number;
  execDominanceRatio: number;
  verdict: "pass" | "fail";
  rationale: string[];
};

type ToolCallRecord = {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
};

type TranscriptLine = {
  type?: string;
  message?: {
    role?: string;
    toolCallId?: string;
    toolName?: string;
    content?: unknown[];
  };
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function hasStructuredPath(argumentsValue: Record<string, unknown>): boolean {
  return (
    typeof argumentsValue.path === "string" ||
    typeof argumentsValue.file_path === "string" ||
    typeof argumentsValue.filePath === "string"
  );
}

function hasStructuredAction(argumentsValue: Record<string, unknown>): boolean {
  return typeof argumentsValue.action === "string";
}

function isDirectlyUsableToolCall(toolCall: ToolCallRecord): boolean {
  if (toolCall.toolName === "exec") {
    return false;
  }
  return hasStructuredPath(toolCall.arguments);
}

export async function collectSkynetSessionTranscriptFiles(baseDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => path.join(baseDir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

export async function auditSkynetCausalObservability(params: {
  sessionFiles: string[];
}): Promise<SkynetCausalObservabilityAudit> {
  const toolCallsById = new Map<string, ToolCallRecord>();
  const toolNameCounts: Record<string, number> = {};

  let totalToolCalls = 0;
  let pairedToolResults = 0;
  let execCommandCalls = 0;
  let extractableExecCalls = 0;
  let structuredPathCalls = 0;
  let structuredActionCalls = 0;
  let directlyUsableCalls = 0;

  for (const sessionFile of params.sessionFiles) {
    const raw = await fs.readFile(sessionFile, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const parsed = JSON.parse(line) as TranscriptLine;
      const message = parsed.message;
      if (
        parsed.type === "message" &&
        message?.role === "assistant" &&
        Array.isArray(message.content)
      ) {
        for (const part of message.content) {
          if (
            !part ||
            typeof part !== "object" ||
            (part as { type?: string }).type !== "toolCall"
          ) {
            continue;
          }
          const toolCall = part as {
            type: "toolCall";
            id?: string;
            name?: string;
            arguments?: Record<string, unknown>;
          };
          if (typeof toolCall.id !== "string" || typeof toolCall.name !== "string") {
            continue;
          }
          totalToolCalls += 1;
          toolNameCounts[toolCall.name] = (toolNameCounts[toolCall.name] ?? 0) + 1;
          if (toolCall.name === "exec" && typeof toolCall.arguments?.command === "string") {
            execCommandCalls += 1;
            if (extractSkynetShellAction(toolCall.arguments.command).extractable) {
              extractableExecCalls += 1;
            }
          }
          if (hasStructuredPath(toolCall.arguments ?? {})) {
            structuredPathCalls += 1;
          }
          if (hasStructuredAction(toolCall.arguments ?? {})) {
            structuredActionCalls += 1;
          }
          if (
            isDirectlyUsableToolCall({
              id: toolCall.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments ?? {},
            })
          ) {
            directlyUsableCalls += 1;
          }
          toolCallsById.set(toolCall.id, {
            id: toolCall.id,
            toolName: toolCall.name,
            arguments: toolCall.arguments ?? {},
          });
        }
      }
      if (
        parsed.type === "message" &&
        message?.role === "toolResult" &&
        typeof message.toolCallId === "string"
      ) {
        if (toolCallsById.has(message.toolCallId)) {
          pairedToolResults += 1;
        }
      }
    }
  }

  const usableRatio = totalToolCalls > 0 ? clamp01(directlyUsableCalls / totalToolCalls) : 0;
  const adaptedUsableCalls = directlyUsableCalls + extractableExecCalls;
  const adaptedUsableRatio = totalToolCalls > 0 ? clamp01(adaptedUsableCalls / totalToolCalls) : 0;
  const execDominanceRatio = totalToolCalls > 0 ? clamp01(execCommandCalls / totalToolCalls) : 0;
  const opaqueExecRatio =
    totalToolCalls > 0 ? clamp01((execCommandCalls - extractableExecCalls) / totalToolCalls) : 0;
  const rationale: string[] = [
    `tool-calls=${totalToolCalls}`,
    `paired-results=${pairedToolResults}`,
    `directly-usable=${directlyUsableCalls}`,
    `usable-ratio=${usableRatio.toFixed(2)}`,
    `extractable-exec=${extractableExecCalls}`,
    `adapted-usable=${adaptedUsableCalls}`,
    `adapted-usable-ratio=${adaptedUsableRatio.toFixed(2)}`,
    `exec-dominance=${execDominanceRatio.toFixed(2)}`,
    `opaque-exec-ratio=${opaqueExecRatio.toFixed(2)}`,
  ];

  const failureReasons: string[] = [];
  if (totalToolCalls < 30) {
    failureReasons.push("not-enough-tool-calls");
  }
  if (usableRatio < 0.35) {
    failureReasons.push("usable-ratio-too-low");
  }
  if (adaptedUsableRatio < 0.55) {
    failureReasons.push("adapted-usable-ratio-too-low");
  }
  if (opaqueExecRatio > 0.25) {
    failureReasons.push("exec-dominates-runtime");
  }
  rationale.push(...failureReasons.map((reason) => `fail:${reason}`));

  return {
    scannedSessionCount: params.sessionFiles.length,
    totalToolCalls,
    pairedToolResults,
    execCommandCalls,
    extractableExecCalls,
    structuredPathCalls,
    structuredActionCalls,
    directlyUsableCalls,
    adaptedUsableCalls,
    toolNameCounts,
    usableRatio,
    adaptedUsableRatio,
    execDominanceRatio,
    verdict: failureReasons.length > 0 ? "fail" : "pass",
    rationale,
  };
}
