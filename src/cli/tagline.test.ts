import { describe, expect, it } from "vitest";
import { DEFAULT_TAGLINE, pickTagline } from "./tagline.js";

describe("pickTagline", () => {
  it("returns empty string when mode is off", () => {
    expect(pickTagline({ mode: "off" })).toBe("");
  });

  it("returns the default starter tip when mode is default", () => {
    expect(pickTagline({ mode: "default" })).toBe(DEFAULT_TAGLINE);
  });

  it("supports deterministic tip selection in random mode", () => {
    expect(
      pickTagline({
        mode: "random",
        env: { OPENCLAW_TAGLINE_INDEX: "1" } as NodeJS.ProcessEnv,
      }),
    ).toBe(
      "Tip: openskynet dashboard --no-open  print the Control UI URL without launching a browser",
    );
  });

  it("also supports the OpenSkyNet env override for deterministic tips", () => {
    expect(
      pickTagline({
        mode: "random",
        env: { OPENSKYNET_TAGLINE_INDEX: "3" } as NodeJS.ProcessEnv,
      }),
    ).toBe("Tip: openskynet doctor  run health checks and quick fixes");
  });
});
