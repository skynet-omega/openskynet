import { runAutonomousCycle } from "./autonomous-executor.js";
import { getOmegaHeartbeatEngineRegistry } from "./engines/registry.js";
import {
  mergeOmegaDriveSignalWithEngineScore,
  scoreOmegaEngineSignals,
} from "./engines/score-engine-signal.js";
import { deriveOmegaHeartbeatCorrectiveControl } from "./execution-controller.js";
import { decideOmegaWakeAction } from "./frontal/wake-policy.js";
import { buildAutonomousDirectivePrompt } from "./inner-life/index.js";
import {
  enhanceDriveWithJepaTension,
  parseJepaTensionFromKernelTimeline,
} from "./jepa-drive-enhancement.js";
import {
  loadOmegaOperationalMemoryTail,
  summarizeOmegaOperationalMemory,
} from "./operational-memory.js";
import { deriveOmegaAgendaExecutionContract } from "./problem-agenda.js";
import { resumeInterruptedOmegaGoal } from "./recovery-runner.js";
import { loadOpenSkynetOmegaRuntimeAuthority } from "./runtime-authority.js";
import { queryScienceBase } from "./science-base-rag.js";
import {
  focusActiveOmegaGoalTargets,
  loadOmegaSelfTimeKernel,
  loadOmegaSessionTimeline,
  pruneShadowedOmegaGoals,
  pruneStaleOmegaGoals,
  pruneSupersededOmegaGoals,
} from "./session-context.js";

type OmegaHeartbeatPromptWakeAction =
  | ReturnType<typeof decideOmegaWakeAction>
  | {
      kind: "maintain";
      reason: string;
      selectedWorkItemId?: string;
      selectedWorkItemDetail?: string;
      selectedAction?: string;
    };

export type OmegaHeartbeatExecutiveResult =
  | {
      kind: "none";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
    }
  | {
      kind: "pruned_stale_goals";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      prunedGoalTasks: string[];
    }
  | {
      kind: "pruned_superseded_goals";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      prunedGoalTasks: string[];
    }
  | {
      kind: "focused_active_goal_targets";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      focusedGoalTask?: string;
      focusedTargets: string[];
    }
  | {
      kind: "pruned_shadowed_goals";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      prunedGoalTasks: string[];
    }
  | {
      kind: "resumed_interrupted_goal";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      route: "omega_delegate" | "sessions_spawn";
      status: "ok" | "error" | "timeout";
      errorKind?: string;
      observedChangedFiles?: string[];
    }
  | {
      kind: "aborted_interrupted_goal";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      goalTask: string;
      failureStreak: number;
      errorKind?: string;
    }
  | {
      kind: "reframed_stalled_goal";
      wakeAction: ReturnType<typeof decideOmegaWakeAction>;
      goalTask: string;
      focusedTargets: string[];
    };

async function loadOmegaHeartbeatDecisionContext(params: {
  workspaceRoot: string;
  sessionKey: string;
  kernel?: Awaited<ReturnType<typeof loadOmegaSelfTimeKernel>>;
}) {
  const authority = await loadOpenSkynetOmegaRuntimeAuthority({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    includeWorldSnapshot: "urgent_maintenance",
  });
  const decisionContext = authority.decisionContext;
  const kernel = params.kernel ?? decisionContext.kernel;
  const wakeAction = decideOmegaWakeAction({ kernel });
  const shouldDispatchPrompt = decisionContext.shouldDispatchHeartbeatPrompt;
  const effectiveWakeAction: OmegaHeartbeatPromptWakeAction =
    shouldDispatchPrompt &&
    wakeAction.kind === "heartbeat_ok" &&
    decisionContext.controllerState?.selectedWorkItem?.queueKind === "maintenance"
      ? {
          kind: "maintain",
          reason: "executive_dispatch_selected_maintenance",
          selectedWorkItemId: decisionContext.controllerState.selectedWorkItem.id,
          selectedWorkItemDetail: decisionContext.controllerState.selectedWorkItem.detail,
          selectedAction: decisionContext.controllerState.dispatchPlan.selectedAction,
        }
      : wakeAction;

  return {
    kernel,
    wakeAction,
    effectiveWakeAction,
    wsp: decisionContext.wsp,
    stateAuthority: decisionContext.stateAuthority,
    controllerState: decisionContext.controllerState,
    operationalSummary: decisionContext.operationalSummary,
    driveSignal: decisionContext.policy.driveSignal,
    driveSignalSource: decisionContext.policy.driveSignalSource,
    shouldRunAutonomy: decisionContext.policy.shouldRunAutonomy,
    shouldDispatchPrompt,
    degradedComponents: decisionContext.degradedComponents,
  };
}

function deriveMaintenanceContractClassKey(workItemId?: string): string | undefined {
  if (!workItemId) {
    return undefined;
  }
  if (workItemId.startsWith("maintenance:agenda:")) {
    return workItemId.slice("maintenance:agenda:".length);
  }
  if (workItemId.startsWith("maintenance:failure:")) {
    return `failure:${workItemId.slice("maintenance:failure:".length)}`;
  }
  if (workItemId.startsWith("maintenance:stalled_progress:")) {
    return "initiative:stalled_progress";
  }
  return undefined;
}

export async function buildOmegaHeartbeatPrompt(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<string | undefined> {
  const {
    kernel,
    wakeAction,
    effectiveWakeAction,
    controllerState,
    driveSignal: sharedDriveSignal,
    shouldDispatchPrompt,
    degradedComponents,
  } = await loadOmegaHeartbeatDecisionContext(params);
  const engines = getOmegaHeartbeatEngineRegistry();

  if (
    degradedComponents.length > 0 &&
    wakeAction.kind === "heartbeat_ok" &&
    !shouldDispatchPrompt
  ) {
    const degradedNames = degradedComponents.map((entry) => entry.component).join(", ");
    return [
      "[OMEGA Degraded]",
      `Detected degraded components: ${degradedNames}`,
      "Treat missing subsystems as degraded state, not as evidence of calm or completion.",
      "Run only conservative inspection or maintenance. Do not invent new goals from partial state.",
      "",
      "If no user-facing update is needed after inspection, reply HEARTBEAT_OK.",
    ].join("\n");
  }

  if (kernel) {
    void engines.jepaEmpirical.logSample({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      kernel,
    });
  }

  if (wakeAction.kind === "heartbeat_ok" && !shouldDispatchPrompt) {
    if (kernel) {
      const engineSignals = engines.collectKernelSignals({
        kernel,
        minEntropyReduction: 0.15,
        maxThoughtConfidence: 0.8,
      });
      const hypothesisSignals = await engines.testUntestedHypotheses({
        workspaceRoot: params.workspaceRoot,
        maxHypothesesToTest: 2,
        correlationConfirmationThreshold: 0.1,
      });
      const scoredSignals = scoreOmegaEngineSignals([
        ...engineSignals.signals,
        ...hypothesisSignals.signals,
      ]);
      let driveSignal = mergeOmegaDriveSignalWithEngineScore({
        baseDriveSignal: sharedDriveSignal,
        engineScore: scoredSignals,
      });
      const sessionTimeline = await loadOmegaSessionTimeline(params);
      const jepaTension = parseJepaTensionFromKernelTimeline(sessionTimeline);
      driveSignal = enhanceDriveWithJepaTension(driveSignal, jepaTension);

      if (driveSignal.kind !== "idle") {
        const autonomousPrompt = buildAutonomousDirectivePrompt({ signal: driveSignal, kernel });
        if (autonomousPrompt) {
          return autonomousPrompt;
        }
      }

      void engines.continuousThinking.getStats();
    }
    return undefined;
  }

  if (!shouldDispatchPrompt) {
    return undefined;
  }

  const opTailForPrompt = await loadOmegaOperationalMemoryTail(params);
  const opSummaryForPrompt = summarizeOmegaOperationalMemory(opTailForPrompt);
  if (opSummaryForPrompt.recentStalledTurns >= 3 && opSummaryForPrompt.recentResolvedTurns === 0) {
    return undefined;
  }

  if (
    kernel &&
    (kernel.tension.failureStreak >= 2 || kernel.tension.repeatedFailureKinds.length >= 2)
  ) {
    const lines = [
      "[OMEGA Initiative Contract]",
      "The system has detected repeated failures without an active recovery goal.",
      "Run a probe_experiment: a minimal, isolated test to identify the root cause.",
      "",
      "SURGICAL EXPERIMENT CONSTRAINTS:",
      "- NO REPAIR: Do not fix the underlying issue. Only diagnose.",
      "- Scope: ≤2 files, ≤20 lines of change",
      "- Output: a falsifiable finding (success/failure with evidence)",
      `- Failure kinds observed: ${kernel.tension.repeatedFailureKinds.join(", ") || "unknown"}`,
    ];
    return lines.join("\n");
  }

  const lines = [
    "[OMEGA Wake]",
    "Use only verified session state; do not invent new tension.",
    `Wake action: ${effectiveWakeAction.kind}`,
    `Reason: ${effectiveWakeAction.reason}`,
  ];

  if (degradedComponents.length > 0) {
    lines.push(
      `Degraded Omega components: ${degradedComponents.map((entry) => entry.component).join(", ")}`,
    );
    lines.push(
      "Treat missing subsystems as degraded state, not as evidence of calm or completion.",
    );
  }

  if (controllerState?.dispatchPlan.shouldDispatchLlmTurn && controllerState.selectedWorkItem) {
    lines.push(`Executive action: ${controllerState.dispatchPlan.selectedAction}`);
    lines.push(`Executive work item: ${controllerState.selectedWorkItem.detail}`);
  }

  if (wakeAction.kind === "review_active_goal") {
    lines.push(`Active goal requiring follow-up: ${wakeAction.goalTask}`);
    lines.push("Prefer lightweight maintenance, diagnosis, or the next falsifiable step.");
  }

  if (wakeAction.kind === "resume_interrupted_goal") {
    lines.push(`Resume interrupted goal: ${wakeAction.goalTask}`);
    if (wakeAction.goalTargets.length > 0) {
      lines.push(`Remaining verified targets: ${wakeAction.goalTargets.join(" | ")}`);
    }
    if (wakeAction.errorKind) {
      lines.push(`Last verified failure: ${wakeAction.errorKind}`);
    }
    lines.push(`Preferred route: ${wakeAction.suggestedRoute}`);
    lines.push(`Failure streak: ${wakeAction.failureStreak}`);
    lines.push(
      "Resume the goal directly from persisted state. Do not ask the user to restate the task.",
    );
  }

  if (wakeAction.kind === "abort_interrupted_goal") {
    lines.push(`Abort interrupted goal: ${wakeAction.goalTask}`);
    if (wakeAction.goalTargets.length > 0) {
      lines.push(`Blocked verified targets: ${wakeAction.goalTargets.join(" | ")}`);
    }
    if (wakeAction.errorKind) {
      lines.push(`Last verified failure: ${wakeAction.errorKind}`);
    }
    lines.push(`Preferred route exhausted: ${wakeAction.suggestedRoute}`);
    lines.push(`Failure streak: ${wakeAction.failureStreak}`);
    lines.push(
      "Do not retry automatically. Escalate only if there is new evidence, a route change, or human input.",
    );
  }

  if (wakeAction.kind === "prune_stale_goals") {
    lines.push(`Stale goals to review/prune: ${wakeAction.goalTasks.join(" | ")}`);
    lines.push("Only mention stale work if it still matters operationally.");
  }

  if (wakeAction.kind === "prune_superseded_goals") {
    lines.push(`Superseded goals to prune: ${wakeAction.goalTasks.join(" | ")}`);
    lines.push(
      "Prefer silent cleanup when newer verified writes already superseded the blocked work.",
    );
  }

  if (wakeAction.kind === "focus_active_goal_targets") {
    lines.push(`Active goal: ${wakeAction.goalTask}`);
    lines.push(`Focus only on remaining targets: ${wakeAction.goalTargets.join(" | ")}`);
    lines.push(
      "Do not reopen already covered targets if newer verified writes already touched them.",
    );
  }

  if (wakeAction.kind === "prune_shadowed_goals") {
    lines.push(`Shadowed goals to prune: ${wakeAction.goalTasks.join(" | ")}`);
    lines.push(
      "Prefer the newer active subgoal when it already covers the remaining unresolved targets.",
    );
  }

  let taskToQuery = "";
  if ("goalTask" in effectiveWakeAction) {
    taskToQuery = effectiveWakeAction.goalTask;
  } else if ("goalTasks" in effectiveWakeAction && effectiveWakeAction.goalTasks.length > 0) {
    taskToQuery = effectiveWakeAction.goalTasks[0];
  } else if ("selectedWorkItemDetail" in effectiveWakeAction) {
    taskToQuery = effectiveWakeAction.selectedWorkItemDetail ?? "";
  }

  if (taskToQuery) {
    const relevantRules = await queryScienceBase({
      workspaceRoot: params.workspaceRoot,
      query: taskToQuery,
      maxRules: 3,
    });
    if (relevantRules.length > 0) {
      lines.push("");
      lines.push("--- EMPIRICAL KNOWLEDGE (SCIENCE_BASE.md RAG) ---");
      lines.push("The following rules were previously learned and verified for similar tasks:");
      for (const rule of relevantRules) {
        lines.push(rule);
      }
      lines.push("Apply these rules if they match the current context.");
    }
  }

  const wakeActionAny = effectiveWakeAction as unknown as {
    kind: string;
    selectedWorkItemId?: string;
  };
  const maintenanceContractClassKey =
    wakeActionAny.kind === "maintain"
      ? deriveMaintenanceContractClassKey(wakeActionAny.selectedWorkItemId)
      : undefined;
  if (maintenanceContractClassKey) {
    const classKey = maintenanceContractClassKey;
    const contract = deriveOmegaAgendaExecutionContract(classKey);
    lines.push("");
    lines.push("[OMEGA Initiative Contract]");
    lines.push(`Problem class: ${classKey}`);
    lines.push(`Hypothesis: ${contract.hypothesis}`);
    lines.push(`Deliverable: ${contract.deliverable}`);
    lines.push(`Success criteria: ${contract.successCriteria}`);
    if (contract.experimentMode === "probe_experiment") {
      lines.push("Experiment mode: probe_experiment (Isolated diagnosis)");
    }
    const evidence = controllerState?.worldSnapshot?.relevantMemories.find((entry) =>
      classKey.startsWith("failure:")
        ? entry.errorKind === classKey.slice("failure:".length)
        : true,
    );
    if (evidence) {
      lines.push(`Evidence task: ${evidence.task}`);
      if (evidence.targets.length > 0) {
        lines.push(`Evidence targets: ${evidence.targets.join(" | ")}`);
      }
      if (evidence.observedChangedFiles.length > 0) {
        lines.push(`Evidence writes: ${evidence.observedChangedFiles.join(" | ")}`);
      }
    }
  }

  lines.push("");
  lines.push("If no user-facing update is needed after inspection, reply HEARTBEAT_OK.");
  return lines.join("\n");
}

export async function applyOmegaHeartbeatExecutiveAction(params: {
  workspaceRoot: string;
  sessionKey: string;
  requesterAgentIdOverride?: string;
}): Promise<OmegaHeartbeatExecutiveResult> {
  const { kernel, wakeAction, operationalSummary } =
    await loadOmegaHeartbeatDecisionContext(params);
  const correctiveControl = deriveOmegaHeartbeatCorrectiveControl({
    wakeAction,
    operationalSummary,
  });

  if (correctiveControl.kind === "prune_stale_goals") {
    const pruned = await pruneStaleOmegaGoals(params);
    return {
      kind: "pruned_stale_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (correctiveControl.kind === "prune_superseded_goals") {
    const pruned = await pruneSupersededOmegaGoals(params);
    return {
      kind: "pruned_superseded_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (correctiveControl.kind === "focus_active_goal_targets") {
    const focused = await focusActiveOmegaGoalTargets(params);
    return {
      kind: "focused_active_goal_targets",
      wakeAction,
      focusedGoalTask: focused.focusedGoalTask,
      focusedTargets: focused.focusedTargets,
    };
  }

  if (correctiveControl.kind === "prune_shadowed_goals") {
    const pruned = await pruneShadowedOmegaGoals(params);
    return {
      kind: "pruned_shadowed_goals",
      wakeAction,
      prunedGoalTasks: pruned.prunedGoalTasks,
    };
  }

  if (correctiveControl.kind === "abort_interrupted_goal") {
    return {
      kind: "aborted_interrupted_goal",
      wakeAction: correctiveControl.wakeAction,
      goalTask: correctiveControl.wakeAction.goalTask,
      failureStreak: correctiveControl.wakeAction.failureStreak,
      errorKind: correctiveControl.wakeAction.errorKind,
    };
  }

  if (correctiveControl.kind === "resume_interrupted_goal") {
    const resumed = await resumeInterruptedOmegaGoal({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      requesterAgentIdOverride: params.requesterAgentIdOverride,
    });
    if (resumed.kind === "resumed_interrupted_goal") {
      return {
        kind: "resumed_interrupted_goal",
        wakeAction,
        route: resumed.route,
        status: resumed.execution.ok ? "ok" : resumed.execution.status,
        errorKind: resumed.execution.ok ? undefined : resumed.execution.errorKind,
        observedChangedFiles: resumed.execution.observedChangedFiles,
      };
    }
  }

  if (correctiveControl.kind === "reframe_stalled_goal" && kernel?.activeGoalId) {
    const activeGoal = kernel.goals.find(
      (g) => g.id === kernel.activeGoalId && g.status === "active",
    );
    if (activeGoal && activeGoal.targets.length > 0) {
      const focused = await focusActiveOmegaGoalTargets({
        ...params,
        learnedConstraints: ["reframe_before_retry", "narrow_to_unresolved_targets"],
      });
      const residualTargets =
        focused.focusedTargets.length > 0 ? focused.focusedTargets : activeGoal.targets;
      return {
        kind: "reframed_stalled_goal",
        wakeAction,
        goalTask: activeGoal.task,
        focusedTargets: residualTargets,
      };
    }
  }

  return {
    kind: "none",
    wakeAction,
  };
}

export async function runOneHeartbeatCycle(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<void> {
  const prompt = await buildOmegaHeartbeatPrompt(params);
  const now = new Date().toISOString();
  if (prompt) {
    console.log(`[${now}] [OMEGA LOOP] 📝 Prompt generado (${prompt.length} chars)`);
  } else {
    console.log(`[${now}] [OMEGA LOOP] ✓ Sin trabajo. Estado OK.`);
  }
  const executiveResult = await applyOmegaHeartbeatExecutiveAction(params);
  console.log(`[${now}] [OMEGA LOOP] Resultado: ${executiveResult.kind}`);
}

export async function runAutonomousLoop(
  params: { workspaceRoot: string; sessionKey: string },
  intervalMinutes = 5,
): Promise<never> {
  const intervalMs = intervalMinutes * 60 * 1000;
  let cycleCount = 0;
  const log = (msg: string) => console.log(`[${new Date().toISOString()}] [OMEGA LOOP] ${msg}`);

  log(`🚀 LOOP AUTÓNOMO ACTIVO (cada ${intervalMinutes} min)`);
  log(`Workspace: ${params.workspaceRoot} | Session: ${params.sessionKey}`);

  while (true) {
    cycleCount++;
    const cycleStart = Date.now();

    try {
      log(`\n━━━ CICLO #${cycleCount} ━━━`);
      const execResult = await applyOmegaHeartbeatExecutiveAction(params);
      if (execResult.kind !== "none") {
        log(`✅ Gobernanza: ${execResult.kind}`);
      }
      const autonomousCycle = await runAutonomousCycle(params);
      if (autonomousCycle) {
        log(`🤖 Drive [${autonomousCycle.driveKind}]: ${JSON.stringify(autonomousCycle.action)}`);
      } else {
        log(`💤 Drives: idle`);
      }
      const prompt = await buildOmegaHeartbeatPrompt(params);
      if (prompt) {
        log(`🧠 Prompt listo (${prompt.length} chars): ${prompt.split("\n")[0]}`);
      } else {
        log(`✓ Sin trabajo pendiente. Estado OK.`);
      }

      const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(2);
      log(`✓ Ciclo #${cycleCount} completado en ${elapsed}s`);
    } catch (error) {
      log(
        `❌ Error en ciclo #${cycleCount}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    log(`⏰ Próximo ciclo en ${intervalMinutes} min...`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
