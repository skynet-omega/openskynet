import type { OpenClawConfig } from "../../config/config.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
import { createSessionsSendTool } from "./sessions-send-tool.js";

export function createOmegaDelegateTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  sandboxed?: boolean;
  config?: OpenClawConfig;
  workspaceDir?: string;
}): AnyAgentTool {
  const baseTool = createSessionsSendTool({
    ...opts,
    deliveryMode: "none",
    executionRoute: "omega_delegate",
  });

  return {
    ...baseTool,
    label: "Omega Delegate",
    name: "omega_delegate",
    description:
      "Run a validated inter-session task without announce/ping-pong delivery. Use expectsJson, expectedKeys, and expectedPaths to require structured output and real disk changes.",
  };
}
