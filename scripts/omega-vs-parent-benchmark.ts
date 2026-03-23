import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  computeOmegaVsParentBenchmarkSummary,
  parseVitestSummary,
} from "./lib/omega-vs-parent-benchmark.js";

type CommandResult = {
  ok: boolean;
  command: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

function runCommand(command: string[]): CommandResult {
  const result = spawnSync(command[0]!, command.slice(1), {
    cwd: process.cwd(),
    encoding: "utf-8",
    env: process.env,
  });

  return {
    ok: result.status === 0,
    command,
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;

  const build = runCommand(["pnpm", "build:strict-smoke"]);
  const omegaSlice = runCommand([
    "pnpm",
    "test",
    "--",
    "src/omega/durable-memory.test.ts",
    "src/omega/world-model.test.ts",
    "src/omega/heartbeat.test.ts",
    "src/omega/session-context.test.ts",
    "src/omega/interaction-model.test.ts",
    "src/omega/empirical-memory.test.ts",
  ]);
  const comparativeSlice = runCommand([
    "pnpm",
    "test",
    "--",
    "src/agents/openclaw-tools.omega-work.test.ts",
    "src/agents/openclaw-tools.omega-vs-parent.test.ts",
    "src/agents/openclaw-tools.omega-vs-parent-recovery.test.ts",
    "src/agents/openclaw-tools.omega-fault-injection.test.ts",
  ]);

  const summary = computeOmegaVsParentBenchmarkSummary({
    buildOk: build.ok,
    omegaSlice: parseVitestSummary(`${omegaSlice.stdout}\n${omegaSlice.stderr}`),
    comparativeSlice: parseVitestSummary(`${comparativeSlice.stdout}\n${comparativeSlice.stderr}`),
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    summary,
    commands: {
      build: {
        ok: build.ok,
        exitCode: build.exitCode,
        command: build.command.join(" "),
      },
      omegaSlice: {
        ok: omegaSlice.ok,
        exitCode: omegaSlice.exitCode,
        command: omegaSlice.command.join(" "),
      },
      comparativeSlice: {
        ok: comparativeSlice.ok,
        exitCode: comparativeSlice.exitCode,
        command: comparativeSlice.command.join(" "),
      },
    },
  };

  if (outPath) {
    const resolved = path.resolve(outPath);
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  }

  console.log(JSON.stringify(payload, null, 2));
  process.exit(summary.targetedSuperiorityValidated ? 0 : 1);
}

await main();
