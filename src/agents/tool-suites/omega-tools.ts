import { createOmegaDelegateTool } from "../tools/omega-delegate-tool.js";
import { createOmegaWorkTool } from "../tools/omega-work-tool.js";
import type { CreateOpenClawToolsOptions, OpenClawToolSuite } from "./types.js";

export function createOmegaToolSuite(options: {
  options?: CreateOpenClawToolsOptions;
  workspaceDir: string;
  spawnWorkspaceDir: string;
}): OpenClawToolSuite {
  const opts = options.options;
  return {
    kind: "omega",
    entries: [
      {
        tool: createOmegaWorkTool({
          agentSessionKey: opts?.agentSessionKey,
          agentChannel: opts?.agentChannel,
          sandboxed: opts?.sandboxed,
          config: opts?.config,
          workspaceDir: options.workspaceDir,
          agentAccountId: opts?.agentAccountId,
          agentTo: opts?.agentTo,
          agentThreadId: opts?.agentThreadId,
          agentGroupId: opts?.agentGroupId,
          agentGroupChannel: opts?.agentGroupChannel,
          agentGroupSpace: opts?.agentGroupSpace,
          requesterAgentIdOverride: opts?.requesterAgentIdOverride,
          spawnWorkspaceDir: options.spawnWorkspaceDir,
        }),
        classification: "runtime",
        order: 70,
      },
      {
        tool: createOmegaDelegateTool({
          agentSessionKey: opts?.agentSessionKey,
          agentChannel: opts?.agentChannel,
          sandboxed: opts?.sandboxed,
          config: opts?.config,
          workspaceDir: options.workspaceDir,
        }),
        classification: "runtime",
        order: 80,
      },
    ],
  };
}
