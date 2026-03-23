import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureEnv } from "../../test-utils/env.js";
import { ensureDevGatewayConfig } from "./dev.js";

const ENV_KEYS = [
  "HOME",
  "OPENSKYNET_HOME",
  "OPENSKYNET_PROFILE",
  "OPENSKYNET_STATE_DIR",
  "OPENSKYNET_CONFIG_PATH",
  "CLAWDBOT_STATE_DIR",
  "CLAWDBOT_CONFIG_PATH",
] as const;

describe("ensureDevGatewayConfig", () => {
  const envSnapshot = captureEnv([...ENV_KEYS]);

  afterEach(() => {
    envSnapshot.restore();
  });

  it("seeds dev main auth-profiles from the default profile store", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-dev-gateway-"));
    try {
      const homeDir = path.join(tempRoot, "home");
      const mainAuthPath = path.join(
        homeDir,
        ".openskynet",
        "agents",
        "main",
        "agent",
        "auth-profiles.json",
      );
      const devStateDir = path.join(homeDir, ".openskynet-dev");
      const devAuthPath = path.join(devStateDir, "agents", "main", "agent", "auth-profiles.json");
      const devModelsPath = path.join(devStateDir, "agents", "main", "agent", "models.json");

      await fs.mkdir(path.dirname(mainAuthPath), { recursive: true });
      await fs.writeFile(
        mainAuthPath,
        `${JSON.stringify(
          {
            version: 1,
            profiles: {
              "anthropic:default": {
                type: "api_key",
                provider: "anthropic",
                key: "main-anthropic-key",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await fs.mkdir(path.dirname(devModelsPath), { recursive: true });
      await fs.writeFile(
        devModelsPath,
        `${JSON.stringify(
          {
            providers: {
              ollama: {
                models: [{ id: "gpt-oss-safeguard:20b" }],
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      process.env.HOME = homeDir;
      process.env.OPENSKYNET_PROFILE = "dev";
      process.env.OPENSKYNET_STATE_DIR = devStateDir;
      process.env.OPENSKYNET_CONFIG_PATH = path.join(devStateDir, "openclaw.json");
      delete process.env.OPENSKYNET_HOME;
      delete process.env.CLAWDBOT_STATE_DIR;
      delete process.env.CLAWDBOT_CONFIG_PATH;

      await ensureDevGatewayConfig({});

      const copied = JSON.parse(await fs.readFile(devAuthPath, "utf8")) as {
        profiles?: Record<string, { key?: string }>;
      };
      const config = JSON.parse(
        await fs.readFile(path.join(devStateDir, "openclaw.json"), "utf8"),
      ) as { agents?: { defaults?: { model?: { primary?: string } } } };
      expect(copied.profiles?.["anthropic:default"]?.key).toBe("main-anthropic-key");
      expect(config.agents?.defaults?.model?.primary).toBe("ollama/gpt-oss-safeguard:20b");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("does not overwrite an existing dev main auth store", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-dev-gateway-"));
    try {
      const homeDir = path.join(tempRoot, "home");
      const mainAuthPath = path.join(
        homeDir,
        ".openskynet",
        "agents",
        "main",
        "agent",
        "auth-profiles.json",
      );
      const devStateDir = path.join(homeDir, ".openskynet-dev");
      const devAuthPath = path.join(devStateDir, "agents", "main", "agent", "auth-profiles.json");
      const devModelsPath = path.join(devStateDir, "agents", "main", "agent", "models.json");

      await fs.mkdir(path.dirname(mainAuthPath), { recursive: true });
      await fs.mkdir(path.dirname(devAuthPath), { recursive: true });
      await fs.writeFile(
        mainAuthPath,
        `${JSON.stringify(
          {
            version: 1,
            profiles: {
              "anthropic:default": {
                type: "api_key",
                provider: "anthropic",
                key: "main-anthropic-key",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await fs.writeFile(
        devAuthPath,
        `${JSON.stringify(
          {
            version: 1,
            profiles: {
              "anthropic:default": {
                type: "api_key",
                provider: "anthropic",
                key: "dev-anthropic-key",
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
      await fs.writeFile(
        devModelsPath,
        `${JSON.stringify(
          {
            providers: {
              ollama: {
                models: [{ id: "gpt-oss-safeguard:20b" }],
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      process.env.HOME = homeDir;
      process.env.OPENSKYNET_PROFILE = "dev";
      process.env.OPENSKYNET_STATE_DIR = devStateDir;
      process.env.OPENSKYNET_CONFIG_PATH = path.join(devStateDir, "openclaw.json");
      delete process.env.OPENSKYNET_HOME;
      delete process.env.CLAWDBOT_STATE_DIR;
      delete process.env.CLAWDBOT_CONFIG_PATH;

      await ensureDevGatewayConfig({});

      const copied = JSON.parse(await fs.readFile(devAuthPath, "utf8")) as {
        profiles?: Record<string, { key?: string }>;
      };
      const config = JSON.parse(
        await fs.readFile(path.join(devStateDir, "openclaw.json"), "utf8"),
      ) as { agents?: { defaults?: { model?: { primary?: string } } } };
      expect(copied.profiles?.["anthropic:default"]?.key).toBe("dev-anthropic-key");
      expect(config.agents?.defaults?.model?.primary).toBe("ollama/gpt-oss-safeguard:20b");
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
