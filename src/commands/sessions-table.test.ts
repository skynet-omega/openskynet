import { describe, expect, it } from "vitest";
import type { OpenSkynetConfig } from "../config/types.openskynet.js";
import { resolveSessionDisplayDefaults } from "./sessions-table.js";

describe("resolveSessionDisplayDefaults", () => {
  it("prefers the effective default-agent model over raw global defaults", () => {
    const cfg: OpenSkynetConfig = {
      agents: {
        defaults: {
          model: {
            primary: "ollama/gpt-oss-safeguard:20b",
          },
        },
        list: [
          {
            id: "main",
            model: {
              primary: "openai-codex/gpt-5.4",
            },
          },
        ],
      },
    };

    expect(resolveSessionDisplayDefaults(cfg)).toEqual({
      model: "gpt-5.4",
    });
  });

  it("falls back to raw defaults when the default agent has no explicit override", () => {
    const cfg: OpenSkynetConfig = {
      agents: {
        defaults: {
          model: {
            primary: "ollama/gpt-oss-safeguard:20b",
          },
        },
        list: [{ id: "main" }],
      },
    };

    expect(resolveSessionDisplayDefaults(cfg)).toEqual({
      model: "gpt-oss-safeguard:20b",
    });
  });
});
