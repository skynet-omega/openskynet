import { describe, expect, it } from "vitest";
import { extractToolCallLocations, formatToolTitle } from "./event-mapper.js";

describe("extractToolCallLocations", () => {
  it("enforces the global node visit cap across nested structures", () => {
    const nested = Array.from({ length: 20 }, (_, outer) =>
      Array.from({ length: 20 }, (_, inner) =>
        inner === 19 ? { path: `/tmp/file-${outer}.txt` } : { note: `${outer}-${inner}` },
      ),
    );

    const locations = extractToolCallLocations(nested);

    expect(locations).toBeDefined();
    expect(locations?.length).toBeLessThan(20);
    expect(locations).not.toContainEqual({ path: "/tmp/file-19.txt" });
  });
});

describe("formatToolTitle", () => {
  it("escapes inline control characters in tool args", () => {
    const title = formatToolTitle("read", {
      path: "/tmp/file.txt\nnext-line\twith-tab",
    });

    expect(title).toContain("\\n");
    expect(title).toContain("\\t");
    expect(title).not.toContain("\nnext-line");
    expect(title).not.toContain("\twith-tab");
  });
});
