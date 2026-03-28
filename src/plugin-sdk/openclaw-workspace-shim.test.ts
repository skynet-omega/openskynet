import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execFileAsync = promisify(execFile);

test("moltbot resolves the openclaw workspace shim at runtime", async () => {
  const { stdout } = await execFileAsync(
    "node",
    ["-e", "import('openclaw').then(()=>console.log('ok'))"],
    { cwd: new URL("../../packages/moltbot/", import.meta.url) },
  );

  expect(stdout.trim()).toBe("ok");
});

test("googlechat resolves openclaw plugin-sdk subpaths at runtime", async () => {
  const { stdout } = await execFileAsync(
    "node",
    ["-e", "import('openclaw/plugin-sdk/googlechat').then(()=>console.log('ok'))"],
    { cwd: new URL("../../extensions/googlechat/", import.meta.url) },
  );

  expect(stdout.trim()).toBe("ok");
});
