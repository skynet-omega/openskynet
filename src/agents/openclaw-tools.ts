import {
  createOpenClawToolSuites,
  flattenOpenClawToolSuites,
  type CreateOpenClawToolsOptions,
} from "./tool-suites/index.js";
import type { AnyAgentTool } from "./tools/common.js";

export type { CreateOpenClawToolsOptions } from "./tool-suites/index.js";
export { createOpenClawToolSuites } from "./tool-suites/index.js";

export function createOpenClawTools(options?: CreateOpenClawToolsOptions): AnyAgentTool[] {
  return flattenOpenClawToolSuites(createOpenClawToolSuites(options));
}
