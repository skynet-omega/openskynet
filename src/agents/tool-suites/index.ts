import { resolveWorkspaceRoot } from "../workspace-dir.js";
import { createCoreToolSuite } from "./core-tools.js";
import { createOmegaToolSuite } from "./omega-tools.js";
import { createPluginToolSuite } from "./plugin-tools.js";
import { createSessionToolSuite } from "./session-tools.js";
import {
  flattenOpenClawToolSuites,
  type CreateOpenClawToolsOptions,
  type OpenClawToolSuite,
} from "./types.js";

export type {
  CreateOpenClawToolsOptions,
  OpenClawToolClassification,
  OpenClawToolSuite,
  OpenClawToolSuiteEntry,
  OpenClawToolSuiteKind,
} from "./types.js";

export { flattenOpenClawToolSuites } from "./types.js";

export function createOpenClawToolSuites(
  options?: CreateOpenClawToolsOptions,
): OpenClawToolSuite[] {
  const workspaceDir = resolveWorkspaceRoot(options?.workspaceDir);
  const spawnWorkspaceDir = resolveWorkspaceRoot(
    options?.spawnWorkspaceDir ?? options?.workspaceDir,
  );
  const coreSuite = createCoreToolSuite({
    options,
    workspaceDir,
  });
  const sessionSuite = createSessionToolSuite({
    options,
    workspaceDir,
    spawnWorkspaceDir,
  });
  const omegaSuite = createOmegaToolSuite({
    options,
    workspaceDir,
    spawnWorkspaceDir,
  });
  const pluginSuite = createPluginToolSuite({
    options,
    workspaceDir,
    existingToolNames: new Set(
      flattenOpenClawToolSuites([coreSuite, sessionSuite, omegaSuite]).map((tool) => tool.name),
    ),
  });
  return [coreSuite, sessionSuite, omegaSuite, pluginSuite];
}
