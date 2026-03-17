import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import type { OmegaSmokeResult, OmegaJepaTensionResult } from "./types.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

export function resolveOmegaPythonRoot(repoRoot: string): string {
  return path.join(repoRoot, "python");
}

// Helper for finding correct python executable
function getPythonCommand(): string {
  if (process.env.PYTHON_CMD) return process.env.PYTHON_CMD;
  return os.platform() === "win32" ? "python" : "python3";
}

export function resolveOmegaSmokeEntry(repoRoot: string): string {
  return path.join(resolveOmegaPythonRoot(repoRoot), "omega_py", "smoke.py");
}

export function resolveOmegaSmokeModule(): string {
  return "omega_py.smoke";
}

export function resolveJepaTensionModule(): string {
  return "omega_py.jepa_tension_bridge";
}

export function createOmegaPythonEnv(repoRoot: string): NodeJS.ProcessEnv {
  const pythonRoot = resolveOmegaPythonRoot(repoRoot);
  const existingPythonPath = process.env.PYTHONPATH?.trim();
  return {
    ...process.env,
    PYTHONPATH: existingPythonPath ? `${pythonRoot}${path.delimiter}${existingPythonPath}` : pythonRoot,
  };
}

export function runOmegaSmoke(repoRoot: string): OmegaSmokeResult {
  const result = spawnSync(getPythonCommand(), ["-m", resolveOmegaSmokeModule()], {
    cwd: repoRoot,
    env: createOmegaPythonEnv(repoRoot),
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "OMEGA smoke failed");
  }
  const payload = result.stdout.trim();
  if (!payload) {
    throw new Error("OMEGA smoke returned no output");
  }
  const parsed = JSON.parse(payload) as OmegaSmokeResult;
  if (!parsed?.ok) {
    throw new Error("OMEGA smoke returned invalid payload");
  }
  return parsed;
}

/**
 * Ejecuta el bridge JEPA para calcular señal de tensión basada en frustración.
 * 
 * Este es un EXPERIMENTO para validar si el subsistema Python aporta valor real.
 * Si no muestra correlación con eventos de tensión, se eliminará.
 */
export async function runJepaTensionBridge(
  repoRoot: string,
  kernelState: OmegaSelfTimeKernelState,
): Promise<OmegaJepaTensionResult> {
  const input = JSON.stringify(kernelState);
  
  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let isDone = false;
    
    const child = spawn(getPythonCommand(), ["-m", resolveJepaTensionModule()], {
      cwd: repoRoot,
      env: createOmegaPythonEnv(repoRoot),
    });
    
    const timeout = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        child.kill("SIGKILL");
        resolve({ frustration: 0, confidence: 0, error: "JEPA bridge timeout" });
      }
    }, 5000);
    
    child.stdout.on("data", (chunk) => { stdoutBuf += chunk.toString("utf-8"); });
    child.stderr.on("data", (chunk) => { stderrBuf += chunk.toString("utf-8"); });
    
    child.on("error", (err) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timeout);
        resolve({ frustration: 0, confidence: 0, error: err.message });
      }
    });
    
    child.on("close", (code) => {
      if (!isDone) {
        isDone = true;
        clearTimeout(timeout);
        
        if (code !== 0) {
          resolve({ 
            frustration: 0, 
            confidence: 0, 
            error: stderrBuf.trim() || "JEPA bridge failed" 
          });
          return;
        }
        
        const payload = stdoutBuf.trim();
        if (!payload) {
          resolve({ frustration: 0, confidence: 0, error: "Empty output from JEPA bridge" });
          return;
        }
        
        try {
          const parsed = JSON.parse(payload) as OmegaJepaTensionResult;
          resolve(parsed);
        } catch (e) {
          resolve({ 
            frustration: 0, 
            confidence: 0, 
            error: `Parse error: ${e instanceof Error ? e.message : String(e)}` 
          });
        }
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
