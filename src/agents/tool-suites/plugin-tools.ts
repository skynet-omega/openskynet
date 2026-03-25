import { resolvePluginTools } from "../../plugins/tools.js";
import { resolveSessionAgentId } from "../agent-scope.js";
import type { CreateOpenClawToolsOptions, OpenClawToolSuite } from "./types.js";

export function createPluginToolSuite(options: {
  options?: CreateOpenClawToolsOptions;
  workspaceDir: string;
  existingToolNames: Set<string>;
}): OpenClawToolSuite {
  const opts = options.options;
  const pluginTools = resolvePluginTools({
    context: {
      config: opts?.config,
      workspaceDir: options.workspaceDir,
      agentDir: opts?.agentDir,
      agentId: resolveSessionAgentId({
        sessionKey: opts?.agentSessionKey,
        config: opts?.config,
      }),
      sessionKey: opts?.agentSessionKey,
      sessionId: opts?.sessionId,
      messageChannel: opts?.agentChannel,
      agentAccountId: opts?.agentAccountId,
      requesterSenderId: opts?.requesterSenderId ?? undefined,
      senderIsOwner: opts?.senderIsOwner ?? undefined,
      sandboxed: opts?.sandboxed,
    },
    existingToolNames: options.existingToolNames,
    toolAllowlist: opts?.pluginToolAllowlist,
  });
  return {
    kind: "plugin",
    entries: pluginTools.map((tool, index) => ({
      tool,
      classification: "substrate",
      order: 1_000 + index,
    })),
  };
}
