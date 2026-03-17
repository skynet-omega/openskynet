import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import {
  decideOmegaFrontalAction,
  deriveOmegaInterruptedGoalRecovery,
  decideOmegaWakeAction,
  loadOmegaSelfTimeKernel,
  loadOmegaSessionSelfState,
  loadOmegaSessionTimeline,
  recordOmegaRouteMetrics,
  recordOmegaSessionOutcome,
  taskMatchesOmegaInterruptedGoalRecovery,
} from "../../omega/index.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { SpawnedToolContext } from "../spawned-context.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";
import { createOmegaDelegateTool } from "./omega-delegate-tool.js";
import { OMEGA_VALIDATION_SCHEMA_FIELDS, readOmegaValidationToolParams } from "./omega-validation.js";
import { createSessionsSendTool } from "./sessions-send-tool.js";
import { createSessionsSpawnTool } from "./sessions-spawn-tool.js";

const OMEGA_WORK_RUNTIMES = ["subagent", "acp"] as const;

const OmegaWorkToolSchema = Type.Object({
  task: Type.String(),
  sessionKey: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  agentId: Type.Optional(Type.String()),
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  isolated: Type.Optional(Type.Boolean()),
  thread: Type.Optional(Type.Boolean()),
  runtime: Type.Optional(Type.Union(OMEGA_WORK_RUNTIMES.map((item) => Type.Literal(item)))),
  ...OMEGA_VALIDATION_SCHEMA_FIELDS,
});

type OmegaWorkRoute = "frontal_cache" | "omega_delegate" | "sessions_spawn" | "sessions_send";
const OMEGA_CORRECTIVE_RETRY_ERROR_KINDS = new Set([
  "invalid_structured_result",
  "target_not_touched",
  "missing_target_writes",
]);

function shouldRunOmegaCorrectiveRetry(params: {
  route: OmegaWorkRoute;
  expectedPaths: string[];
  details: Record<string, unknown>;
}): boolean {
  if (params.route !== "omega_delegate") {
    return false;
  }
  if (params.expectedPaths.length === 0) {
    return false;
  }
  return (
    params.details.status === "error" &&
    typeof params.details.errorKind === "string" &&
    OMEGA_CORRECTIVE_RETRY_ERROR_KINDS.has(params.details.errorKind)
  );
}

function buildOmegaCorrectiveRetryTask(params: {
  task: string;
  expectedKeys: string[];
  expectedPaths: string[];
  details: Record<string, unknown>;
}): string {
  const errorKind =
    typeof params.details.errorKind === "string" ? params.details.errorKind : "validated_failure";
  const lines = [
    params.task,
    "",
    "[OMEGA corrective retry]",
    `The previous verified attempt failed with: ${errorKind}.`,
    "Do not ask for more reading, planning, or clarification. Execute the fix now.",
    "Return exactly one JSON object and only claim success after the required files were actually modified on disk.",
  ];
  if (params.expectedPaths.length > 0) {
    lines.push(`Required target paths: ${params.expectedPaths.join(", ")}`);
  }
  if (params.expectedKeys.length > 0) {
    lines.push(`Required JSON keys: ${params.expectedKeys.join(", ")}`);
  }
  return lines.join("\n");
}

async function resolveOmegaWakeAction(params: {
  workspaceRoot: string;
  sessionKey: string;
}) {
  const kernel = await loadOmegaSelfTimeKernel(params);
  return decideOmegaWakeAction({ kernel });
}

async function mirrorSpawnOutcomeToParentSession(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  validation: {
    expectsJson: boolean;
    expectedKeys: string[];
    expectedPaths: string[];
  };
  details: Record<string, unknown>;
  execution?: {
    route: OmegaWorkRoute;
    runId?: string;
    resumedFromKernel?: boolean;
    trigger?: "direct" | "heartbeat";
  };
}) {
  const statusValue = params.details.status;
  if (statusValue !== "ok" && statusValue !== "error" && statusValue !== "timeout") {
    return;
  }
  await recordOmegaSessionOutcome({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: params.task,
    validation: params.validation,
    outcome: {
      status: statusValue,
      errorKind:
        typeof params.details.errorKind === "string" ? params.details.errorKind : undefined,
      observedChangedFiles: Array.isArray(params.details.observedChangedFiles)
        ? params.details.observedChangedFiles.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          )
        : undefined,
      structuredOk:
        params.details.validation &&
        typeof params.details.validation === "object" &&
        "structured" in params.details.validation &&
        params.details.validation.structured &&
        typeof params.details.validation.structured === "object" &&
        "ok" in params.details.validation.structured
          ? params.details.validation.structured.ok === true
          : undefined,
      writeOk:
        params.details.validation &&
        typeof params.details.validation === "object" &&
        "write" in params.details.validation &&
        params.details.validation.write &&
        typeof params.details.validation.write === "object" &&
        "ok" in params.details.validation.write
          ? params.details.validation.write.ok === true
          : undefined,
    },
    reply: typeof params.details.reply === "string" ? params.details.reply : undefined,
    execution: params.execution,
    recordEmpiricalMetrics: false,
  });
}

function decideOmegaWorkRoute(params: {
  isolated: boolean;
  runtime?: string;
  requiresValidation: boolean;
  expectedPathCount: number;
  interactionKind?: string;
  timeoutSeconds?: number;
}): OmegaWorkRoute {
  if (params.isolated || params.runtime === "acp") {
    return "sessions_spawn";
  }
  if (params.expectedPathCount > 1) {
    return "sessions_spawn";
  }
  if (params.requiresValidation) {
    return "omega_delegate";
  }
  if (
    (params.interactionKind === "verification_request" ||
      params.interactionKind === "analysis_request" ||
      params.interactionKind === "corrective_feedback" ||
      params.interactionKind === "mixed_turn") &&
    typeof params.timeoutSeconds === "number" &&
    params.timeoutSeconds > 0
  ) {
    return "omega_delegate";
  }
  return "sessions_send";
}

export function createOmegaWorkTool(
  opts?: {
    agentSessionKey?: string;
    agentChannel?: GatewayMessageChannel;
    agentAccountId?: string;
    agentTo?: string;
    agentThreadId?: string | number;
    requesterAgentIdOverride?: string;
    sandboxed?: boolean;
    config?: OpenClawConfig;
    workspaceDir?: string;
    spawnWorkspaceDir?: string;
  } & SpawnedToolContext,
): AnyAgentTool {
  const omegaDelegate = createOmegaDelegateTool(opts);
  const sessionsSend = createSessionsSendTool(opts);
  const sessionsSpawn = createSessionsSpawnTool({
    ...opts,
    workspaceDir: opts?.spawnWorkspaceDir ?? opts?.workspaceDir,
  });

  return {
    label: "Omega Work",
    name: "omega_work",
    description:
      "Route a task through the most appropriate OMEGA path: validated direct delegation, isolated subagent run, or plain inter-session send.",
    parameters: OmegaWorkToolSchema,
    execute: async (toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const task = readStringParam(params, "task", { required: true });
      const sessionKey = readStringParam(params, "sessionKey");
      const label = readStringParam(params, "label");
      const agentId = readStringParam(params, "agentId");
      const runtime = readStringParam(params, "runtime");
      const resolvedSessionKey = sessionKey ?? opts?.agentSessionKey ?? "main";
      const timeoutSeconds =
        typeof params.timeoutSeconds === "number" && Number.isFinite(params.timeoutSeconds)
          ? Math.max(0, Math.floor(params.timeoutSeconds))
          : undefined;
      const isolated = params.isolated === true;
      const thread = params.thread === true;
      const validation = readOmegaValidationToolParams(params);
      const sessionTimeline = await loadOmegaSessionTimeline({
        workspaceRoot: opts?.workspaceDir ?? process.cwd(),
        sessionKey: resolvedSessionKey,
      });
      const sessionState = await loadOmegaSessionSelfState({
        workspaceRoot: opts?.workspaceDir ?? process.cwd(),
        sessionKey: resolvedSessionKey,
      });
      const sessionKernel = await loadOmegaSelfTimeKernel({
        workspaceRoot: opts?.workspaceDir ?? process.cwd(),
        sessionKey: resolvedSessionKey,
      });
      const interruptedRecovery = deriveOmegaInterruptedGoalRecovery({
        kernel: sessionKernel,
      });
      const matchedRecovery = taskMatchesOmegaInterruptedGoalRecovery({
        task,
        expectedPaths: validation.expectedPaths,
        expectedKeys: validation.expectedKeys,
        recovery: interruptedRecovery,
      })
        ? interruptedRecovery
        : undefined;
      const effectiveValidation = {
        expectsJson:
          validation.expectsJson ||
          (validation.expectedKeys.length === 0 &&
            (matchedRecovery?.requiredKeys.length ?? 0) > 0),
        expectedKeys:
          validation.expectedKeys.length > 0
            ? validation.expectedKeys
            : matchedRecovery?.requiredKeys ?? [],
        expectedPaths:
          validation.expectedPaths.length > 0
            ? validation.expectedPaths
            : matchedRecovery?.remainingTargets ?? [],
      };
      const requiresValidation =
        effectiveValidation.expectsJson ||
        effectiveValidation.expectedKeys.length > 0 ||
        effectiveValidation.expectedPaths.length > 0;
      const routedTask = matchedRecovery?.resumeTask ?? task;
      const goalTask = matchedRecovery?.goalTask ?? task;
      const frontal = decideOmegaFrontalAction({
        task: goalTask,
        validation: {
          expectsJson: effectiveValidation.expectsJson,
          expectedKeys: effectiveValidation.expectedKeys,
          expectedPaths: effectiveValidation.expectedPaths,
        },
        timeline: sessionTimeline,
        state: sessionState,
        kernel: sessionKernel,
      });
      const interaction = frontal.interaction;

      if (frontal.kind === "reuse_verified_result") {
        await recordOmegaRouteMetrics({
          workspaceRoot: opts?.workspaceDir ?? process.cwd(),
          route: "frontal_cache",
          llmCallsEstimated: 0,
          llmCallsSaved: 1,
        }).catch(() => undefined);
        const wakeAction = await resolveOmegaWakeAction({
          workspaceRoot: opts?.workspaceDir ?? process.cwd(),
          sessionKey: resolvedSessionKey,
        });
        return jsonResult({
          route: "frontal_cache",
          interactionKind: interaction.kind,
          status: "ok",
          cached: true,
          cachedAt: frontal.cachedAt,
          llmCallsSaved: 1,
          reply: frontal.cachedReply,
          tension: frontal.tension,
          wakeAction,
        });
      }

      const route = decideOmegaWorkRoute({
        isolated,
        runtime,
        requiresValidation,
        expectedPathCount: effectiveValidation.expectedPaths.length,
        interactionKind: interaction.kind,
        timeoutSeconds,
      });
      let effectiveRoute =
        frontal.kind === "escalate_isolated_repair" ? "sessions_spawn" : route;
      if (matchedRecovery?.suggestedRoute === "sessions_spawn") {
        effectiveRoute = "sessions_spawn";
      } else if (
        matchedRecovery?.suggestedRoute === "omega_delegate" &&
        effectiveRoute === "sessions_send"
      ) {
        effectiveRoute = "omega_delegate";
      }

      if (effectiveRoute === "sessions_spawn") {
        const result = await sessionsSpawn.execute(toolCallId, {
          task: routedTask,
          ...(label ? { label } : {}),
          ...(agentId ? { agentId } : {}),
          ...(runtime ? { runtime } : {}),
          ...(typeof timeoutSeconds === "number" ? { runTimeoutSeconds: timeoutSeconds } : {}),
          ...(thread ? { thread: true } : {}),
          ...(effectiveValidation.expectsJson ? { expectsJson: true } : {}),
          ...(effectiveValidation.expectedKeys.length > 0
            ? { expectedKeys: effectiveValidation.expectedKeys }
            : {}),
          ...(effectiveValidation.expectedPaths.length > 0
            ? { expectedPaths: effectiveValidation.expectedPaths }
            : {}),
        });
        await mirrorSpawnOutcomeToParentSession({
          workspaceRoot: opts?.workspaceDir ?? process.cwd(),
          sessionKey: resolvedSessionKey,
          task: goalTask,
          validation: {
            expectsJson: effectiveValidation.expectsJson,
            expectedKeys: effectiveValidation.expectedKeys,
            expectedPaths: effectiveValidation.expectedPaths,
          },
          details: (result.details ?? {}) as Record<string, unknown>,
          execution: {
            route: "sessions_spawn",
            runId:
              typeof (result.details as Record<string, unknown> | undefined)?.runId === "string"
                ? ((result.details as Record<string, unknown>).runId as string)
                : undefined,
            resumedFromKernel: matchedRecovery !== undefined,
            trigger: "direct",
          },
        });
        const wakeAction = await resolveOmegaWakeAction({
          workspaceRoot: opts?.workspaceDir ?? process.cwd(),
          sessionKey: resolvedSessionKey,
        });
        await recordOmegaRouteMetrics({
          workspaceRoot: opts?.workspaceDir ?? process.cwd(),
          route: "sessions_spawn",
          llmCallsEstimated: 1,
        }).catch(() => undefined);
        return jsonResult({
          route: effectiveRoute,
          interactionKind: interaction.kind,
          tension: frontal.tension,
          wakeAction,
          ...(frontal.kind === "escalate_isolated_repair"
            ? {
                escalatedByOmega: true,
                escalationReason: frontal.reason,
              }
            : {}),
          ...(matchedRecovery
            ? {
                resumedFromKernel: true,
                recoveryReason: matchedRecovery.reason,
                recoverySuggestedRoute: matchedRecovery.suggestedRoute,
              }
            : {}),
          ...(result.details as Record<string, unknown>),
        });
      }

      if (effectiveRoute === "omega_delegate") {
        const result = await omegaDelegate.execute(toolCallId, {
          message: routedTask,
          sessionKey: resolvedSessionKey,
          ...(label ? { label } : {}),
          ...(agentId ? { agentId } : {}),
          ...(typeof timeoutSeconds === "number" ? { timeoutSeconds } : {}),
          ...(effectiveValidation.expectsJson ? { expectsJson: true } : {}),
          ...(effectiveValidation.expectedKeys.length > 0
            ? { expectedKeys: effectiveValidation.expectedKeys }
            : {}),
          ...(effectiveValidation.expectedPaths.length > 0
            ? { expectedPaths: effectiveValidation.expectedPaths }
            : {}),
        });
        const wakeAction = await resolveOmegaWakeAction({
          workspaceRoot: opts?.workspaceDir ?? process.cwd(),
          sessionKey: resolvedSessionKey,
        });
        await recordOmegaRouteMetrics({
          workspaceRoot: opts?.workspaceDir ?? process.cwd(),
          route: "omega_delegate",
          llmCallsEstimated: 1,
        }).catch(() => undefined);
        const delegateDetails = (result.details ?? {}) as Record<string, unknown>;
        if (
          shouldRunOmegaCorrectiveRetry({
            route: effectiveRoute,
            expectedPaths: effectiveValidation.expectedPaths,
            details: delegateDetails,
          })
        ) {
          const retryTask = buildOmegaCorrectiveRetryTask({
            task: goalTask,
            expectedKeys: effectiveValidation.expectedKeys,
            expectedPaths: effectiveValidation.expectedPaths,
            details: delegateDetails,
          });
          const retryResult = await sessionsSpawn.execute(toolCallId, {
            task: retryTask,
            ...(label ? { label } : {}),
            ...(agentId ? { agentId } : {}),
            ...(typeof timeoutSeconds === "number" ? { runTimeoutSeconds: timeoutSeconds } : {}),
            ...(effectiveValidation.expectsJson ? { expectsJson: true } : {}),
            ...(effectiveValidation.expectedKeys.length > 0
              ? { expectedKeys: effectiveValidation.expectedKeys }
              : {}),
            ...(effectiveValidation.expectedPaths.length > 0
              ? { expectedPaths: effectiveValidation.expectedPaths }
              : {}),
          });
          await mirrorSpawnOutcomeToParentSession({
            workspaceRoot: opts?.workspaceDir ?? process.cwd(),
            sessionKey: resolvedSessionKey,
            task: goalTask,
            validation: {
              expectsJson: effectiveValidation.expectsJson,
              expectedKeys: effectiveValidation.expectedKeys,
              expectedPaths: effectiveValidation.expectedPaths,
            },
            details: (retryResult.details ?? {}) as Record<string, unknown>,
            execution: {
              route: "sessions_spawn",
              runId:
                typeof (retryResult.details as Record<string, unknown> | undefined)?.runId === "string"
                  ? ((retryResult.details as Record<string, unknown>).runId as string)
                  : undefined,
              trigger: "direct",
            },
          });
          const retryWakeAction = await resolveOmegaWakeAction({
            workspaceRoot: opts?.workspaceDir ?? process.cwd(),
            sessionKey: resolvedSessionKey,
          });
          await recordOmegaRouteMetrics({
            workspaceRoot: opts?.workspaceDir ?? process.cwd(),
            route: "sessions_spawn",
            llmCallsEstimated: 1,
          }).catch(() => undefined);
          return jsonResult({
            route: "sessions_spawn",
            initialRoute: effectiveRoute,
            interactionKind: interaction.kind,
            tension: frontal.tension,
            wakeAction: retryWakeAction,
            retriedByOmega: true,
            retryReason: delegateDetails.errorKind,
            ...(matchedRecovery
              ? {
                  resumedFromKernel: true,
                  recoveryReason: matchedRecovery.reason,
                  recoverySuggestedRoute: matchedRecovery.suggestedRoute,
                }
              : {}),
            ...(retryResult.details as Record<string, unknown>),
          });
        }
        return jsonResult({
          route: effectiveRoute,
          interactionKind: interaction.kind,
          tension: frontal.tension,
          wakeAction,
          ...(matchedRecovery
            ? {
                resumedFromKernel: true,
                recoveryReason: matchedRecovery.reason,
                recoverySuggestedRoute: matchedRecovery.suggestedRoute,
              }
            : {}),
          ...delegateDetails,
        });
      }

      const result = await sessionsSend.execute(toolCallId, {
        message: routedTask,
        sessionKey: resolvedSessionKey,
        ...(label ? { label } : {}),
        ...(agentId ? { agentId } : {}),
        ...(typeof timeoutSeconds === "number" ? { timeoutSeconds } : {}),
      });
      const wakeAction = await resolveOmegaWakeAction({
        workspaceRoot: opts?.workspaceDir ?? process.cwd(),
        sessionKey: resolvedSessionKey,
      });
      await recordOmegaRouteMetrics({
        workspaceRoot: opts?.workspaceDir ?? process.cwd(),
        route: "sessions_send",
        llmCallsEstimated: 1,
      }).catch(() => undefined);
      return jsonResult({
        route: effectiveRoute,
        interactionKind: interaction.kind,
        tension: frontal.tension,
        wakeAction,
        ...(matchedRecovery
          ? {
              resumedFromKernel: true,
              recoveryReason: matchedRecovery.reason,
              recoverySuggestedRoute: matchedRecovery.suggestedRoute,
            }
          : {}),
        ...(result.details as Record<string, unknown>),
      });
    },
  };
}
