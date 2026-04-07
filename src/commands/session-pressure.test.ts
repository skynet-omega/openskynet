import { describe, expect, it } from "vitest";
import { classifySessionPressure } from "./session-pressure.js";

describe("classifySessionPressure", () => {
  it("returns unknown when there is no fresh total", () => {
    expect(classifySessionPressure({ totalTokens: undefined, contextTokens: 32_000 })).toBe(
      "unknown",
    );
  });

  it("keeps small fresh sessions in ok", () => {
    expect(classifySessionPressure({ totalTokens: 9_300, contextTokens: 32_000 })).toBe("ok");
  });

  it("marks long sessions for watch/compact/rollover by absolute size", () => {
    expect(classifySessionPressure({ totalTokens: 120_000, contextTokens: 1_000_000 })).toBe(
      "watch",
    );
    expect(classifySessionPressure({ totalTokens: 160_000, contextTokens: 1_000_000 })).toBe(
      "compact",
    );
    expect(classifySessionPressure({ totalTokens: 220_000, contextTokens: 1_000_000 })).toBe(
      "rollover",
    );
  });

  it("marks high-percent sessions even when the absolute size is lower", () => {
    expect(classifySessionPressure({ totalTokens: 20_000, contextTokens: 30_000 })).toBe("watch");
    expect(classifySessionPressure({ totalTokens: 24_000, contextTokens: 30_000 })).toBe("compact");
    expect(classifySessionPressure({ totalTokens: 27_500, contextTokens: 30_000 })).toBe(
      "rollover",
    );
  });
});
