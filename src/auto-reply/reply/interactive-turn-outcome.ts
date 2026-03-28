import type { ReplyPayload } from "../types.js";

export type InteractiveTurnOutcomeKind =
  | "completed_with_final_reply"
  | "completed_with_visible_progress"
  | "completed_degraded"
  | "failed_no_visible_reply";

export type InteractiveTurnOutcome = {
  kind: InteractiveTurnOutcomeKind;
  completed: boolean;
  shouldSynthesizeDegradedReply: boolean;
  persistedStatus: "completed" | "error";
  processedOutcome: "completed" | "error";
  processedReason?: string;
  processedError?: string;
  idleReason: "message_completed" | "message_error";
};

export type ResolveInteractiveTurnOutcomeParams = {
  replyCount: number;
  deliveredVisibleBlockReply: boolean;
  deliveredVisibleToolReply: boolean;
  sawToolActivity: boolean;
  deliveredViaMessagingTool: boolean;
  hadExecutionError: boolean;
};

export function buildMissingFinalReplyDegradedPayload(): ReplyPayload {
  return {
    text:
      "The agent started working but did not finish a final reply. " +
      "I closed the turn visibly to preserve continuity. Please retry.",
  };
}

export function resolveInteractiveTurnOutcome(
  params: ResolveInteractiveTurnOutcomeParams,
): InteractiveTurnOutcome {
  if (params.replyCount > 0) {
    return {
      kind: "completed_with_final_reply",
      completed: true,
      shouldSynthesizeDegradedReply: false,
      persistedStatus: "completed",
      processedOutcome: "completed",
      idleReason: "message_completed",
    };
  }

  if (
    params.deliveredVisibleBlockReply ||
    params.deliveredVisibleToolReply ||
    params.deliveredViaMessagingTool
  ) {
    return {
      kind: "completed_with_visible_progress",
      completed: true,
      shouldSynthesizeDegradedReply: false,
      persistedStatus: "completed",
      processedOutcome: "completed",
      processedReason: params.deliveredVisibleBlockReply
        ? "visible_block_reply_only"
        : params.deliveredVisibleToolReply
          ? "visible_tool_reply_only"
          : "messaging_tool_only",
      idleReason: "message_completed",
    };
  }

  if (params.sawToolActivity || params.hadExecutionError) {
    return {
      kind: "completed_degraded",
      completed: true,
      shouldSynthesizeDegradedReply: true,
      persistedStatus: "completed",
      processedOutcome: "completed",
      processedReason: params.hadExecutionError
        ? "degraded_missing_visible_error_reply"
        : "degraded_missing_visible_final_reply",
      idleReason: "message_completed",
    };
  }

  return {
    kind: "failed_no_visible_reply",
    completed: false,
    shouldSynthesizeDegradedReply: false,
    persistedStatus: "error",
    processedOutcome: "error",
    processedReason: "no_visible_reply",
    processedError: "No final reply was delivered",
    idleReason: "message_error",
  };
}
