import { getActiveRuntimeWebToolsMetadata } from "../../secrets/runtime.js";
import { createBrowserTool } from "../tools/browser-tool.js";
import { createCanvasTool } from "../tools/canvas-tool.js";
import { createCronTool } from "../tools/cron-tool.js";
import { createGatewayTool } from "../tools/gateway-tool.js";
import { createImageTool } from "../tools/image-tool.js";
import { createMessageTool } from "../tools/message-tool.js";
import { createNodesTool } from "../tools/nodes-tool.js";
import { createPdfTool } from "../tools/pdf-tool.js";
import { createTtsTool } from "../tools/tts-tool.js";
import { createWebFetchTool, createWebSearchTool } from "../tools/web-tools.js";
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

export function createCoreToolSuite(options: {
  options?: CreateOpenClawToolsOptions;
  workspaceDir: string;
}): OpenClawToolSuite {
  const opts = options.options;
  const runtimeWebTools = getActiveRuntimeWebToolsMetadata();
  const sandbox =
    opts?.sandboxRoot && opts?.sandboxFsBridge
      ? { root: opts.sandboxRoot, bridge: opts.sandboxFsBridge }
      : undefined;
  const imageTool = opts?.agentDir?.trim()
    ? createImageTool({
        config: opts?.config,
        agentDir: opts.agentDir,
        workspaceDir: options.workspaceDir,
        sandbox,
        fsPolicy: opts?.fsPolicy,
        modelHasVision: opts?.modelHasVision,
      })
    : null;
  const pdfTool = opts?.agentDir?.trim()
    ? createPdfTool({
        config: opts?.config,
        agentDir: opts.agentDir,
        workspaceDir: options.workspaceDir,
        sandbox,
        fsPolicy: opts?.fsPolicy,
      })
    : null;
  const webSearchTool = createWebSearchTool({
    config: opts?.config,
    sandboxed: opts?.sandboxed,
    runtimeWebSearch: runtimeWebTools?.search,
  });
  const webFetchTool = createWebFetchTool({
    config: opts?.config,
    sandboxed: opts?.sandboxed,
    runtimeFirecrawl: runtimeWebTools?.fetch.firecrawl,
  });
  const messageTool = opts?.disableMessageTool
    ? null
    : createMessageTool({
        agentAccountId: opts?.agentAccountId,
        agentSessionKey: opts?.agentSessionKey,
        config: opts?.config,
        currentChannelId: opts?.currentChannelId,
        currentChannelProvider: opts?.agentChannel,
        currentThreadTs: opts?.currentThreadTs,
        currentMessageId: opts?.currentMessageId,
        replyToMode: opts?.replyToMode,
        hasRepliedRef: opts?.hasRepliedRef,
        sandboxRoot: opts?.sandboxRoot,
        requireExplicitTarget: opts?.requireExplicitMessageTarget,
        requesterSenderId: opts?.requesterSenderId ?? undefined,
      });

  const entries: OpenClawToolSuiteEntry[] = [];
  pushEntry(
    entries,
    createBrowserTool({
      sandboxBridgeUrl: opts?.sandboxBrowserBridgeUrl,
      allowHostControl: opts?.allowHostBrowserControl,
      agentSessionKey: opts?.agentSessionKey,
    }),
    0,
  );
  pushEntry(entries, createCanvasTool({ config: opts?.config }), 10);
  pushEntry(
    entries,
    createNodesTool({
      agentSessionKey: opts?.agentSessionKey,
      agentChannel: opts?.agentChannel,
      agentAccountId: opts?.agentAccountId,
      currentChannelId: opts?.currentChannelId,
      currentThreadTs: opts?.currentThreadTs,
      config: opts?.config,
      modelHasVision: opts?.modelHasVision,
      allowMediaInvokeCommands: opts?.allowMediaInvokeCommands,
    }),
    20,
  );
  pushEntry(entries, createCronTool({ agentSessionKey: opts?.agentSessionKey }), 30);
  pushEntry(entries, messageTool, 40);
  pushEntry(
    entries,
    createTtsTool({
      agentChannel: opts?.agentChannel,
      config: opts?.config,
    }),
    50,
  );
  pushEntry(
    entries,
    createGatewayTool({
      agentSessionKey: opts?.agentSessionKey,
      config: opts?.config,
    }),
    60,
  );
  pushEntry(entries, webSearchTool, 170);
  pushEntry(entries, webFetchTool, 180);
  pushEntry(entries, imageTool, 190);
  pushEntry(entries, pdfTool, 200);

  return {
    kind: "core",
    entries,
  };
}
