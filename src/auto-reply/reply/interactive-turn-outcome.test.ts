import { describe, expect, it } from "vitest";
import {
  resolveInteractiveTurnOutcome,
  buildMissingFinalReplyDegradedPayload,
} from "./interactive-turn-outcome.js";

describe("resolveInteractiveTurnOutcome", () => {
  it("classifies final replies as completed_with_final_reply", () => {
    expect(
      resolveInteractiveTurnOutcome({
        replyCount: 1,
        deliveredVisibleBlockReply: false,
        deliveredVisibleToolReply: false,
        sawToolActivity: false,
        deliveredViaMessagingTool: false,
        hadExecutionError: false,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "completed_with_final_reply",
        completed: true,
        shouldSynthesizeDegradedReply: false,
      }),
    );
  });

  it("classifies visible tool-only progress as completed", () => {
    expect(
      resolveInteractiveTurnOutcome({
        replyCount: 0,
        deliveredVisibleBlockReply: false,
        deliveredVisibleToolReply: true,
        sawToolActivity: true,
        deliveredViaMessagingTool: false,
        hadExecutionError: false,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "completed_with_visible_progress",
        completed: true,
        shouldSynthesizeDegradedReply: false,
      }),
    );
  });

  it("classifies messaging-tool-only delivery as completed", () => {
    expect(
      resolveInteractiveTurnOutcome({
        replyCount: 0,
        deliveredVisibleBlockReply: false,
        deliveredVisibleToolReply: false,
        sawToolActivity: true,
        deliveredViaMessagingTool: true,
        hadExecutionError: false,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "completed_with_visible_progress",
        completed: true,
        shouldSynthesizeDegradedReply: false,
      }),
    );
  });

  it("classifies hidden internal work as degraded completion", () => {
    expect(
      resolveInteractiveTurnOutcome({
        replyCount: 0,
        deliveredVisibleBlockReply: false,
        deliveredVisibleToolReply: false,
        sawToolActivity: true,
        deliveredViaMessagingTool: false,
        hadExecutionError: false,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "completed_degraded",
        completed: true,
        shouldSynthesizeDegradedReply: true,
      }),
    );
  });

  it("classifies no visible reply and no internal work as error", () => {
    expect(
      resolveInteractiveTurnOutcome({
        replyCount: 0,
        deliveredVisibleBlockReply: false,
        deliveredVisibleToolReply: false,
        sawToolActivity: false,
        deliveredViaMessagingTool: false,
        hadExecutionError: true,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "completed_degraded",
        completed: true,
        shouldSynthesizeDegradedReply: true,
        persistedStatus: "completed",
        processedReason: "degraded_missing_visible_error_reply",
      }),
    );
  });

  it("classifies no visible reply, no internal work, and no execution error as error", () => {
    expect(
      resolveInteractiveTurnOutcome({
        replyCount: 0,
        deliveredVisibleBlockReply: false,
        deliveredVisibleToolReply: false,
        sawToolActivity: false,
        deliveredViaMessagingTool: false,
        hadExecutionError: false,
      }),
    ).toEqual(
      expect.objectContaining({
        kind: "failed_no_visible_reply",
        completed: false,
        shouldSynthesizeDegradedReply: false,
        persistedStatus: "error",
      }),
    );
  });
});

describe("buildMissingFinalReplyDegradedPayload", () => {
  it("returns the canonical degraded final payload", () => {
    expect(buildMissingFinalReplyDegradedPayload()).toEqual({
      text:
        "The agent started working but did not finish a final reply. " +
        "I closed the turn visibly to preserve continuity. Please retry.",
      channelData: {
        openclaw: {
          suppressAutoTts: true,
          continuityNotice: true,
        },
      },
    });
  });
});
