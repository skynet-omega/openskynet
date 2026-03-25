import type { OpenClawConfig } from "../config/config.js";
import { resolvePrimaryModel } from "./model-default.js";

export const OPENAI_CODEX_DEFAULT_MODEL = "openai-codex/gpt-5.4";

function shouldSetOpenAICodexModel(current?: string): boolean {
  if (!current) {
    return true;
  }
  if (current === OPENAI_CODEX_DEFAULT_MODEL) {
    return false;
  }
  return current.startsWith("openai/");
}

export function applyOpenAICodexModelDefault(cfg: OpenClawConfig): {
  next: OpenClawConfig;
  changed: boolean;
} {
  const current = resolvePrimaryModel(cfg.agents?.defaults?.model)?.trim();
  if (!shouldSetOpenAICodexModel(current)) {
    return { next: cfg, changed: false };
  }
  return {
    next: {
      ...cfg,
      agents: {
        ...cfg.agents,
        defaults: {
          ...cfg.agents?.defaults,
          model:
            cfg.agents?.defaults?.model && typeof cfg.agents.defaults.model === "object"
              ? {
                  ...cfg.agents.defaults.model,
                  primary: OPENAI_CODEX_DEFAULT_MODEL,
                }
              : { primary: OPENAI_CODEX_DEFAULT_MODEL },
        },
      },
    },
    changed: true,
  };
}
