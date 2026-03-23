import type { OpenSkynetConfig } from "../config/config.js";
import { normalizeProviderId } from "./model-selection.js";

export type ConfiguredProviderModelEntry = {
  provider: string;
  id: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
};

export function listConfiguredProviderModels(
  cfg: OpenSkynetConfig,
): ConfiguredProviderModelEntry[] {
  const providers = cfg.models?.providers;
  if (!providers || typeof providers !== "object") {
    return [];
  }

  const seen = new Set<string>();
  const out: ConfiguredProviderModelEntry[] = [];

  for (const [providerRaw, providerValue] of Object.entries(providers)) {
    if (!providerValue || typeof providerValue !== "object") {
      continue;
    }
    const provider = normalizeProviderId(providerRaw);
    if (!provider) {
      continue;
    }
    const configuredModels = (providerValue as { models?: unknown }).models;
    if (!Array.isArray(configuredModels)) {
      continue;
    }

    for (const configuredModel of configuredModels) {
      if (!configuredModel || typeof configuredModel !== "object") {
        continue;
      }
      const idRaw = (configuredModel as { id?: unknown }).id;
      if (typeof idRaw !== "string") {
        continue;
      }
      const id = idRaw.trim();
      if (!id) {
        continue;
      }
      const key = `${provider}/${id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const nameRaw = (configuredModel as { name?: unknown }).name;
      const contextWindowRaw = (configuredModel as { contextWindow?: unknown }).contextWindow;
      const reasoningRaw = (configuredModel as { reasoning?: unknown }).reasoning;
      out.push({
        provider,
        id,
        name: typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : undefined,
        contextWindow:
          typeof contextWindowRaw === "number" && contextWindowRaw > 0
            ? contextWindowRaw
            : undefined,
        reasoning: typeof reasoningRaw === "boolean" ? reasoningRaw : undefined,
      });
    }
  }

  return out;
}
