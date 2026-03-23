import { getChannelPluginCatalogEntry } from "../channels/plugins/catalog.js";
import { normalizeChatChannelId } from "../channels/registry.js";
import type { OpenClawConfig } from "../config/config.js";

export function setPluginEnabledInConfig(
  config: OpenClawConfig,
  pluginId: string,
  enabled: boolean,
): OpenClawConfig {
  const builtInChannelId = normalizeChatChannelId(pluginId);
  const resolvedId = builtInChannelId ?? pluginId;

  let next = config;

  // Only add to plugins.entries if it's not a core channel, OR if it's a core
  // channel that also has a plugin entry (like whatsapp/irc).
  const isPlugin = !builtInChannelId || getChannelPluginCatalogEntry(builtInChannelId);
  if (isPlugin) {
    next = {
      ...config,
      plugins: {
        ...config.plugins,
        entries: {
          ...config.plugins?.entries,
          [resolvedId]: {
            ...(config.plugins?.entries?.[resolvedId] as object | undefined),
            enabled,
          },
        },
      },
    };
  }

  if (!builtInChannelId) {
    return next;
  }

  const channels = config.channels as Record<string, unknown> | undefined;
  const existing = channels?.[builtInChannelId];
  const existingRecord =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};

  return {
    ...next,
    channels: {
      ...config.channels,
      [builtInChannelId]: {
        ...existingRecord,
        enabled,
      },
    },
  };
}
