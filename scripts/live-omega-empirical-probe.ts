import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { createOpenClawTools } from "../src/agents/openclaw-tools.js";
import { callGateway } from "../src/gateway/call.js";
import { loadOmegaEmpiricalMetrics, loadOmegaSelfTimeKernel } from "../src/omega/index.js";

type ToolResult = {
  details?: Record<string, unknown>;
};

type ProbeSummary = {
  analysis: {
    parent: Record<string, unknown>;
    omega: Record<string, unknown>;
  };
  code: {
    parent: Record<string, unknown>;
    omega: Record<string, unknown>;
  };
  roots: {
    parent: string;
    omega: string;
  };
  empirical: {
    omegaMetrics: Record<string, unknown>;
    omegaKernel: {
      activeGoalId: string | null;
      activeGoalTask: string | null;
      openGoalCount: number;
      failureStreak: number;
    };
  };
};

function getTool(
  workspaceDir: string,
  name: "sessions_send" | "sessions_spawn" | "omega_work",
) {
  const tool = createOpenClawTools({
    agentSessionKey: "agent:openskynet:probe-driver",
    requesterAgentIdOverride: "openskynet",
    agentChannel: "discord",
    workspaceDir,
  }).find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`missing tool: ${name}`);
  }
  return tool;
}

function requireChildSessionKey(result: ToolResult, label: string): string {
  const childSessionKey =
    typeof result.details?.childSessionKey === "string" ? result.details.childSessionKey : undefined;
  if (!childSessionKey) {
    throw new Error(`${label} did not return childSessionKey`);
  }
  return childSessionKey;
}

async function seedAnalysisSession(params: {
  spawnTool: ReturnType<typeof getTool>;
  callId: string;
  nonce: string;
  timeoutSeconds: number;
}): Promise<string> {
  const seed = (await params.spawnTool.execute(params.callId, {
    task: [
      `Seed interno ${params.nonce}.`,
      'Responde SOLO JSON exacto con {"status":"ready"}.',
    ].join(" "),
    mode: "run",
    cleanup: "keep",
    sandbox: "inherit",
    runTimeoutSeconds: params.timeoutSeconds,
    expectsJson: true,
    expectedKeys: ["status"],
  })) as ToolResult;
  const childSessionKey = requireChildSessionKey(seed, params.callId);
  const runId = typeof seed.details?.runId === "string" ? seed.details.runId : undefined;
  if (runId) {
    await waitForRun(runId, params.timeoutSeconds * 1000);
  }
  return childSessionKey;
}

async function prepareFixture(root: string) {
  const probeDir = path.join(root, "live_probe");
  await fs.mkdir(probeDir, { recursive: true });
  await fs.writeFile(path.join(probeDir, "__init__.py"), "", "utf-8");
  await fs.writeFile(
    path.join(probeDir, "range_tools.py"),
    [
      "def clamp(value, lower=0, upper=10):",
      "    if value < lower:",
      "        return upper",
      "    if value > upper:",
      "        return lower",
      "    return value",
      "",
    ].join("\n"),
    "utf-8",
  );
  await fs.writeFile(
    path.join(probeDir, "test_range_tools.py"),
    [
      "from live_probe.range_tools import clamp",
      "",
      "",
      "def test_clamp_low():",
      "    assert clamp(-3) == 0",
      "",
      "",
      "def test_clamp_high():",
      "    assert clamp(12) == 10",
      "",
      "",
      "def test_clamp_mid():",
      "    assert clamp(4) == 4",
      "",
    ].join("\n"),
    "utf-8",
  );
}

function runPytest(root: string) {
  const result = spawnSync("python3", ["-m", "pytest", "-q", "live_probe/test_range_tools.py"], {
    cwd: root,
    encoding: "utf-8",
    env: {
      ...process.env,
      PYTHONPATH: root,
    },
  });
  return {
    ok: result.status === 0,
    exitCode: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function tryParseJson(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function waitForRun(runId: string, timeoutMs: number) {
  return await callGateway<{ status?: string; error?: string }>({
    method: "agent.wait",
    params: {
      runId,
      timeoutMs,
    },
    timeoutMs: timeoutMs + 5_000,
  });
}

async function main() {
  const parentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-live-parent-"));
  const omegaRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openskynet-live-omega-"));
  await prepareFixture(parentRoot);
  await prepareFixture(omegaRoot);

  const parentSend = getTool(parentRoot, "sessions_send");
  const parentSpawn = getTool(parentRoot, "sessions_spawn");
  const omegaWork = getTool(omegaRoot, "omega_work");
  const omegaSpawn = getTool(omegaRoot, "sessions_spawn");

  const probeNonce = Date.now().toString(36);
  const parentAnalysisSession = await seedAnalysisSession({
    spawnTool: parentSpawn,
    callId: "probe-analysis-parent-session",
    nonce: `parent-${probeNonce}`,
    timeoutSeconds: 60,
  });
  const omegaAnalysisSession = await seedAnalysisSession({
    spawnTool: omegaSpawn,
    callId: "probe-analysis-omega-session",
    nonce: `omega-${probeNonce}`,
    timeoutSeconds: 60,
  });

  const analysisTask =
    "Lee live_probe/range_tools.py y responde SOLO JSON con keys status, summary y bug.";

  const parentAnalysis = (await parentSend.execute("probe-analysis-parent", {
    sessionKey: parentAnalysisSession,
    message: analysisTask,
    timeoutSeconds: 90,
  })) as ToolResult;

  const omegaAnalysis = (await omegaWork.execute("probe-analysis-omega", {
    task: analysisTask,
    sessionKey: omegaAnalysisSession,
    timeoutSeconds: 90,
    expectsJson: true,
    expectedKeys: ["status", "summary", "bug"],
  })) as ToolResult;

  const codeTask = [
    "Arregla live_probe/range_tools.py para que",
    "`python3 -m pytest -q live_probe/test_range_tools.py` pase.",
    "Mantén el cambio mínimo.",
    'Responde SOLO JSON con keys "status" y "summary".',
  ].join(" ");

  const parentCode = (await parentSpawn.execute("probe-code-parent", {
    task: codeTask,
    runTimeoutSeconds: 180,
    mode: "run",
    sandbox: "inherit",
  })) as ToolResult;

  const parentRunId =
    typeof parentCode.details?.runId === "string" ? parentCode.details.runId : undefined;
  const parentWait =
    typeof parentRunId === "string" ? await waitForRun(parentRunId, 180_000) : { status: "missing" };
  const parentPytest = runPytest(parentRoot);
  const parentRangeTools = await fs.readFile(path.join(parentRoot, "live_probe", "range_tools.py"), "utf-8");

  const omegaCode = (await omegaWork.execute("probe-code-omega", {
    task: codeTask,
    timeoutSeconds: 180,
    expectsJson: true,
    expectedKeys: ["status", "summary"],
    expectedPaths: ["live_probe/range_tools.py"],
  })) as ToolResult;

  const omegaPytest = runPytest(omegaRoot);
  const omegaRangeTools = await fs.readFile(path.join(omegaRoot, "live_probe", "range_tools.py"), "utf-8");
  const omegaMetrics = await loadOmegaEmpiricalMetrics({
    workspaceRoot: omegaRoot,
  });
  const omegaKernel = await loadOmegaSelfTimeKernel({
    workspaceRoot: omegaRoot,
    sessionKey: "main",
  });
  const activeGoal = omegaKernel?.goals.find((goal) => goal.id === omegaKernel.activeGoalId);

  const summary: ProbeSummary = {
    analysis: {
      parent: {
        ...(parentAnalysis.details ?? {}),
        parsedReply: tryParseJson(parentAnalysis.details?.reply),
      },
      omega: {
        ...(omegaAnalysis.details ?? {}),
        parsedReply: tryParseJson(omegaAnalysis.details?.reply),
      },
    },
    code: {
      parent: {
        ...(parentCode.details ?? {}),
        wait: parentWait,
        pytest: parentPytest,
        rangeTools: parentRangeTools,
      },
      omega: {
        ...(omegaCode.details ?? {}),
        pytest: omegaPytest,
        rangeTools: omegaRangeTools,
      },
    },
    roots: {
      parent: parentRoot,
      omega: omegaRoot,
    },
    empirical: {
      omegaMetrics: {
        validation: omegaMetrics.validation,
        routing: omegaMetrics.routing,
        background: omegaMetrics.background,
      },
      omegaKernel: {
        activeGoalId: omegaKernel?.activeGoalId ?? null,
        activeGoalTask: activeGoal?.task ?? null,
        openGoalCount: omegaKernel?.tension.openGoalCount ?? 0,
        failureStreak: omegaKernel?.tension.failureStreak ?? 0,
      },
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
