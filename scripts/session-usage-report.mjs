#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function derivePromptTokens(usage) {
  if (!usage || typeof usage !== "object") {
    return 0;
  }
  return (
    asNumber(usage.input) +
    asNumber(usage.inputTokens) +
    asNumber(usage.input_tokens) +
    asNumber(usage.promptTokens) +
    asNumber(usage.prompt_tokens) +
    asNumber(usage.cacheRead) +
    asNumber(usage.cache_read) +
    asNumber(usage.cache_read_input_tokens) +
    asNumber(usage.cached_tokens) +
    asNumber(usage.cacheWrite) +
    asNumber(usage.cache_write) +
    asNumber(usage.cache_creation_input_tokens)
  );
}

async function resolveLatestSessionFile(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const stat = await fs.stat(fullPath);
    files.push({ fullPath, mtimeMs: stat.mtimeMs });
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.fullPath;
}

async function main() {
  const targetArg = process.argv[2];
  const defaultDir = "/home/daroch/.openskynet/agents/main/sessions";
  const sessionFile = targetArg || (await resolveLatestSessionFile(defaultDir));
  if (!sessionFile) {
    console.error("No session file found.");
    process.exit(1);
  }

  const raw = await fs.readFile(sessionFile, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const rows = [];

  for (const line of lines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed?.type !== "message") {
      continue;
    }
    const message = parsed.message;
    if (message?.role !== "assistant") {
      continue;
    }
    const usage = message.usage || {};
    const promptTokens = derivePromptTokens(usage);
    rows.push({
      timestamp: parsed.timestamp || "-",
      provider: message.provider || "-",
      model: message.model || "-",
      stopReason: message.stopReason || "-",
      promptTokens,
      input: asNumber(usage.input ?? usage.inputTokens ?? usage.input_tokens ?? usage.promptTokens),
      output: asNumber(
        usage.output ?? usage.outputTokens ?? usage.output_tokens ?? usage.completionTokens,
      ),
      cacheRead: asNumber(
        usage.cacheRead ?? usage.cache_read ?? usage.cache_read_input_tokens ?? usage.cached_tokens,
      ),
      total: asNumber(usage.totalTokens ?? usage.total ?? usage.total_tokens),
      error: message.errorMessage || "",
    });
  }

  console.log(`Session: ${sessionFile}`);
  console.log("timestamp\tmodel\tstop\tprompt_tokens\tinput\tcache_read\toutput\ttotal\terror");
  for (const row of rows) {
    console.log(
      [
        row.timestamp,
        row.model,
        row.stopReason,
        row.promptTokens,
        row.input,
        row.cacheRead,
        row.output,
        row.total,
        row.error.replaceAll("\t", " ").slice(0, 120),
      ].join("\t"),
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
