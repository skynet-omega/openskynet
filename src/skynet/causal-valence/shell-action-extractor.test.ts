import { describe, expect, it } from "vitest";
import { extractSkynetShellAction } from "./shell-action-extractor.js";

describe("skynet shell action extractor", () => {
  it("extracts simple discovery/read/write patterns from exec commands", () => {
    expect(extractSkynetShellAction("ls -la ~/.openskynet/")).toMatchObject({
      kind: "discover",
      extractable: true,
      referencedPaths: ["~/.openskynet/"],
    });
    expect(
      extractSkynetShellAction('grep -ri "alltalk" /home/daroch/openskynet/docs/'),
    ).toMatchObject({
      kind: "discover",
      extractable: true,
      referencedPaths: ["/home/daroch/openskynet/docs/"],
    });
    expect(
      extractSkynetShellAction("find /home/daroch -maxdepth 3 -name openclaw.json"),
    ).toMatchObject({
      kind: "discover",
      extractable: true,
      referencedPaths: ["/home/daroch"],
    });
    expect(extractSkynetShellAction("rm -v /tmp/a.ts /tmp/b.ts")).toMatchObject({
      kind: "delete",
      extractable: true,
      referencedPaths: ["/tmp/a.ts", "/tmp/b.ts"],
    });
    expect(extractSkynetShellAction("mv -v /tmp/a.ts /tmp/b.ts")).toMatchObject({
      kind: "rename",
      extractable: true,
      referencedPaths: ["/tmp/a.ts", "/tmp/b.ts"],
    });
  });

  it("leaves opaque commands opaque", () => {
    expect(extractSkynetShellAction("cd /repo && git status")).toMatchObject({
      kind: "opaque",
      extractable: false,
    });
    expect(extractSkynetShellAction("bash script.sh input --out /tmp/x")).toMatchObject({
      kind: "opaque",
      extractable: false,
    });
  });
});
