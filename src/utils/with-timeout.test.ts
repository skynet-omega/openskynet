import { describe, expect, it, vi, afterEach } from "vitest";
import { withTimeout } from "./with-timeout.js";

describe("utils/with-timeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("resolves the original promise before timeout", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100)).resolves.toBe("ok");
  });

  it("rejects when timeout wins", async () => {
    vi.useFakeTimers();
    const late = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 50));
    const result = withTimeout(late, 1);
    const assertion = expect(result).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("unrefs the timer when supported", async () => {
    const unref = vi.fn();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const originalSetTimeout = globalThis.setTimeout;
    const mockImpl = ((handler: TimerHandler, timeout?: number, ...args: unknown[]): NodeJS.Timeout => {
      const timer = originalSetTimeout(handler, timeout, ...(args as [])) as unknown as NodeJS.Timeout;
      timer.unref = unref as typeof timer.unref;
      return timer;
    }) as unknown;
    const setTimeoutSpy = vi
      .spyOn(globalThis, "setTimeout")
      .mockImplementation(mockImpl as any);

    await expect(withTimeout(Promise.resolve("ok"), 100)).resolves.toBe("ok");

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(unref).toHaveBeenCalledTimes(1);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});
