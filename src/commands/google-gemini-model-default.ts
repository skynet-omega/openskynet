import type { OpenClawConfig } from "../config/config.js";
import { resolvePrimaryModel } from "./model-default.js";

export const GOOGLE_GEMINI_DEFAULT_MODEL = "google/gemini-3.1-pro-preview";

export function applyGoogleGeminiModelDefault(cfg: OpenClawConfig): {
  next: OpenClawConfig;
  changed: boolean;
} {
  const current = resolvePrimaryModel(cfg.agents?.defaults?.model)?.trim();
  if (current === GOOGLE_GEMINI_DEFAULT_MODEL) {
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
                  primary: GOOGLE_GEMINI_DEFAULT_MODEL,
                }
              : { primary: GOOGLE_GEMINI_DEFAULT_MODEL },
        },
      },
    },
    changed: true,
  };
}
