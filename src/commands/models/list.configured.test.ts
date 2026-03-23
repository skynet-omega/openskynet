import { describe, expect, it } from "vitest";
import type { OpenSkynetConfig } from "../../config/config.js";
import { resolveConfiguredEntries } from "./list.configured.js";

describe("resolveConfiguredEntries", () => {
  it("includes configured provider models from models.providers.*.models", () => {
    const cfg = {
      agents: {
        defaults: {
          model: { primary: "openai-codex/gpt-5.4" },
        },
      },
      models: {
        providers: {
          ollama: {
            models: [
              { id: "kimi-k2.5:cloud", name: "kimi-k2.5:cloud" },
              { id: "qwen3:8b", name: "qwen3:8b" },
            ],
          },
        },
      },
    } as OpenSkynetConfig;

    const { entries } = resolveConfiguredEntries(cfg);
    const keys = entries.map((entry) => entry.key);

    expect(keys).toContain("openai-codex/gpt-5.4");
    expect(keys).toContain("ollama/kimi-k2.5:cloud");
    expect(keys).toContain("ollama/qwen3:8b");
  });
});
