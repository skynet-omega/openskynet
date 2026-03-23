import { Type } from "@sinclair/typebox";
import { FrontalLobeManager } from "../../omega/frontal/frontal-lobe.js";
import { resolveWorkspaceRoot } from "../workspace-dir.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

export const createOmegaFrontalTool = (options?: { workspaceDir?: string }): AnyAgentTool => {
  const workspaceDir = resolveWorkspaceRoot(options?.workspaceDir);
  const manager = new FrontalLobeManager(workspaceDir);

  return {
    label: "Omega Frontal Lobe",
    name: "update_frontal_lobe",
    description:
      "Updates the persistent executive state (Frontal Lobe) of Omega. Use this to maintain long-term intent, track current focus, and store cognitive residues between thought cycles.",
    parameters: Type.Object({
      macroIntent: Type.Optional(
        Type.String({ description: "The high-level long-term goal Omega is pursuing." }),
      ),
      currentFocus: Type.Optional(
        Type.String({
          description: "What Omega is specifically analyzing or doing in this micro-cycle.",
        }),
      ),
      lastDiscovery: Type.Optional(
        Type.String({ description: "The latest relevant finding or confirmed fact." }),
      ),
      cognitiveResidue: Type.Optional(
        Type.String({
          description: "Unresolved intuitions, doubts, or 'threads' to pick up in the next cycle.",
        }),
      ),
    }),
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, any>;
      await manager.load();
      await manager.save({
        macroIntent: readStringParam(params, "macroIntent"),
        currentFocus: readStringParam(params, "currentFocus"),
        lastDiscovery: readStringParam(params, "lastDiscovery"),
        cognitiveResidue: readStringParam(params, "cognitiveResidue"),
      });
      const newState = manager.getState();

      return jsonResult({
        success: true,
        updatedState: newState,
        observation:
          "Frontal Lobe updated successfully. This intent will persist in the next cycle.",
      });
    },
  };
};
