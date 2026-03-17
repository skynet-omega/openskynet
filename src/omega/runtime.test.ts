/**
 * runtime.test.ts - Tests para el runtime de OMEGA
 */

import { describe, it, expect } from "vitest";
import {
  runOmegaSmoke,
  runJepaTensionBridge,
  resolveOmegaPythonRoot,
} from "./runtime.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

const REPO_ROOT = process.cwd();

describe("runOmegaSmoke", () => {
  it("returns valid smoke result", () => {
    const result = runOmegaSmoke(REPO_ROOT);
    expect(result.ok).toBe(true);
    expect(result.core_profile).toBeDefined();
    expect(result.available_profiles).toBeInstanceOf(Array);
  });
});

describe("runJepaTensionBridge", () => {
  it("returns frustration metrics for valid kernel state", async () => {
    const kernelState: Partial<OmegaSelfTimeKernelState> = {
      timeline: [
        {
          task: "test task 1",
          outcome: { status: "ok" },
          turn: 1,
        } as any,
        {
          task: "test task 2",
          outcome: { status: "error", errorKind: "test_error" },
          turn: 2,
        } as any,
      ],
      turnCount: 2,
    };

    const result = await runJepaTensionBridge(REPO_ROOT, kernelState as OmegaSelfTimeKernelState);
    
    // Debe retornar métricas válidas
    expect(typeof result.frustration).toBe("number");
    expect(typeof result.confidence).toBe("number");
    expect(result.frustration).toBeGreaterThanOrEqual(0);
    expect(result.frustration).toBeLessThanOrEqual(2);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("returns low confidence for insufficient timeline", async () => {
    const kernelState: Partial<OmegaSelfTimeKernelState> = {
      timeline: [],
      turnCount: 0,
    };

    const result = await runJepaTensionBridge(REPO_ROOT, kernelState as OmegaSelfTimeKernelState);
    
    // Sin datos, debe retornar confidence 0
    expect(result.confidence).toBe(0);
    expect(result.frustration).toBe(0);
  });

  it("handles single timeline entry gracefully", async () => {
    const kernelState: Partial<OmegaSelfTimeKernelState> = {
      timeline: [
        {
          task: "only task",
          outcome: { status: "ok" },
          turn: 1,
        } as any,
      ],
      turnCount: 1,
    };

    const result = await runJepaTensionBridge(REPO_ROOT, kernelState as OmegaSelfTimeKernelState);
    
    // Con solo 1 entry, no puede predecir
    expect(result.confidence).toBe(0);
  });
});
