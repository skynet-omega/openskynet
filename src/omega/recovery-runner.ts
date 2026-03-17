import { spawnSubagentDirect } from "../agents/subagent-spawn.js";
import { recordOmegaRouteMetrics } from "./empirical-metrics.js";
import { buildOmegaInteractionPrompt } from "./interaction-model.js";
import {
  deriveOmegaInterruptedGoalRecovery,
  OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK,
} from "./recovery.js";
import { loadOmegaSelfTimeKernel, recordOmegaSessionOutcome } from "./session-context.js";
import {
  awaitValidatedOmegaSessionRun,
  runValidatedOmegaSessionTask,
  type OmegaSessionTaskFailure,
  type OmegaSessionTaskSuccess,
} from "./session-task.js";

const DEFAULT_OMEGA_AUTONOMOUS_RECOVERY_TIMEOUT_MS = 60_000;

type OmegaRecoveryValidation = {
  expectsJson: boolean;
  expectedKeys: string[];
  expectedPaths: string[];
};

function buildRecoveryValidation(params: {
  recovery: NonNullable<ReturnType<typeof deriveOmegaInterruptedGoalRecovery>>;
}): OmegaRecoveryValidation {
  return {
    expectsJson: params.recovery.expectsJson,
    expectedKeys: params.recovery.requiredKeys,
    expectedPaths: params.recovery.remainingTargets,
  };
}

async function mirrorRecoveryOutcomeToParentSession(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  validation: OmegaRecoveryValidation;
  route: "omega_delegate" | "sessions_spawn";
  execution: OmegaSessionTaskSuccess | OmegaSessionTaskFailure;
}) {
  await recordOmegaSessionOutcome({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: params.task,
    validation: params.validation,
    outcome: {
      status: params.execution.ok ? "ok" : params.execution.status,
      errorKind: params.execution.ok ? undefined : params.execution.errorKind,
      observedChangedFiles: params.execution.observedChangedFiles,
      structuredOk: params.execution.validation?.structured?.ok,
      writeOk: params.execution.validation?.write?.ok,
    },
    reply: params.execution.reply,
    execution: {
      route: params.route,
      runId: params.execution.runId,
      resumedFromKernel: true,
      trigger: "heartbeat",
    },
    recordEmpiricalMetrics: false,
  });
}

export type OmegaAutonomousRecoveryResult =
  | {
      kind: "none";
    }
  | {
      kind: "skipped";
      reason: "failure_streak_too_high";
      failureStreak: number;
      recovery: NonNullable<ReturnType<typeof deriveOmegaInterruptedGoalRecovery>>;
    }
  | {
      kind: "resumed_interrupted_goal";
      route: "omega_delegate" | "sessions_spawn";
      recovery: NonNullable<ReturnType<typeof deriveOmegaInterruptedGoalRecovery>>;
      execution: OmegaSessionTaskSuccess | OmegaSessionTaskFailure;
    };

export async function resumeInterruptedOmegaGoal(params: {
  workspaceRoot: string;
  sessionKey: string;
  requesterAgentIdOverride?: string;
  timeoutMs?: number;
}): Promise<OmegaAutonomousRecoveryResult> {
  const kernel = await loadOmegaSelfTimeKernel({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
  });
  const recovery = deriveOmegaInterruptedGoalRecovery({ kernel });
  if (!recovery) {
    return { kind: "none" };
  }
  if (recovery.failureStreak > OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK) {
    return {
      kind: "skipped",
      reason: "failure_streak_too_high",
      failureStreak: recovery.failureStreak,
      recovery,
    };
  }

  const timeoutMs = Math.max(1_000, params.timeoutMs ?? DEFAULT_OMEGA_AUTONOMOUS_RECOVERY_TIMEOUT_MS);
  const timeoutSeconds = Math.max(1, Math.floor(timeoutMs / 1000));
  const validation = buildRecoveryValidation({ recovery });

  if (recovery.suggestedRoute === "omega_delegate") {
    const execution = await runValidatedOmegaSessionTask({
      sendParams: {
        message: recovery.resumeTask,
        sessionKey: params.sessionKey,
      },
      sessionKey: params.sessionKey,
      timeoutMs,
      workspaceRoot: params.workspaceRoot,
      validation,
      execution: {
        route: "omega_delegate",
        trigger: "heartbeat",
      },
    });
    await recordOmegaRouteMetrics({
      workspaceRoot: params.workspaceRoot,
      route: "omega_delegate",
      llmCallsEstimated: 1,
    }).catch(() => undefined);
    return {
      kind: "resumed_interrupted_goal",
      route: "omega_delegate",
      recovery,
      execution,
    };
  }

  const omegaInteractionPrompt = await buildOmegaInteractionPrompt({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: recovery.goalTask,
    validation,
    includeTimeline: false,
  });
  const result = await spawnSubagentDirect(
    {
      task: recovery.resumeTask,
      runTimeoutSeconds: timeoutSeconds,
      mode: "run",
      expectsCompletionMessage: false,
      announceOnCompletion: false,
      extraSystemPrompt: omegaInteractionPrompt || undefined,
    },
    {
      agentSessionKey: params.sessionKey,
      requesterAgentIdOverride: params.requesterAgentIdOverride,
      workspaceDir: params.workspaceRoot,
    },
  );

  if (result.status !== "accepted" || !result.childSessionKey || !result.runId) {
    const failure: OmegaSessionTaskFailure = {
      ok: false,
      runId: result.runId ?? "spawn_failed",
      status: "error",
      error: result.error ?? "spawn failed",
    };
    await mirrorRecoveryOutcomeToParentSession({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      task: recovery.goalTask,
      validation,
      route: "sessions_spawn",
      execution: failure,
    });
    await recordOmegaRouteMetrics({
      workspaceRoot: params.workspaceRoot,
      route: "sessions_spawn",
      llmCallsEstimated: 1,
    }).catch(() => undefined);
    return {
      kind: "resumed_interrupted_goal",
      route: "sessions_spawn",
      recovery,
      execution: failure,
    };
  }

  const execution = await awaitValidatedOmegaSessionRun({
    runId: result.runId,
    task: recovery.goalTask,
    sessionKey: result.childSessionKey,
    timeoutMs,
    workspaceRoot: params.workspaceRoot,
    validation,
    execution: {
      route: "sessions_spawn",
      runId: result.runId,
      resumedFromKernel: true,
      trigger: "heartbeat",
    },
  });
  await mirrorRecoveryOutcomeToParentSession({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: recovery.goalTask,
    validation,
    route: "sessions_spawn",
    execution,
  });
  await recordOmegaRouteMetrics({
    workspaceRoot: params.workspaceRoot,
    route: "sessions_spawn",
    llmCallsEstimated: 1,
  }).catch(() => undefined);
  return {
    kind: "resumed_interrupted_goal",
    route: "sessions_spawn",
    recovery,
    execution,
  };
}
