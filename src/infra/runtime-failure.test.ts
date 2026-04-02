import { describe, expect, it } from "vitest";
import { classifyOpenSkynetRuntimeFailure } from "./runtime-failure.js";

describe("classifyOpenSkynetRuntimeFailure", () => {
  it("classifies provider rate limits as environmental", () => {
    expect(
      classifyOpenSkynetRuntimeFailure({
        status: "error",
        errorText: "429 No capacity available for model gemini",
      }),
    ).toEqual({
      failureDomain: "environmental",
      failureClass: "provider_rate_limit",
    });
  });

  it("classifies session locks as environmental", () => {
    expect(
      classifyOpenSkynetRuntimeFailure({
        status: "error",
        errorText: "session file locked (timeout 30000ms): owner /tmp/session.lock",
      }),
    ).toEqual({
      failureDomain: "environmental",
      failureClass: "session_lock",
    });
  });

  it("classifies missing paths as cognitive", () => {
    expect(
      classifyOpenSkynetRuntimeFailure({
        status: "error",
        errorText: "ENOENT: no such file or directory",
      }),
    ).toEqual({
      failureDomain: "cognitive",
      failureClass: "missing_path",
    });
  });
});
