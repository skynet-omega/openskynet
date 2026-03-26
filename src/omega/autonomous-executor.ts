/**
 * autonomous-executor.ts
 * ======================
 * Ejecutor de acciones autónomas para OpenSkyNet.
 *
 * Este módulo permite que el sistema actúe proactivamente sin depender
 * de que el LLM genere una respuesta. Las drives internas ejecutan
 * código directamente.
 */

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { InnerDriveSignal } from "./inner-life/drives.js";
import { evaluateInnerDrives } from "./inner-life/drives.js";
import { loadOpenSkynetInternalProjectProfile } from "./internal-project.js";
import { runResearchLoop, hasRecentResearchProse } from "./research-loop.js";
import { loadOpenSkynetOmegaRuntimeAuthority } from "./runtime-authority.js";
import { compressScienceBase } from "./science-base-compressor.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import { loadOmegaSelfTimeKernel } from "./session-context.js";

const execAsync = promisify(exec);

export type AutonomousActionResult =
  | { kind: "memory_explored"; target: string; findings: string[] }
  | { kind: "sessions_cleaned"; count: number }
  | { kind: "status_check"; status: string; issues: string[] }
  | { kind: "experiment_proposed"; hypothesis: string; testable: boolean }
  | { kind: "science_base_compressed"; originalLines: number; newLines: number }
  | { kind: "none"; reason: string };

export type AutonomousExecution = {
  executedAt: number;
  driveKind: InnerDriveSignal["kind"];
  action: AutonomousActionResult;
  reported: boolean;
};

const AUTONOMOUS_LOG_FILE = "autonomous-executions.jsonl";

async function logAutonomousExecution(
  workspaceRoot: string,
  execution: AutonomousExecution,
): Promise<void> {
  const logPath = path.join(workspaceRoot, ".openskynet", AUTONOMOUS_LOG_FILE);
  const line = JSON.stringify(execution) + "\n";
  await fs.appendFile(logPath, line).catch(() => undefined);
}

async function collectMemoryFindings(workspaceRoot: string, target: string): Promise<string[]> {
  const findings: string[] = [];

  try {
    const memoryPath = path.join(workspaceRoot, target);
    const content = await fs.readFile(memoryPath, "utf-8").catch(() => null);
    if (content) {
      // Extraer líneas que parecen tareas o hallazgos
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.match(/^[-*]\s+.*\w+.*$/)) {
          findings.push(line.trim().slice(2));
        }
      }
    }
  } catch {
    // Ignorar errores de lectura
  }

  return findings.slice(0, 5); // Máximo 5 hallazgos
}

async function executeSessionCleanup(workspaceRoot: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      "openclaw sessions cleanup --enforce 2>&1 || openskynet sessions cleanup --enforce 2>&1 || echo 0",
      { cwd: workspaceRoot, timeout: 30000 },
    );
    const match = stdout.match(/(\d+)\s*entries?/i) || stdout.match(/(\d+)\s*session/i);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    return 0;
  }
}

async function executeStatusCheck(
  workspaceRoot: string,
): Promise<{ status: string; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Verificar gateway
    const { stdout: gatewayStatus } = await execAsync(
      "openclaw gateway status 2>&1 || openskynet gateway status 2>&1 || echo 'unknown'",
      { cwd: workspaceRoot, timeout: 10000 },
    );

    if (gatewayStatus.includes("error") || gatewayStatus.includes("not running")) {
      issues.push("Gateway no está ejecutándose");
    }

    // Verificar sesiones acumuladas
    const { stdout: sessionsStatus } = await execAsync(
      "openclaw sessions list 2>&1 | wc -l || openskynet sessions list 2>&1 | wc -l || echo 0",
      { cwd: workspaceRoot, timeout: 10000 },
    );
    const sessionCount = parseInt(sessionsStatus.trim(), 10) || 0;
    if (sessionCount > 50) {
      issues.push(`Demasiadas sesiones acumuladas: ${sessionCount}`);
    }

    return {
      status: issues.length === 0 ? "healthy" : "degraded",
      issues,
    };
  } catch {
    return { status: "unknown", issues: ["No se pudo verificar estado"] };
  }
}

type AutonomousExperimentProposal = {
  hypothesis: string;
  testable: boolean;
};

async function loadLivingStateProposal(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<AutonomousExperimentProposal | undefined> {
  try {
    const authority = await loadOpenSkynetOmegaRuntimeAuthority({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
    });
    const livingState = authority.livingState;
    const project = authority.project;
    if (!livingState) {
      return undefined;
    }
    const benchmark = livingState.agenticBenchmark;
    const projectState = livingState.internalProjectState;
    const commitmentTask = projectState.commitment?.executableTask?.trim();

    if (commitmentTask) {
      return {
        hypothesis: `[${project.name}] Execute committed task: ${commitmentTask}`,
        testable: true,
      };
    }

    if (projectState.topWorkItem?.trim()) {
      return {
        hypothesis: `[${project.name}] Materialize top work item: ${projectState.topWorkItem.trim()}`,
        testable: true,
      };
    }

    if (typeof benchmark?.benchmarkScore === "number" && benchmark.benchmarkScore < 0.7) {
      return {
        hypothesis: `[${project.name}] Raise agentic benchmark score above 0.70 by producing a runnable artifact or explicit commitment.`,
        testable: true,
      };
    }

    if (projectState.recommendedAction?.trim()) {
      return {
        hypothesis: `[${project.name}] ${projectState.recommendedAction.trim()}`,
        testable: true,
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function proposeExperiment(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<AutonomousExperimentProposal> {
  const fromLivingState = await loadLivingStateProposal(params);
  if (fromLivingState) {
    return fromLivingState;
  }

  const project = await loadOpenSkynetInternalProjectProfile(params.workspaceRoot);
  return {
    hypothesis: `[${project.name}] Advance the configured internal project with one measurable artifact, benchmark, or falsifiable result.`,
    testable: true,
  };
}

/**
 * Ejecuta una acción autónoma basada en la señal de drive interna.
 * Esta función NO depende del LLM - ejecuta código directamente.
 */
export async function executeAutonomousAction(params: {
  workspaceRoot: string;
  sessionKey: string;
  signal: InnerDriveSignal;
  kernel: OmegaSelfTimeKernelState;
}): Promise<AutonomousActionResult> {
  const { workspaceRoot, signal } = params;

  switch (signal.kind) {
    case "homeostasis": {
      // Limpiar sesiones y verificar estado
      const cleanedCount = await executeSessionCleanup(workspaceRoot);
      const statusCheck = await executeStatusCheck(workspaceRoot);

      // Compresión de la base científica
      const compressResult = await compressScienceBase({ workspaceRoot });

      if (cleanedCount > 0) {
        return {
          kind: "sessions_cleaned",
          count: cleanedCount,
        };
      }

      if (compressResult.status === "compressed") {
        return {
          kind: "science_base_compressed",
          originalLines: compressResult.originalLines,
          newLines: compressResult.newLines,
        };
      }

      if (statusCheck.issues.length > 0) {
        return {
          kind: "status_check",
          status: statusCheck.status,
          issues: statusCheck.issues,
        };
      }

      return { kind: "none", reason: "homeostasis_maintained" };
    }

    case "curiosity": {
      // Explorar memoria
      const target = signal.target || "MEMORY.md";
      const findings = await collectMemoryFindings(workspaceRoot, target);

      return {
        kind: "memory_explored",
        target,
        findings,
      };
    }

    case "entropy_alert": {
      // FRENTE C: Loop cerrado de investigación
      // Antes de proponer experimento, verificar si hay correlación JEPA fuerte.
      // Si la hay y no hay .prose reciente → generar investigación autónoma.
      const hasRecent = await hasRecentResearchProse(workspaceRoot);
      if (!hasRecent) {
        const researchResult = await runResearchLoop({
          workspaceRoot,
          sessionKey: params.sessionKey,
        });
        if (researchResult.kind === "prose_written") {
          return {
            kind: "experiment_proposed",
            hypothesis: `[AUTO-RESEARCH] ${researchResult.hypotheses[0] ?? "Correlación JEPA detectada"}`,
            testable: true,
          };
        }
      }
      // Fallback: proponer experimento desde MEMORY.md
      const experiment = await proposeExperiment({
        workspaceRoot,
        sessionKey: params.sessionKey,
      });
      return {
        kind: "experiment_proposed",
        hypothesis: experiment.hypothesis,
        testable: experiment.testable,
      };
    }

    case "competence_drive": {
      const statusCheck = await executeStatusCheck(workspaceRoot);
      if (statusCheck.issues.length > 0) {
        return {
          kind: "status_check",
          status: statusCheck.status,
          issues: statusCheck.issues,
        };
      }
      return { kind: "none", reason: "competence_nominal" };
    }

    case "idle":
    default:
      return { kind: "none", reason: "no_drive_active" };
  }
}

/**
 * Ejecutor principal de autonomía.
 * Evalúa drives y ejecuta acciones sin intervención del LLM.
 */
export async function runAutonomousCycle(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<AutonomousExecution | null> {
  const kernel = await loadOmegaSelfTimeKernel(params);
  if (!kernel) {
    return null;
  }
  const authority = await loadOpenSkynetOmegaRuntimeAuthority({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });

  // Evaluar drives
  const signal = evaluateInnerDrives({
    kernel,
    nowMs: Date.now(),
    memoryCandidates: authority.memoryCandidates,
  });

  if (signal.kind === "idle") {
    return null;
  }

  // Ejecutar acción autónoma
  const action = await executeAutonomousAction({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    signal,
    kernel,
  });

  if (action.kind === "none") {
    return null;
  }

  const execution: AutonomousExecution = {
    executedAt: Date.now(),
    driveKind: signal.kind,
    action,
    reported: false,
  };

  // Loggear ejecución
  await logAutonomousExecution(params.workspaceRoot, execution);

  return execution;
}

/**
 * Formatea el resultado de una ejecución autónoma para reporte.
 */
export function formatAutonomousExecution(exec: AutonomousExecution): string {
  const timestamp = new Date(exec.executedAt).toISOString();
  const driveEmojiByKind: Record<InnerDriveSignal["kind"], string> = {
    homeostasis: "🏥",
    curiosity: "🔍",
    entropy_alert: "⚡",
    competence_drive: "🛠️",
    idle: "💤",
  };
  const driveEmoji = driveEmojiByKind[exec.driveKind];

  let actionText = "";
  switch (exec.action.kind) {
    case "memory_explored":
      actionText = `Exploró ${exec.action.target}: ${exec.action.findings.length} hallazgos`;
      break;
    case "sessions_cleaned":
      actionText = `Limpió ${exec.action.count} sesiones`;
      break;
    case "status_check":
      actionText = `Estado: ${exec.action.status} (${exec.action.issues.length} issues)`;
      break;
    case "science_base_compressed":
      actionText = `Comprimió SCIENCE_BASE.md (${exec.action.originalLines} -> ${exec.action.newLines} líneas)`;
      break;
    case "experiment_proposed":
      actionText = `Propuso experimento: ${exec.action.hypothesis}`;
      break;
    case "none":
      actionText = "Sin acción";
      break;
  }

  return `[${timestamp}] ${driveEmoji} ${exec.driveKind}: ${actionText}`;
}
