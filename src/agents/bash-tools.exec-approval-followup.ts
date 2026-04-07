import { sendMessage } from "../infra/outbound/message.js";
import { isCronSessionKey, isSubagentSessionKey } from "../routing/session-key.js";
import {
  isDeliverableMessageChannel,
  isGatewayMessageChannel,
  normalizeMessageChannel,
} from "../utils/message-channel.js";
import { sanitizeUserFacingText } from "./pi-embedded-helpers.js";
import { callGatewayTool } from "./tools/gateway.js";

type ExecApprovalFollowupParams = {
  approvalId: string;
  sessionKey?: string;
  turnSourceChannel?: string;
  turnSourceTo?: string;
  turnSourceAccountId?: string;
  turnSourceThreadId?: string | number;
  resultText: string;
};

type ParsedExecApprovalResult =
  | { kind: "denied"; raw: string; reason?: string }
  | { kind: "finished"; raw: string; metadata: string; body: string }
  | { kind: "completed"; raw: string; body: string }
  | { kind: "other"; raw: string };

function normalizeOptionalString(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeOptionalThreadId(value?: string | number | null): string | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function isExecDeniedResultText(resultText: string): boolean {
  return /^exec denied \(/i.test(resultText.trim());
}

function parseExecApprovalResultText(resultText: string): ParsedExecApprovalResult {
  const raw = resultText.trim();
  const deniedMatch = /^exec denied \(([^)]*)\)(?::\s*([\s\S]*))?$/i.exec(raw);
  if (deniedMatch) {
    const metadata = deniedMatch[1] ?? "";
    const reasonMatch = /,\s*([^,)]+)\s*$/.exec(metadata);
    return {
      kind: "denied",
      raw,
      reason: reasonMatch?.[1]?.trim(),
    };
  }

  const finishedMatch = /^exec finished \(([^)]*)\)\n?([\s\S]*)$/i.exec(raw);
  if (finishedMatch) {
    return {
      kind: "finished",
      raw,
      metadata: finishedMatch[1] ?? "",
      body: finishedMatch[2] ?? "",
    };
  }

  const completedMatch = /^exec completed:\s*([\s\S]*)$/i.exec(raw);
  if (completedMatch) {
    return {
      kind: "completed",
      raw,
      body: completedMatch[1] ?? "",
    };
  }

  return { kind: "other", raw };
}

function formatExecDeniedUserMessage(resultText: string): string {
  const parsed = parseExecApprovalResultText(resultText);
  const reason = parsed.kind === "denied" ? (parsed.reason ?? "").toLowerCase() : "";
  if (reason.includes("user-denied")) {
    return "Command did not run: approval was denied.";
  }
  if (reason.includes("approval-timeout")) {
    return "Command did not run: approval timed out.";
  }
  if (reason.includes("approval-request-failed")) {
    return "Command did not run: approval request failed.";
  }
  if (reason.includes("allowlist-miss")) {
    return "Command did not run: command was not allowed by policy.";
  }
  if (reason.includes("spawn-failed")) {
    return "Command did not run: process failed to start.";
  }
  if (reason.includes("invoke-failed")) {
    return "Command did not run: remote execution failed to start.";
  }
  return "Command did not run.";
}

function buildExecDeniedFollowupPrompt(resultText: string): string {
  return [
    "An async command did not run.",
    "Do not run the command again.",
    "There is no new command output.",
    "Do not mention, summarize, or reuse output from any earlier run in this session.",
    "",
    "Exact completion details:",
    resultText.trim(),
    "",
    "Reply to the user in a helpful way.",
    "Explain that the command did not run and why.",
    "Do not claim there is new command output.",
  ].join("\n");
}

export function buildExecApprovalFollowupPrompt(resultText: string): string {
  const trimmed = resultText.trim();
  if (isExecDeniedResultText(trimmed)) {
    return buildExecDeniedFollowupPrompt(trimmed);
  }
  return [
    "An async command the user already approved has completed.",
    "Do not run the command again.",
    "If the task requires more steps, continue from this result before replying to the user.",
    "Only ask the user for help if you are actually blocked.",
    "",
    "Exact completion details:",
    trimmed,
    "",
    "Continue the task if needed, then reply to the user in a helpful way.",
    "If it succeeded, share the relevant output.",
    "If it failed, explain what went wrong.",
  ].join("\n");
}

function shouldSuppressExecDeniedFollowup(sessionKey?: string): boolean {
  return isSubagentSessionKey(sessionKey) || isCronSessionKey(sessionKey);
}

function formatDirectExecApprovalFollowupText(
  resultText: string,
  opts: { allowDenied?: boolean } = {},
): string | null {
  const parsed = parseExecApprovalResultText(resultText);
  if (parsed.kind === "denied") {
    return opts.allowDenied ? formatExecDeniedUserMessage(parsed.raw) : null;
  }

  if (parsed.kind === "finished") {
    const metadata = parsed.metadata.toLowerCase();
    const body = sanitizeUserFacingText(parsed.body, {
      errorContext: !metadata.includes("code 0"),
    }).trim();
    if (body) {
      return body;
    }
    if (metadata.includes("code 0")) {
      return "Background command finished.";
    }
    if (metadata.includes("signal")) {
      return "Background command stopped unexpectedly.";
    }
    return "Background command finished with an error.";
  }

  if (parsed.kind === "completed") {
    const body = sanitizeUserFacingText(parsed.body, { errorContext: true }).trim();
    return body || "Background command finished.";
  }

  const text = sanitizeUserFacingText(parsed.raw, { errorContext: true }).trim();
  return text || null;
}

function buildSessionResumeFallbackPrefix(): string {
  return "Automatic session resume failed, so sending the status directly.\n\n";
}

function resolveExternalFollowupTarget(params: ExecApprovalFollowupParams): {
  deliver: boolean;
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
} {
  const channel = normalizeMessageChannel(params.turnSourceChannel);
  const to = normalizeOptionalString(params.turnSourceTo);
  if (!channel || !to || !isDeliverableMessageChannel(channel)) {
    return { deliver: false };
  }
  return {
    deliver: true,
    channel,
    to,
    accountId: normalizeOptionalString(params.turnSourceAccountId),
    threadId: normalizeOptionalThreadId(params.turnSourceThreadId),
  };
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

export async function sendExecApprovalFollowup(
  params: ExecApprovalFollowupParams,
): Promise<boolean> {
  const sessionKey = params.sessionKey?.trim();
  const resultText = params.resultText.trim();
  if (!resultText) {
    return false;
  }

  const isDenied = isExecDeniedResultText(resultText);
  if (isDenied && shouldSuppressExecDeniedFollowup(sessionKey)) {
    return false;
  }

  const deliveryTarget = resolveExternalFollowupTarget(params);
  const normalizedTurnSourceChannel = normalizeMessageChannel(params.turnSourceChannel);
  const sessionOnlyOriginChannel =
    normalizedTurnSourceChannel && isGatewayMessageChannel(normalizedTurnSourceChannel)
      ? normalizedTurnSourceChannel
      : undefined;

  let sessionError: unknown = null;
  if (sessionKey) {
    try {
      await callGatewayTool(
        "agent",
        { timeoutMs: 60_000 },
        {
          sessionKey,
          message: buildExecApprovalFollowupPrompt(resultText),
          deliver: true,
          bestEffortDeliver: true,
          channel: deliveryTarget.deliver ? deliveryTarget.channel : sessionOnlyOriginChannel,
          to: deliveryTarget.deliver ? deliveryTarget.to : undefined,
          accountId: deliveryTarget.deliver ? deliveryTarget.accountId : undefined,
          threadId: deliveryTarget.deliver ? deliveryTarget.threadId : undefined,
          idempotencyKey: `exec-approval-followup:${params.approvalId}`,
        },
        { expectFinal: true },
      );
      return true;
    } catch (error) {
      sessionError = error;
    }
  }

  const directText = formatDirectExecApprovalFollowupText(resultText, {
    allowDenied: sessionError !== null,
  });
  if (deliveryTarget.deliver && directText) {
    const prefix = sessionError ? buildSessionResumeFallbackPrefix() : "";
    await sendMessage({
      channel: deliveryTarget.channel,
      to: deliveryTarget.to ?? "",
      accountId: deliveryTarget.accountId,
      threadId: deliveryTarget.threadId,
      content: `${prefix}${directText}`,
      idempotencyKey: `exec-approval-followup:${params.approvalId}`,
    });
    return true;
  }

  if (sessionError) {
    throw new Error(`Session followup failed: ${formatUnknownError(sessionError)}`);
  }
  if (isDenied) {
    return false;
  }
  throw new Error("Session key or deliverable origin route is required");
}
