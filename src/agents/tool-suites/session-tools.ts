import { createAgentsListTool } from "../tools/agents-list-tool.js";
import { createSessionStatusTool } from "../tools/session-status-tool.js";
import { createSessionsHistoryTool } from "../tools/sessions-history-tool.js";
import { createSessionsListTool } from "../tools/sessions-list-tool.js";
import { createSessionsSendTool } from "../tools/sessions-send-tool.js";
import { createSessionsSpawnTool } from "../tools/sessions-spawn-tool.js";
import { createSessionsYieldTool } from "../tools/sessions-yield-tool.js";
import { createSubagentsTool } from "../tools/subagents-tool.js";
import type {
  CreateOpenClawToolsOptions,
  OpenClawToolSuite,
  OpenClawToolSuiteEntry,
} from "./types.js";

function pushEntry(
  entries: OpenClawToolSuiteEntry[],
  tool: OpenClawToolSuiteEntry["tool"] | null,
  order: number,
) {
  if (!tool) {
    return;
  }
  entries.push({
    tool,
    classification: "substrate",
    order,
  });
}

export function createSessionToolSuite(options: {
  options?: CreateOpenClawToolsOptions;
  workspaceDir: string;
  spawnWorkspaceDir: string;
}): OpenClawToolSuite {
  const opts = options.options;
  const entries: OpenClawToolSuiteEntry[] = [];
  pushEntry(
    entries,
    createAgentsListTool({
      agentSessionKey: opts?.agentSessionKey,
      requesterAgentIdOverride: opts?.requesterAgentIdOverride,
    }),
    90,
  );
  pushEntry(
    entries,
    createSessionsListTool({
      agentSessionKey: opts?.agentSessionKey,
      sandboxed: opts?.sandboxed,
      config: opts?.config,
    }),
    100,
  );
  pushEntry(
    entries,
    createSessionsHistoryTool({
      agentSessionKey: opts?.agentSessionKey,
      sandboxed: opts?.sandboxed,
      config: opts?.config,
    }),
    110,
  );
  pushEntry(
    entries,
    createSessionsSendTool({
      agentSessionKey: opts?.agentSessionKey,
      agentChannel: opts?.agentChannel,
      sandboxed: opts?.sandboxed,
      config: opts?.config,
      workspaceDir: options.workspaceDir,
    }),
    120,
  );
  pushEntry(
    entries,
    createSessionsYieldTool({
      sessionId: opts?.sessionId,
      onYield: opts?.onYield,
    }),
    130,
  );
  pushEntry(
    entries,
    createSessionsSpawnTool({
      agentSessionKey: opts?.agentSessionKey,
      agentChannel: opts?.agentChannel,
      agentAccountId: opts?.agentAccountId,
      agentTo: opts?.agentTo,
      agentThreadId: opts?.agentThreadId,
      agentGroupId: opts?.agentGroupId,
      agentGroupChannel: opts?.agentGroupChannel,
      agentGroupSpace: opts?.agentGroupSpace,
      sandboxed: opts?.sandboxed,
      requesterAgentIdOverride: opts?.requesterAgentIdOverride,
      workspaceDir: options.spawnWorkspaceDir,
    }),
    140,
  );
  pushEntry(entries, createSubagentsTool({ agentSessionKey: opts?.agentSessionKey }), 150);
  pushEntry(
    entries,
    createSessionStatusTool({
      agentSessionKey: opts?.agentSessionKey,
      config: opts?.config,
      sandboxed: opts?.sandboxed,
    }),
    160,
  );
  return {
    kind: "session",
    entries,
  };
}
