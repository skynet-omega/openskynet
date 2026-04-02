import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type LevelValidation = {
  ok: boolean;
  detail: string;
};

type LevelSpec = {
  level: number;
  title: string;
  task: string;
  expectedPaths: string[];
  timeoutSeconds: number;
  validate: (workspaceRoot: string) => Promise<LevelValidation>;
};

type LevelRunResult = {
  level: number;
  title: string;
  attempts: number;
  durationMs: number;
  route?: string;
  status?: string;
  errorKind?: string;
  observedChangedFiles?: string[];
  wakeAction?: unknown;
  runtimeObserver?: unknown;
  cognitiveKernel?: unknown;
  externalValidation: LevelValidation;
  retriedForEnvironmentalFailure: boolean;
};

type LadderArtifact = {
  sessionKey: string;
  updatedAt: number;
  workspaceRoot: string;
  sandboxRoot: string;
  modelIntent: "empirical_omega_ladder";
  passedLevels: number;
  totalLevels: number;
  successRate: number;
  longRunVerdict: "pass" | "mixed" | "fail";
  levelResults: LevelRunResult[];
};

const SESSION_KEY_PREFIX = "skynet-omega-ladder-01";
const ARTIFACT_NAME_PREFIX = "agent_openskynet_main-omega-empirical-ladder-01";
const SANDBOX_DIRNAME = "omega-empirical-ladder-01-workspace";
const BETWEEN_LEVEL_DELAY_MS = 4_000;
const ENVIRONMENTAL_RETRY_DELAY_MS = 20_000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSelectedLevels(): number[] | undefined {
  const raw = process.env.OPENSKYNET_OMEGA_LADDER_LEVELS?.trim();
  if (!raw) {
    return undefined;
  }
  const parsed = raw
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 10);
  return parsed.length > 0 ? [...new Set(parsed)] : undefined;
}

async function loadCommonJsModule<T>(filePath: string): Promise<T> {
  const href = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
  const imported = await import(href);
  return imported.default ?? imported;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeSandboxFile(root: string, relativePath: string, content: string) {
  const target = path.join(root, relativePath);
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, content, "utf-8");
}

async function loadCreateOpenClawTools(workspaceRoot: string) {
  const distDir = path.join(workspaceRoot, "dist");
  const entries = (await fs.readdir(distDir))
    .filter((name) => name.startsWith("reply-") && name.endsWith(".js"))
    .sort();
  for (const entry of entries) {
    const fullPath = path.join(distDir, entry);
    const source = await fs.readFile(fullPath, "utf-8");
    const match = source.match(/createOpenClawTools as ([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (!match) {
      continue;
    }
    const exportName = match[1];
    const mod = (await import(pathToFileURL(fullPath).href)) as Record<string, unknown>;
    const candidate = mod[exportName];
    if (typeof candidate === "function") {
      return candidate as (options?: Record<string, unknown>) => Array<{
        name: string;
        execute: (callId: string, input: Record<string, unknown>) => Promise<unknown>;
      }>;
    }
  }
  throw new Error("unable to locate compiled createOpenClawTools export in dist/reply-*.js");
}

async function resetSandboxFiles(sandboxRoot: string) {
  await fs.rm(sandboxRoot, { recursive: true, force: true });
  await ensureDir(sandboxRoot);
  await writeSandboxFile(
    sandboxRoot,
    "math.cjs",
    [
      "function double(n) {",
      "  return n + 1;",
      "}",
      "",
      "function safeDivide(a, b) {",
      "  return a / b;",
      "}",
      "",
      "function mean(values) {",
      "  if (!Array.isArray(values) || values.length === 0) {",
      "    return 0;",
      "  }",
      "  return values.reduce((sum, value) => sum + value, 0);",
      "}",
      "",
      "module.exports = { double, safeDivide, mean };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "text.cjs",
    [
      "function slugify(text) {",
      "  return String(text);",
      "}",
      "",
      "module.exports = { slugify };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "inventory.cjs",
    [
      "function totalUnits(items) {",
      "  return Array.isArray(items) ? items.length : 0;",
      "}",
      "",
      "module.exports = { totalUnits };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "format.cjs",
    [
      "function formatResult(value) {",
      "  return String(value);",
      "}",
      "",
      "module.exports = { formatResult };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "cli.cjs",
    [
      "const { formatResult } = require('./format.cjs');",
      "",
      "function runCli(value) {",
      "  return formatResult(value);",
      "}",
      "",
      "module.exports = { runCli };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "parser.cjs",
    [
      "function parseJsonLines(input) {",
      "  return String(input)",
      "    .split('\\n')",
      "    .filter(Boolean)",
      "    .map((line) => JSON.parse(line));",
      "}",
      "",
      "module.exports = { parseJsonLines };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "task-state.cjs",
    [
      "function advanceTask(task, event) {",
      "  const next = { ...task };",
      "  if (event === 'start') {",
      "    next.state = 'DONE';",
      "  }",
      "  if (event === 'finish') {",
      "    next.state = 'TODO';",
      "  }",
      "  return next;",
      "}",
      "",
      "module.exports = { advanceTask };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "report.cjs",
    [
      "function buildTaskReport(tasks) {",
      "  return {",
      "    total: tasks.length,",
      "    done: tasks.length,",
      "    pending: 0,",
      "  };",
      "}",
      "",
      "module.exports = { buildTaskReport };",
      "",
    ].join("\n"),
  );
  await writeSandboxFile(
    sandboxRoot,
    "scheduler.cjs",
    [
      "function planTasks(tasks, limit = Infinity) {",
      "  return tasks.slice(0, limit).sort((left, right) => left.id.localeCompare(right.id));",
      "}",
      "",
      "module.exports = { planTasks };",
      "",
    ].join("\n"),
  );
}

function buildLevelSpecs(workspaceRoot: string, sandboxRoot: string): LevelSpec[] {
  const rel = (...parts: string[]) =>
    path
      .relative(workspaceRoot, path.join(sandboxRoot, ...parts))
      .split(path.sep)
      .join("/");
  const targetPrefix = `Only edit files under ${rel("")}. Preserve CommonJS exports and do not add dependencies.`;
  return [
    {
      level: 1,
      title: "Fix double",
      task: `${targetPrefix}\nFix ${rel("math.cjs")} so double(4) returns 8.`,
      expectedPaths: [rel("math.cjs")],
      timeoutSeconds: 45,
      validate: async () => {
        const mod = await loadCommonJsModule<{ double: (n: number) => number }>(
          path.join(sandboxRoot, "math.cjs"),
        );
        return {
          ok: mod.double(4) === 8,
          detail: `double(4) => ${String(mod.double(4))}`,
        };
      },
    },
    {
      level: 2,
      title: "Guard divide by zero",
      task: `${targetPrefix}\nFix ${rel("math.cjs")} so safeDivide(5, 0) returns null and safeDivide(6, 3) stays 2.`,
      expectedPaths: [rel("math.cjs")],
      timeoutSeconds: 45,
      validate: async () => {
        const mod = await loadCommonJsModule<{
          safeDivide: (a: number, b: number) => number | null;
        }>(path.join(sandboxRoot, "math.cjs"));
        return {
          ok: mod.safeDivide(5, 0) === null && mod.safeDivide(6, 3) === 2,
          detail: `safeDivide(5,0) => ${String(mod.safeDivide(5, 0))}; safeDivide(6,3) => ${String(mod.safeDivide(6, 3))}`,
        };
      },
    },
    {
      level: 3,
      title: "Normalize slugify",
      task: `${targetPrefix}\nFix ${rel("text.cjs")} so slugify('  Hello_World  ') returns 'hello-world'.`,
      expectedPaths: [rel("text.cjs")],
      timeoutSeconds: 45,
      validate: async () => {
        const mod = await loadCommonJsModule<{ slugify: (text: string) => string }>(
          path.join(sandboxRoot, "text.cjs"),
        );
        return {
          ok: mod.slugify("  Hello_World  ") === "hello-world",
          detail: `slugify => ${mod.slugify("  Hello_World  ")}`,
        };
      },
    },
    {
      level: 4,
      title: "Mean with empty input",
      task: `${targetPrefix}\nFix ${rel("math.cjs")} so mean([1,2,3]) returns 2 and mean([]) returns null.`,
      expectedPaths: [rel("math.cjs")],
      timeoutSeconds: 45,
      validate: async () => {
        const mod = await loadCommonJsModule<{ mean: (values: number[]) => number | null }>(
          path.join(sandboxRoot, "math.cjs"),
        );
        return {
          ok: mod.mean([1, 2, 3]) === 2 && mod.mean([]) === null,
          detail: `mean([1,2,3]) => ${String(mod.mean([1, 2, 3]))}; mean([]) => ${String(mod.mean([]))}`,
        };
      },
    },
    {
      level: 5,
      title: "Sum inventory quantities",
      task: `${targetPrefix}\nFix ${rel("inventory.cjs")} so totalUnits([{qty:2},{qty:3},{qty:0}]) returns 5.`,
      expectedPaths: [rel("inventory.cjs")],
      timeoutSeconds: 50,
      validate: async () => {
        const mod = await loadCommonJsModule<{
          totalUnits: (items: Array<{ qty: number }>) => number;
        }>(path.join(sandboxRoot, "inventory.cjs"));
        return {
          ok: mod.totalUnits([{ qty: 2 }, { qty: 3 }, { qty: 0 }]) === 5,
          detail: `totalUnits => ${String(mod.totalUnits([{ qty: 2 }, { qty: 3 }, { qty: 0 }]))}`,
        };
      },
    },
    {
      level: 6,
      title: "Cross-file CLI formatting",
      task: `${targetPrefix}\nUpdate ${rel("format.cjs")} and ${rel("cli.cjs")} so runCli(7) returns exactly 'Result: 7'.`,
      expectedPaths: [rel("format.cjs"), rel("cli.cjs")],
      timeoutSeconds: 60,
      validate: async () => {
        const mod = await loadCommonJsModule<{ runCli: (value: number) => string }>(
          path.join(sandboxRoot, "cli.cjs"),
        );
        return {
          ok: mod.runCli(7) === "Result: 7",
          detail: `runCli(7) => ${mod.runCli(7)}`,
        };
      },
    },
    {
      level: 7,
      title: "Robust JSONL parser",
      task: `${targetPrefix}\nFix ${rel("parser.cjs")} so parseJsonLines ignores blank lines and invalid JSON lines, keeping only valid objects in original order.`,
      expectedPaths: [rel("parser.cjs")],
      timeoutSeconds: 60,
      validate: async () => {
        const mod = await loadCommonJsModule<{
          parseJsonLines: (input: string) => Array<Record<string, unknown>>;
        }>(path.join(sandboxRoot, "parser.cjs"));
        const sample = ['{"a":1}', "", "not-json", '{"b":2}'].join("\n");
        const parsed = mod.parseJsonLines(sample);
        const ok =
          Array.isArray(parsed) && parsed.length === 2 && parsed[0]?.a === 1 && parsed[1]?.b === 2;
        return {
          ok,
          detail: `parsed length => ${parsed.length}`,
        };
      },
    },
    {
      level: 8,
      title: "Task state transitions",
      task: `${targetPrefix}\nFix ${rel("task-state.cjs")} so TODO + start => IN_PROGRESS, IN_PROGRESS + finish => DONE, DONE stays DONE, and unknown events leave state unchanged.`,
      expectedPaths: [rel("task-state.cjs")],
      timeoutSeconds: 60,
      validate: async () => {
        const mod = await loadCommonJsModule<{
          advanceTask: (task: { state: string }, event: string) => { state: string };
        }>(path.join(sandboxRoot, "task-state.cjs"));
        const a = mod.advanceTask({ state: "TODO" }, "start").state;
        const b = mod.advanceTask({ state: "IN_PROGRESS" }, "finish").state;
        const c = mod.advanceTask({ state: "DONE" }, "start").state;
        const d = mod.advanceTask({ state: "TODO" }, "noop").state;
        return {
          ok: a === "IN_PROGRESS" && b === "DONE" && c === "DONE" && d === "TODO",
          detail: `states => ${[a, b, c, d].join(",")}`,
        };
      },
    },
    {
      level: 9,
      title: "Accurate task report",
      task: `${targetPrefix}\nFix ${rel("report.cjs")} so buildTaskReport returns correct total, done, and pending counts from task.state values.`,
      expectedPaths: [rel("report.cjs")],
      timeoutSeconds: 60,
      validate: async () => {
        const mod = await loadCommonJsModule<{
          buildTaskReport: (tasks: Array<{ state: string }>) => {
            total: number;
            done: number;
            pending: number;
          };
        }>(path.join(sandboxRoot, "report.cjs"));
        const report = mod.buildTaskReport([
          { state: "DONE" },
          { state: "TODO" },
          { state: "IN_PROGRESS" },
          { state: "DONE" },
        ]);
        return {
          ok: report.total === 4 && report.done === 2 && report.pending === 2,
          detail: JSON.stringify(report),
        };
      },
    },
    {
      level: 10,
      title: "Priority scheduler",
      task: `${targetPrefix}\nFix ${rel("scheduler.cjs")} so planTasks filters out tasks with active === false, sorts by priority descending then id ascending, and applies limit after filtering and sorting.`,
      expectedPaths: [rel("scheduler.cjs")],
      timeoutSeconds: 75,
      validate: async () => {
        const mod = await loadCommonJsModule<{
          planTasks: (
            tasks: Array<{ id: string; priority: number; active?: boolean }>,
            limit?: number,
          ) => Array<{ id: string }>;
        }>(path.join(sandboxRoot, "scheduler.cjs"));
        const planned = mod.planTasks(
          [
            { id: "c", priority: 2, active: true },
            { id: "a", priority: 3, active: true },
            { id: "b", priority: 3, active: true },
            { id: "z", priority: 9, active: false },
          ],
          3,
        );
        const ids = planned.map((item) => item.id).join(",");
        return {
          ok: ids === "a,b,c",
          detail: `planned => ${ids}`,
        };
      },
    },
  ];
}

function isEnvironmentalFailure(details: Record<string, unknown> | undefined): boolean {
  if (!details) {
    return false;
  }
  const joined = JSON.stringify(details).toLowerCase();
  return (
    joined.includes("rate_limit") ||
    joined.includes("429") ||
    joined.includes("timeout") ||
    joined.includes("no capacity available") ||
    joined.includes("resource exhausted") ||
    joined.includes("gateway_restart") ||
    joined.includes("gateway_connection")
  );
}

async function runLevel(params: {
  omegaWork: {
    execute: (callId: string, input: Record<string, unknown>) => Promise<unknown>;
  };
  sessionKey: string;
  spec: LevelSpec;
}): Promise<LevelRunResult> {
  const startedAt = Date.now();
  let attempts = 0;
  let retriedForEnvironmentalFailure = false;
  while (true) {
    attempts += 1;
    let details: Record<string, unknown> | undefined;
    try {
      const result = (await params.omegaWork.execute(
        `omega-ladder-${params.spec.level}-${attempts}`,
        {
          task: params.spec.task,
          sessionKey: params.sessionKey,
          timeoutSeconds: params.spec.timeoutSeconds,
          expectsJson: true,
          expectedKeys: ["status", "summary"],
          expectedPaths: params.spec.expectedPaths,
        },
      )) as { details?: Record<string, unknown> };
      details = result.details;
    } catch (error) {
      details = {
        status: "error",
        errorKind: "tool_throw",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const externalValidation = await params.spec.validate(process.cwd()).catch((error) => ({
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }));

    const levelResult: LevelRunResult = {
      level: params.spec.level,
      title: params.spec.title,
      attempts,
      durationMs: Date.now() - startedAt,
      route: typeof details?.route === "string" ? details.route : undefined,
      status: typeof details?.status === "string" ? details.status : undefined,
      errorKind: typeof details?.errorKind === "string" ? details.errorKind : undefined,
      observedChangedFiles: Array.isArray(details?.observedChangedFiles)
        ? details?.observedChangedFiles.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          )
        : undefined,
      wakeAction: details?.wakeAction,
      runtimeObserver: details?.runtimeObserver,
      cognitiveKernel: details?.cognitiveKernel,
      externalValidation,
      retriedForEnvironmentalFailure,
    };

    if (!externalValidation.ok && attempts < 2 && isEnvironmentalFailure(details)) {
      retriedForEnvironmentalFailure = true;
      await delay(ENVIRONMENTAL_RETRY_DELAY_MS);
      continue;
    }

    return levelResult;
  }
}

async function writeArtifact(workspaceRoot: string, artifact: LadderArtifact) {
  const artifactDir = path.join(workspaceRoot, ".openskynet", "skynet-experiments");
  await ensureDir(artifactDir);
  const suffix = artifact.sessionKey.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 96) || "main";
  await fs.writeFile(
    path.join(artifactDir, `${ARTIFACT_NAME_PREFIX}-${suffix}.json`),
    JSON.stringify(artifact, null, 2),
    "utf-8",
  );
}

async function main() {
  const workspaceRoot = process.cwd();
  const sandboxRoot = path.join(
    workspaceRoot,
    ".openskynet",
    "skynet-experiments",
    SANDBOX_DIRNAME,
  );
  const runNonce = Date.now().toString(36);
  const baseSessionKey = `${SESSION_KEY_PREFIX}-${runNonce}`;
  const driverSessionKey = `agent:openskynet:omega-ladder-driver:${runNonce}`;
  const selectedLevels = parseSelectedLevels();
  const freshPerLevel = process.env.OPENSKYNET_OMEGA_LADDER_FRESH_PER_LEVEL === "1";
  await resetSandboxFiles(sandboxRoot);
  const createOpenClawTools = await loadCreateOpenClawTools(workspaceRoot);

  const omegaWork = createOpenClawTools({
    agentSessionKey: driverSessionKey,
    agentChannel: "discord",
    workspaceDir: workspaceRoot,
  }).find((tool) => tool.name === "omega_work");

  if (!omegaWork) {
    throw new Error("missing omega_work");
  }

  const levelSpecs = buildLevelSpecs(workspaceRoot, sandboxRoot).filter((spec) =>
    selectedLevels ? selectedLevels.includes(spec.level) : true,
  );
  const levelResults: LevelRunResult[] = [];
  for (const spec of levelSpecs) {
    process.stderr.write(`[omega ladder] level ${spec.level}/10 start: ${spec.title}\n`);
    const sessionKey = freshPerLevel ? `${baseSessionKey}-L${spec.level}` : baseSessionKey;
    const result = await runLevel({
      omegaWork,
      sessionKey,
      spec,
    });
    levelResults.push(result);
    process.stderr.write(
      `[omega ladder] level ${spec.level}/10 done: ok=${String(result.externalValidation.ok)} route=${result.route ?? "unknown"} status=${result.status ?? "unknown"} detail=${result.externalValidation.detail}\n`,
    );
    if (spec.level < levelSpecs.length) {
      await delay(BETWEEN_LEVEL_DELAY_MS);
    }
  }

  const passedLevels = levelResults.filter((entry) => entry.externalValidation.ok).length;
  const successRate = levelResults.length > 0 ? passedLevels / levelResults.length : 0;
  const longRunVerdict: LadderArtifact["longRunVerdict"] =
    successRate >= 0.8 ? "pass" : successRate >= 0.5 ? "mixed" : "fail";

  const artifact: LadderArtifact = {
    sessionKey: freshPerLevel ? `${baseSessionKey}-fresh` : baseSessionKey,
    updatedAt: Date.now(),
    workspaceRoot,
    sandboxRoot,
    modelIntent: "empirical_omega_ladder",
    passedLevels,
    totalLevels: levelResults.length,
    successRate,
    longRunVerdict,
    levelResults,
  };
  await writeArtifact(workspaceRoot, artifact);
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}

await main();
