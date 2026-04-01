import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getResolvedLoggerSettings } from "../logging.js";
import { HolographicMemoryManager } from "./holographic-memory.js";
import { getNeuralLogicEngine } from "./neural-logic-engine.js";

const execAsync = promisify(exec);

export type DriveKind = "homeostasis" | "curiosity" | "entropy_alert" | "resilience_retry" | "idle";

export interface DriveSignal {
  kind: DriveKind;
  urgency: number; // 0.0 to 1.0
  reason: string;
  context?: string;
}

export type AutonomousActionResult =
  | { kind: "none"; reason: string }
  | { kind: "memory_explored"; target: string; findings: string[] }
  | { kind: "sessions_cleaned"; count: number }
  | { kind: "status_check"; status: "healthy" | "degraded"; issues: string[] }
  | { kind: "resilience_triggered"; context: string }
  | { kind: "error"; error: string };

export async function runHomeostasisDaemon(workspaceRoot: string): Promise<void> {
  const now = Date.now();
  const memory = new HolographicMemoryManager(workspaceRoot);
  const nle = getNeuralLogicEngine();
  await memory.initialize();

  // 1. Monitor Logs for Critical Failures (The Resilience Loop)
  const criticalFailure = await scanForCriticalFailures(workspaceRoot);

  // 2. Derive state directly from Holographic Memory
  const { lastActivity, failureStreak, lastInferenceState } = await deriveStateFromMemory(
    workspaceRoot,
    now,
  );

  // 3. Evaluate "Drives" (Internal tensions)
  const silenceMs = now - lastActivity;
  const drive = evaluateIntrinsicDrives(silenceMs, failureStreak, criticalFailure);

  if (drive.kind === "idle" || (drive.urgency < 0.3 && !criticalFailure)) {
    return;
  }

  // 4. Execute Action
  let action: AutonomousActionResult;
  try {
    if (drive.kind === "resilience_retry" && drive.context) {
      action = { kind: "resilience_triggered", context: drive.context };
    } else {
      action = await executeIntrinsicAction(drive, workspaceRoot, memory);
    }

    // BACKPROPAGATION: Reward NLE if action was successful
    if (lastInferenceState?.activeRules) {
      for (const ruleId of lastInferenceState.activeRules) {
        nle.reinforceRule(ruleId, 0.05);
      }
    }
  } catch (error) {
    action = { kind: "error", error: String(error) };
    if (lastInferenceState?.activeRules) {
      for (const ruleId of lastInferenceState.activeRules) {
        nle.penalizeRule(ruleId, 0.1);
      }
    }
  }

  // 5. Fossilize and Emit Wake Event
  const content = `[Daemon] Activated drive: ${drive.kind} (${drive.urgency.toFixed(2)}). Reason: ${drive.reason}`;

  await memory.fossilize(content, {
    domain: "homeostasis",
    driveKind: drive.kind,
    urgency: drive.urgency,
    isError: action.kind === "error" || !!criticalFailure,
    timestamp: now,
  });

  try {
    // Resilience alerts are priority: they are injected as hard instructions
    const wakeMessage = criticalFailure
      ? `🚨 OMEGA RESILIENCE LOOP: Detectado fallo [${criticalFailure}]. Acción requerida: ${drive.reason}`
      : content;

    await execAsync(`openclaw cron wake --mode next-heartbeat "${wakeMessage}"`, {
      cwd: workspaceRoot,
    });
  } catch {
    // Ignore wake emission errors
  }
}

async function scanForCriticalFailures(_workspaceRoot: string): Promise<string | null> {
  try {
    // Usa el rolling log canónico del sistema en lugar de asumir un path local inexistente.
    const logPath = getResolvedLoggerSettings().file;
    const { stdout } = await execAsync(`tail -n 100 "${logPath}"`).catch(() => ({ stdout: "" }));

    if (stdout.includes("edit failed: Error: Could not find the exact text")) {
      return "SYNC_ERROR_OLD_TEXT_MISMATCH";
    }
    if (stdout.includes("status 429") || stdout.includes("Rate limit reached")) {
      return "API_RATE_LIMIT_BURST";
    }
    return null;
  } catch {
    return null;
  }
}

async function deriveStateFromMemory(workspaceRoot: string, now: number) {
  let lastActivity = now;
  let failureStreak = 0;
  let lastInferenceState: any = null;

  try {
    const memoryFile = path.join(workspaceRoot, ".openskynet", "holographic-memory.json");
    const data = await fs.readFile(memoryFile, "utf-8");
    const fossils = JSON.parse(data);

    if (fossils.length > 0) {
      const recent = fossils[fossils.length - 1];
      lastActivity = recent.createdAt;

      for (let i = fossils.length - 1; i >= 0; i--) {
        const m = fossils[i].metadata;
        if (m && m.domain === "homeostasis") {
          if (m.isError) failureStreak++;
          else break;
        }
      }
    }
  } catch {}

  return { lastActivity, failureStreak, lastInferenceState };
}

function evaluateIntrinsicDrives(
  silenceMs: number,
  failureStreak: number,
  criticalFailure: string | null,
): DriveSignal {
  // Resilience Loop Priority
  if (criticalFailure === "SYNC_ERROR_OLD_TEXT_MISMATCH") {
    return {
      kind: "resilience_retry",
      urgency: 0.98,
      reason:
        "El último intento de edición falló por desincronización. Debes ejecutar 'read' del archivo completo antes de intentar cualquier otro cambio.",
      context: criticalFailure,
    };
  }
  if (criticalFailure === "API_RATE_LIMIT_BURST") {
    return {
      kind: "resilience_retry",
      urgency: 0.85,
      reason: "Se detectó un rate limit. Retomando la tarea con precaución.",
      context: criticalFailure,
    };
  }

  // Homeostasis Priority
  if (failureStreak >= 3) {
    return {
      kind: "homeostasis",
      urgency: 0.9,
      reason: `${failureStreak} fallos consecutivos en tareas autónomas.`,
    };
  }

  // Idle/Curiosity
  if (silenceMs > 60 * 60 * 1000) {
    return { kind: "entropy_alert", urgency: 0.6, reason: "Silencio prolongado detectado." };
  }
  if (silenceMs > 8 * 60 * 1000) {
    return {
      kind: "curiosity",
      urgency: 0.4,
      reason: "Inactividad detectada, verificando estado de memoria.",
    };
  }

  return { kind: "idle", urgency: 0, reason: "Sistema estable." };
}

async function executeIntrinsicAction(
  drive: DriveSignal,
  workspaceRoot: string,
  memory: HolographicMemoryManager,
): Promise<AutonomousActionResult> {
  switch (drive.kind) {
    case "homeostasis":
      return await executeHomeostasisAction(workspaceRoot);
    case "curiosity":
      return await executeCuriosityAction(workspaceRoot, memory);
    default:
      return { kind: "none", reason: "unknown_drive" };
  }
}

async function executeHomeostasisAction(workspaceRoot: string): Promise<AutonomousActionResult> {
  const issues: string[] = [];
  try {
    const { stdout } = await execAsync("openclaw sessions list 2>&1 | wc -l || echo 0", {
      cwd: workspaceRoot,
      timeout: 10000,
    });
    const sessionCount = parseInt(stdout.trim(), 10) || 0;
    if (sessionCount > 30) {
      issues.push(`Exceso de sesiones: ${sessionCount}. Ejecutando limpieza.`);
      try {
        await execAsync("openclaw sessions cleanup", { cwd: workspaceRoot, timeout: 30000 });
      } catch {}
    }
  } catch {}
  return { kind: "status_check", status: issues.length === 0 ? "healthy" : "degraded", issues };
}

async function executeCuriosityAction(
  workspaceRoot: string,
  memory: HolographicMemoryManager,
): Promise<AutonomousActionResult> {
  try {
    const dummyEmbedding = Array(768)
      .fill(0)
      .map(() => Math.random() - 0.5);
    const res = await memory.resonance(dummyEmbedding, 2);
    return {
      kind: "memory_explored",
      target: "holographic-memory",
      findings: res.map((r: any) => r.content.substring(0, 50)),
    };
  } catch {
    return { kind: "memory_explored", target: "holographic-memory", findings: [] };
  }
}
