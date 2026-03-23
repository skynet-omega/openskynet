import path from "node:path";
import { describe, expect, it } from "vitest";
import { alignProbeGatewayAuth } from "../scripts/live-omega-empirical-probe.js";

describe("alignProbeGatewayAuth", () => {
  it("autofills dev gateway auth for arbitrary loopback override ports", async () => {
    const env: NodeJS.ProcessEnv = {
      OPENSKYNET_GATEWAY_URL: "ws://127.0.0.1:19011",
    };
    const fakeHome = "/tmp/openskynet-probe-home";
    const authSource = await alignProbeGatewayAuth({
      env,
      homeDir: fakeHome,
      readFile: async (filePath) => {
        expect(filePath).toBe(path.join(fakeHome, ".openskynet-dev", "openclaw.json"));
        return JSON.stringify({
          gateway: {
            auth: {
              token: "dev-token-123",
            },
          },
        });
      },
    });

    expect(authSource).toBe("dev-config-token");
    expect(env.OPENSKYNET_GATEWAY_TOKEN).toBe("dev-token-123");
    expect(env.OPENSKYNET_STATE_DIR).toBe(path.join(fakeHome, ".openskynet-dev"));
    expect(env.OPENSKYNET_CONFIG_PATH).toBe(
      path.join(fakeHome, ".openskynet-dev", "openclaw.json"),
    );
  });

  it("does not autofill for non-loopback overrides", async () => {
    const env: NodeJS.ProcessEnv = {
      OPENSKYNET_GATEWAY_URL: "ws://gateway.example:19011",
    };

    const authSource = await alignProbeGatewayAuth({
      env,
      readFile: async () => {
        throw new Error("should not read config for remote overrides");
      },
    });

    expect(authSource).toBe("override-without-autofill");
    expect(env.OPENSKYNET_GATEWAY_TOKEN).toBeUndefined();
  });
});
