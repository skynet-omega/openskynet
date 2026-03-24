import { runOmegaSmoke, runJepaTensionBridge } from "./src/omega/runtime.js";

const repoRoot = process.cwd();

async function test() {
  console.log("--- Testing OMEGA Smoke ---");
  try {
    const smoke = runOmegaSmoke(repoRoot);
    console.log("Smoke result:", JSON.stringify(smoke, null, 2));
  } catch (err) {
    console.error("Smoke failed:", err.message);
  }

  console.log("\n--- Testing JEPA Tension Bridge ---");
  try {
    const jepa = await runJepaTensionBridge(repoRoot, {
      t: 100,
      v: [1, 2, 3],
      m: { test: 1 },
    } as any);
    console.log("JEPA result:", JSON.stringify(jepa, null, 2));
  } catch (err) {
    console.error("JEPA failed:", err.message);
  }
}

test();
