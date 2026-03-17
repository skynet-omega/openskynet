import crypto from "node:crypto";
import { callGateway } from "../gateway/call.js";
import { readLatestAssistantReply } from "../agents/tools/agent-step.js";
import { collectObservedWriteChanges, createObservedWriteBaseline } from "./observed-write.js";
import {
  recordOmegaSessionOutcome,
  summarizeValidationOutcome,
  type OmegaSessionValidationSnapshot,
} from "./session-context.js";
import type { OmegaTaskTransactionExecutionSnapshot } from "./task-transaction.js";
import { validateObservedWrite, validateStructuredOmegaResult } from "./validator.js";

export type OmegaSessionTaskValidationSummary = {
  structured?: ReturnType<typeof validateStructuredOmegaResult>;
  write?: ReturnType<typeof validateObservedWrite>;
};

export type OmegaSessionTaskValidationRequest = {
  expectsJson?: boolean;
  expectedKeys?: string[];
  expectedPaths?: string[];
};

export type OmegaSessionTaskSuccess = {
  ok: true;
  runId: string;
  reply?: string;
  observedChangedFiles?: string[];
  validation?: OmegaSessionTaskValidationSummary;
};

export type OmegaSessionTaskFailure = {
  ok: false;
  runId: string;
  status: "error" | "timeout";
  error: string;
  errorKind?: string;
  reply?: string;
  observedChangedFiles?: string[];
  validation?: OmegaSessionTaskValidationSummary;
};

async function startOmegaAgentRun(params: {
  runId: string;
  sendParams: Record<string, unknown>;
  sessionKey: string;
}): Promise<
  | { ok: true; runId: string }
  | { ok: false; status: "error"; runId: string; error: string }
> {
  try {
    const response = await callGateway<{ runId?: string }>({
      method: "agent",
      params: params.sendParams,
      timeoutMs: 10_000,
    });
    return {
      ok: true,
      runId: typeof response?.runId === "string" && response.runId ? response.runId : params.runId,
    };
  } catch (err) {
    return {
      ok: false,
      status: "error",
      runId: params.runId,
      error: err instanceof Error ? err.message : typeof err === "string" ? err : "error",
    };
  }
}

function stringifyOmegaTask(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  if (typeof value === "object") {
    const textCandidate =
      "text" in value && typeof (value as { text?: unknown }).text === "string"
        ? (value as { text: string }).text
        : undefined;
    if (textCandidate) {
      return textCandidate;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "[unserializable_message]";
    }
  }
  return String(value);
}

export async function awaitValidatedOmegaSessionRun(params: {
  runId: string;
  task: string;
  sessionKey: string;
  timeoutMs: number;
  workspaceRoot: string;
  validation?: OmegaSessionTaskValidationRequest;
  execution?: OmegaTaskTransactionExecutionSnapshot;
}): Promise<OmegaSessionTaskSuccess | OmegaSessionTaskFailure> {
  const requestedValidation = params.validation ?? {};
  const expectedKeys = requestedValidation.expectedKeys ?? [];
  const expectedPaths = requestedValidation.expectedPaths ?? [];
  const expectsJson = requestedValidation.expectsJson === true;
  const validationSnapshot: OmegaSessionValidationSnapshot = {
    expectsJson,
    expectedKeys,
    expectedPaths,
  };
  const observedWriteBaseline =
    expectedPaths.length > 0
      ? await createObservedWriteBaseline({
          workspaceRoot: params.workspaceRoot,
          expectedPaths,
        })
      : null;

  try {
    const wait = await callGateway<{ status?: string; error?: string }>({
      method: "agent.wait",
      params: {
        runId: params.runId,
        timeoutMs: params.timeoutMs,
      },
      timeoutMs: params.timeoutMs + 2000,
    });
    const waitStatus = typeof wait?.status === "string" ? wait.status : undefined;
    const waitError = typeof wait?.error === "string" ? wait.error : undefined;
    if (waitStatus === "timeout") {
      await recordOmegaSessionOutcome({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        task: params.task,
        validation: validationSnapshot,
        outcome: {
          status: "timeout",
        },
        execution: {
          ...params.execution,
          runId: params.execution?.runId ?? params.runId,
        },
      }).catch(() => undefined);
      return {
        ok: false,
        runId: params.runId,
        status: "timeout",
        error: waitError ?? "agent timeout",
      };
    }
    if (waitStatus === "error") {
      await recordOmegaSessionOutcome({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        task: params.task,
        validation: validationSnapshot,
        outcome: {
          status: "error",
        },
        execution: {
          ...params.execution,
          runId: params.execution?.runId ?? params.runId,
        },
      }).catch(() => undefined);
      return {
        ok: false,
        runId: params.runId,
        status: "error",
        error: waitError ?? "agent error",
      };
    }
  } catch (err) {
    const errorText =
      err instanceof Error ? err.message : typeof err === "string" ? err : "agent wait error";
    await recordOmegaSessionOutcome({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      task: params.task,
      validation: validationSnapshot,
      outcome: {
        status: errorText.includes("gateway timeout") ? "timeout" : "error",
      },
      execution: {
        ...params.execution,
        runId: params.execution?.runId ?? params.runId,
      },
    }).catch(() => undefined);
    return {
      ok: false,
      runId: params.runId,
      status: errorText.includes("gateway timeout") ? "timeout" : "error",
      error: errorText,
    };
  }

  const reply = await readLatestAssistantReply({ sessionKey: params.sessionKey });
  const validation: OmegaSessionTaskValidationSummary = {};
  let structuredFailure: ReturnType<typeof validateStructuredOmegaResult> | null = null;

  if (expectsJson || expectedKeys.length > 0) {
    const structuredValidation = validateStructuredOmegaResult(
      {
        task: params.task,
        expectsJson: true,
        expectedKeys,
      },
      reply ?? "",
    );
    validation.structured = structuredValidation;
    if (!structuredValidation.ok) {
      structuredFailure = structuredValidation;
    }
  }

  let observedChangedFiles: string[] | undefined;
  if (observedWriteBaseline) {
    observedChangedFiles = await collectObservedWriteChanges(observedWriteBaseline);
    const writeValidation = validateObservedWrite({
      expectedPaths,
      observedChangedFiles,
    });
    if (!writeValidation.ok) {
      validation.write = writeValidation;
      await recordOmegaSessionOutcome({
        workspaceRoot: params.workspaceRoot,
        sessionKey: params.sessionKey,
        task: params.task,
        validation: validationSnapshot,
        outcome: {
          status: "error",
          errorKind: writeValidation.errorKind,
          observedChangedFiles,
          ...summarizeValidationOutcome(validation),
        },
        reply,
        execution: {
          ...params.execution,
          runId: params.execution?.runId ?? params.runId,
        },
      }).catch(() => undefined);
      return {
        ok: false,
        runId: params.runId,
        status: "error",
        errorKind: writeValidation.errorKind,
        error: writeValidation.message,
        reply,
        observedChangedFiles,
        validation,
      };
    }
    validation.write = writeValidation;
  }

  if (structuredFailure) {
    await recordOmegaSessionOutcome({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      task: params.task,
      validation: validationSnapshot,
      outcome: {
        status: "error",
        errorKind: structuredFailure.errorKind,
        ...(observedChangedFiles ? { observedChangedFiles } : {}),
        ...summarizeValidationOutcome(validation),
      },
      reply,
      execution: {
        ...params.execution,
        runId: params.execution?.runId ?? params.runId,
      },
    }).catch(() => undefined);
    return {
      ok: false,
      runId: params.runId,
      status: "error",
      errorKind: structuredFailure.errorKind,
      error: structuredFailure.message,
      reply,
      ...(observedChangedFiles ? { observedChangedFiles } : {}),
      ...(validation.structured || validation.write ? { validation } : {}),
    };
  }

  await recordOmegaSessionOutcome({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.sessionKey,
    task: params.task,
    validation: validationSnapshot,
    outcome: {
      status: "ok",
      ...(observedChangedFiles ? { observedChangedFiles } : {}),
      ...summarizeValidationOutcome(validation),
    },
    reply,
    execution: {
      ...params.execution,
      runId: params.execution?.runId ?? params.runId,
    },
  }).catch(() => undefined);

  return {
    ok: true,
    runId: params.runId,
    reply,
    ...(observedChangedFiles ? { observedChangedFiles } : {}),
    ...(validation.structured || validation.write ? { validation } : {}),
  };
}

export async function runValidatedOmegaSessionTask(params: {
  sendParams: Record<string, unknown>;
  sessionKey: string;
  timeoutMs: number;
  workspaceRoot: string;
  validation?: OmegaSessionTaskValidationRequest;
  execution?: OmegaTaskTransactionExecutionSnapshot;
}): Promise<OmegaSessionTaskSuccess | OmegaSessionTaskFailure> {
  const runId = crypto.randomUUID();
  const started = await startOmegaAgentRun({
    runId,
    sendParams: params.sendParams,
    sessionKey: params.sessionKey,
  });
  if (!started.ok) {
    const validationSnapshot: OmegaSessionValidationSnapshot = {
      expectsJson: params.validation?.expectsJson === true,
      expectedKeys: params.validation?.expectedKeys ?? [],
      expectedPaths: params.validation?.expectedPaths ?? [],
    };
    await recordOmegaSessionOutcome({
      workspaceRoot: params.workspaceRoot,
      sessionKey: params.sessionKey,
      task: stringifyOmegaTask(params.sendParams.message),
      validation: validationSnapshot,
      outcome: {
        status: "error",
      },
      execution: {
        ...params.execution,
        runId: params.execution?.runId ?? runId,
      },
    }).catch(() => undefined);
    return started;
  }

  return await awaitValidatedOmegaSessionRun({
    runId: started.runId,
    task: stringifyOmegaTask(params.sendParams.message),
    sessionKey: params.sessionKey,
    timeoutMs: params.timeoutMs,
    workspaceRoot: params.workspaceRoot,
    validation: params.validation,
    execution: {
      ...params.execution,
      runId: params.execution?.runId ?? started.runId,
    },
  });
}
