import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FinalizedMsgContext } from "../auto-reply/templating.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  applyOmegaInboundCognition,
  isOmegaInboundCognitionEnabled,
  OPENSKYNET_OMEGA_INBOUND_COGNITION_ENV,
} from "./inbound-cognition.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

function makeContext(body: string): FinalizedMsgContext {
  return {
    Body: body,
    SessionKey: "main",
    CommandAuthorized: false,
  };
}

describe("omega inbound cognition", () => {
  it("stays enabled by default for backward compatibility", () => {
    expect(isOmegaInboundCognitionEnabled({})).toBe(true);
  });

  it("can be explicitly disabled by env", async () => {
    await withEnvAsync({ [OPENSKYNET_OMEGA_INBOUND_COGNITION_ENV]: "0" }, async () => {
      expect(isOmegaInboundCognitionEnabled()).toBe(false);
    });
  });

  it("injects untrusted Omega NLE context through the dedicated bridge", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-inbound-cognition-"));
    tempDirs.push(workspaceRoot);
    const ctx = makeContext("error? ".repeat(80));

    await applyOmegaInboundCognition({
      workspaceRoot,
      sessionKey: "main",
      ctx,
    });

    expect(ctx.UntrustedContext?.some((entry) => entry.includes("[Omega NLE Active:"))).toBe(true);
  });

  it("skips injection entirely when disabled", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-inbound-disabled-"));
    tempDirs.push(workspaceRoot);
    const ctx = makeContext("error? ".repeat(80));

    await withEnvAsync({ [OPENSKYNET_OMEGA_INBOUND_COGNITION_ENV]: "0" }, async () => {
      await applyOmegaInboundCognition({
        workspaceRoot,
        sessionKey: "main",
        ctx,
      });
    });

    expect(ctx.UntrustedContext).toBeUndefined();
  });
});
