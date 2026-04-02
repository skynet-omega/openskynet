import { describe, expect, it } from "vitest";
import {
  enhanceDriveWithJepaTension,
  parseJepaTensionFromKernelTimeline,
} from "./jepa-drive-enhancement.js";

describe("jepa drive enhancement", () => {
  it("extracts worsening surprise from the recent failure window", () => {
    const tension = parseJepaTensionFromKernelTimeline([
      { outcome: { status: "ok" } },
      { outcome: { status: "ok" } },
      { outcome: { status: "ok" } },
      { outcome: { status: "error" } },
      { outcome: { status: "ok" } },
      { outcome: { status: "error" } },
      { outcome: { status: "error" } },
      { outcome: { status: "error" } },
      { outcome: { status: "error" } },
      { outcome: { status: "ok" } },
    ]);

    expect(tension.frustration).toBeGreaterThan(0.5);
    expect(tension.surprise).toBeGreaterThan(0.2);
  });

  it("triggers entropy alert earlier on idle when frustration worsens sharply", () => {
    const enhanced = enhanceDriveWithJepaTension(
      { kind: "idle" },
      { frustration: 1.1, confidence: 0.8, surprise: 0.4 },
    );

    expect(enhanced.kind).toBe("entropy_alert");
  });

  it("boosts existing drive urgency when surprise is high even below the old pure-frustration threshold", () => {
    const enhanced = enhanceDriveWithJepaTension(
      { kind: "homeostasis", reason: "base", urgency: 0.45 },
      { frustration: 0.4, confidence: 0.8, surprise: 0.3 },
    );

    expect(enhanced.kind).toBe("homeostasis");
    expect("urgency" in enhanced ? enhanced.urgency : 0).toBeGreaterThan(0.45);
  });
});
