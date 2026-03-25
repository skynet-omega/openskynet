import type { OpenClawConfig } from "../../config/config.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { SandboxFsBridge } from "../sandbox/fs-bridge.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import type { ToolFsPolicy } from "../tool-fs-policy.js";
import type { AnyAgentTool } from "../tools/common.js";

export type CreateOpenClawToolsOptions = {
  sandboxBrowserBridgeUrl?: string;
  allowHostBrowserControl?: boolean;
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentDir?: string;
  sandboxRoot?: string;
  sandboxFsBridge?: SandboxFsBridge;
  fsPolicy?: ToolFsPolicy;
  sandboxed?: boolean;
  config?: OpenClawConfig;
  pluginToolAllowlist?: string[];
  currentChannelId?: string;
  currentThreadTs?: string;
  currentMessageId?: string | number;
  replyToMode?: "off" | "first" | "all";
  hasRepliedRef?: { value: boolean };
  modelHasVision?: boolean;
  allowMediaInvokeCommands?: boolean;
  requesterAgentIdOverride?: string;
  requireExplicitMessageTarget?: boolean;
  disableMessageTool?: boolean;
  requesterSenderId?: string | null;
  senderIsOwner?: boolean;
  sessionId?: string;
  spawnWorkspaceDir?: string;
  onYield?: (message: string) => Promise<void> | void;
} & SpawnedToolContext;

export type OpenClawToolClassification = "substrate" | "runtime" | "experimental";

export type OpenClawToolSuiteKind = "core" | "session" | "omega" | "plugin";

export type OpenClawToolSuiteEntry = {
  tool: AnyAgentTool;
  classification: OpenClawToolClassification;
  order: number;
};

export type OpenClawToolSuite = {
  kind: OpenClawToolSuiteKind;
  entries: OpenClawToolSuiteEntry[];
};

export function flattenOpenClawToolSuites(suites: OpenClawToolSuite[]): AnyAgentTool[] {
  return suites
    .flatMap((suite) => suite.entries)
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.tool);
}
