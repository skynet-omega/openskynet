import { createOpenClawTools } from "../src/agents/openclaw-tools.js";
import { recordOmegaSessionOutcome } from "../src/omega/session-context.js";

function getOmegaWorkTool() {
  const tool = createOpenClawTools({
    agentSessionKey: "agent:openskynet:frontal-cache-probe",
    requesterAgentIdOverride: "openskynet",
    agentChannel: "discord",
    workspaceDir: "/home/daroch/openskynet",
  }).find((candidate) => candidate.name === "omega_work");
  if (!tool) {
    throw new Error("missing omega_work");
  }
  return tool;
}

async function main() {
  const tool = getOmegaWorkTool();
  const sessionKey = `agent:openskynet:frontal-cache-probe:${Date.now().toString(36)}`;
  const task =
    'Return exactly one JSON object and nothing else: {"status":"ok","summary":"cache probe ok"}';

  await recordOmegaSessionOutcome({
    workspaceRoot: "/home/daroch/openskynet",
    sessionKey,
    task,
    validation: {
      expectsJson: true,
      expectedKeys: ["status", "summary"],
      expectedPaths: [],
    },
    outcome: {
      status: "ok",
      structuredOk: true,
    },
    reply: '{"status":"ok","summary":"cache probe ok"}',
  });

  const cached = await tool.execute("frontal-cached", {
    task,
    sessionKey,
    timeoutSeconds: 90,
    expectsJson: true,
    expectedKeys: ["status", "summary"],
  });

  console.log(
    JSON.stringify(
      {
        cached: cached.details,
      },
      null,
      2,
    ),
  );
}

await main();
