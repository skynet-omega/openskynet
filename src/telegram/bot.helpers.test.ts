import { describe, expect, it, vi } from "vitest";
import { resolveTelegramForumFlag, resolveTelegramStreamMode } from "./bot/helpers.js";

describe("resolveTelegramStreamMode", () => {
  it("defaults to partial when telegram streaming is unset", () => {
    expect(resolveTelegramStreamMode(undefined)).toBe("partial");
    expect(resolveTelegramStreamMode({})).toBe("partial");
  });

  it("prefers explicit streaming boolean", () => {
    expect(resolveTelegramStreamMode({ streaming: true })).toBe("partial");
    expect(resolveTelegramStreamMode({ streaming: false })).toBe("off");
  });

  it("maps legacy streamMode values", () => {
    expect(resolveTelegramStreamMode({ streamMode: "off" })).toBe("off");
    expect(resolveTelegramStreamMode({ streamMode: "partial" })).toBe("partial");
    expect(resolveTelegramStreamMode({ streamMode: "block" })).toBe("block");
  });

  it("maps unified progress mode to partial on Telegram", () => {
    expect(resolveTelegramStreamMode({ streaming: "progress" })).toBe("partial");
  });
});

describe("resolveTelegramForumFlag", () => {
  it("keeps explicit forum metadata when Telegram already provides it", async () => {
    const getChat = vi.fn(async () => ({ is_forum: false }));
    await expect(
      resolveTelegramForumFlag({
        chatId: -100123,
        chatType: "supergroup",
        isGroup: true,
        isForum: true,
        getChat,
      }),
    ).resolves.toBe(true);
    expect(getChat).not.toHaveBeenCalled();
  });

  it("falls back to getChat for supergroups when is_forum is omitted", async () => {
    const getChat = vi.fn(async () => ({ is_forum: true }));
    await expect(
      resolveTelegramForumFlag({
        chatId: -100123,
        chatType: "supergroup",
        isGroup: true,
        getChat,
      }),
    ).resolves.toBe(true);
    expect(getChat).toHaveBeenCalledWith(-100123);
  });

  it("returns false when forum lookup is unavailable", async () => {
    const getChat = vi.fn(async () => {
      throw new Error("lookup failed");
    });
    await expect(
      resolveTelegramForumFlag({
        chatId: -100123,
        chatType: "supergroup",
        isGroup: true,
        getChat,
      }),
    ).resolves.toBe(false);
  });
});
