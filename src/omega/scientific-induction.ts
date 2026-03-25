import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaAgendaExecutionContract, OmegaProblemAgendaItem } from "./problem-agenda.js";
import type { OmegaWorldModelSnapshot } from "./world-model.js";

export async function induceScientificHypothesis(params: {
  classKey: string;
  snapshot: OmegaWorldModelSnapshot;
  workspaceRoot?: string;
}): Promise<OmegaAgendaExecutionContract> {
  const { classKey, snapshot, workspaceRoot } = params;
  const item = snapshot.problemAgenda.find((i) => i.classKey === classKey);

  if (!item) {
    return {
      hypothesis: "This problem class requires investigation.",
      deliverable: "Analyze the root cause of this newly identified issue.",
      successCriteria: "Identify a specific pattern or mitigation.",
    };
  }

  let contract: OmegaAgendaExecutionContract;

  if (classKey.startsWith("failure:")) {
    const errorKind = classKey.slice("failure:".length);
    const specificFailures = snapshot.relevantMemories.filter((f) => f.errorKind === errorKind);

    // Si no hay recuerdos específicos, intentar buscar en el kernel directamente
    if (specificFailures.length === 0 && snapshot.kernel) {
      const kernelFailures = snapshot.kernel.goals
        .filter((g) => g.lastErrorKind === errorKind)
        .map((g) => ({
          kind: "repeated_failure" as const,
          task: g.task,
          targets: g.targets,
          errorKind: g.lastErrorKind,
          timestamp: g.updatedAt,
        }));
      specificFailures.push(...kernelFailures);
    }

    if (specificFailures.length > 0) {
      const lastFailure = specificFailures[0];
      const successfulAnalog = snapshot.relevantMemories.find(
        (m) =>
          m.kind === "verified_success" && m.targets.some((t) => lastFailure.targets.includes(t)),
      );

      const hypothesis = successfulAnalog
        ? `The failure '${errorKind}' in '${lastFailure.task}' contrasts with success in '${successfulAnalog.task}'. The difference in tool parameters or file state is likely the root cause.`
        : `The repeated failure '${errorKind}' in task '${lastFailure.task}' is likely caused by an unhandled edge case in tool interaction with targets: ${lastFailure.targets.join(", ")}.`;

      contract = {
        hypothesis,
        deliverable: `Execute a surgical 'probe_experiment'. Do not attempt to solve the whole problem. Instead, inject a minimal test (e.g. logging or a hardcoded stub) into the target and observe if the error mutates.`,
        successCriteria: `The probe returns a different error or confirms the isolated variable.`,
        experimentMode: "probe_experiment",
      };
    } else {
      contract = {
        hypothesis: `Analyzing unknown failure class: ${errorKind}`,
        deliverable: "Verify the error kind and context.",
        successCriteria: "Identify failure pattern.",
      };
    }
  } else if (classKey === "initiative:stalled_progress") {
    const recentStalls = snapshot.operationalSignals.filter(
      (s) => s.turnHealth === "stalled",
    ).length;
    contract = {
      hypothesis: `Autonomous progress has stalled for ${recentStalls} consecutive turns, indicating a breakdown in the active plan's causality.`,
      deliverable:
        "Perform a structural reframe: narrow targets or choose a more isolated recovery route.",
      successCriteria:
        "Heartbeat cycle terminates with progressObserved=true in the following turn.",
    };
  } else if (classKey === "initiative:somatic_optimization") {
    const avgLatency =
      snapshot.operationalSignals
        .slice(-5)
        .reduce((acc, s) => acc + s.latencyBreakdown.totalMs, 0) / 5;
    contract = {
      hypothesis: `Average response latency (${(avgLatency / 1000).toFixed(1)}s) indicates metabolic stress, potentially caused by redundant I/O or oversized context.`,
      deliverable: "Audit internal tool calls and engine loading to identify optimization targets.",
      successCriteria: "Reduction in totalMs for subsequent heartbeat turns.",
    };
  } else {
    contract = {
      hypothesis: `The problem '${item.label}' is currently impacting the efficiency of the executive loop.`,
      deliverable: `Execute an intervention or experiment to resolve this initiative.`,
      successCriteria: "Increase in realizedUtility for this agenda item.",
    };
  }

  // FASE II: Consolidación Epistémica - Si hay evidencia recurrente, persistir como Ley
  if (
    workspaceRoot &&
    snapshot.operationalSignals.filter((s) => s.turnHealth === "stalled").length >= 2
  ) {
    await persistScienceLaw(workspaceRoot, {
      phenomenon: classKey,
      effect: contract.hypothesis,
      mitigation: contract.deliverable,
    }).catch(() => undefined);
  }

  return contract;
}

/**
 * Persiste una observación científica en SCIENCE_BASE.md para evitar redescubrimiento.
 */
async function persistScienceLaw(
  workspaceRoot: string,
  law: { phenomenon: string; effect: string; mitigation: string },
) {
  const sciencePath = path.join(workspaceRoot, "memory", "SCIENCE_BASE.md");
  const lawId = `L‑${crypto.createHash("sha256").update(law.phenomenon).digest("hex").slice(0, 3).toUpperCase()}`;

  try {
    const content = await fs.readFile(sciencePath, "utf-8");
    if (content.includes(law.phenomenon)) return; // Evitar duplicados

    const newRow = `| ${lawId} | ${law.phenomenon} | ${law.effect.slice(0, 50)}... | ${law.mitigation.slice(0, 50)}... |\n`;

    // Insertar antes del cierre del documento o al final de la tabla
    const updatedContent = content.replace(/(\| ID \|.*?\n\|.*?\|.*?\n)/, `$1${newRow}`);

    await fs.writeFile(sciencePath, updatedContent, "utf-8");
  } catch (err) {
    // Silently fail if file doesn't exist or isn't writable
  }
}
