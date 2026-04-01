import fs from "node:fs/promises";
import path from "node:path";
import type { OpenSkynetLivingState, OpenSkynetLivingMemoryEvent } from "./living-memory.js";

type LegacyComparableProjectState = {
  focusKey: string | null;
  mode: string | null;
  continuityScore: number | null;
  commitment: {
    kind: string;
    artifactKind: string;
    confidence: number;
    executableTask: string;
  } | null;
};

function getComparableInternalProjectState(
  state: Partial<OpenSkynetLivingState> | undefined,
): LegacyComparableProjectState {
  const nextLike = state?.internalProjectState;
  if (nextLike) {
    return {
      focusKey: nextLike.focusKey ?? null,
      mode: nextLike.mode ?? null,
      continuityScore:
        typeof nextLike.continuityScore === "number" ? nextLike.continuityScore : null,
      commitment: nextLike.commitment ?? null,
    };
  }

  const legacy = state?.skynet;
  return {
    focusKey: legacy?.focusKey ?? null,
    mode: legacy?.mode ?? null,
    continuityScore: typeof legacy?.continuityScore === "number" ? legacy.continuityScore : null,
    commitment: legacy?.commitment ?? null,
  };
}

export function deriveOpenSkynetLivingMemoryEvents(params: {
  sessionKey: string;
  prior?: OpenSkynetLivingState;
  next: OpenSkynetLivingState;
}): OpenSkynetLivingMemoryEvent[] {
  const ts = params.next.updatedAt;
  const events: OpenSkynetLivingMemoryEvent[] = [];
  if (!params.prior) {
    const nextProject = getComparableInternalProjectState(params.next);
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "runtime_initialized",
      payload: {
        focusKey: nextProject.focusKey,
        mode: nextProject.mode,
      },
    });
    return events;
  }

  const priorProject = getComparableInternalProjectState(params.prior);
  const nextProject = getComparableInternalProjectState(params.next);

  if (priorProject.focusKey !== nextProject.focusKey) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_focus_changed",
      payload: {
        previous: priorProject.focusKey,
        next: nextProject.focusKey,
      },
    });
  }
  if (priorProject.mode !== nextProject.mode) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_mode_changed",
      payload: {
        previous: priorProject.mode,
        next: nextProject.mode,
      },
    });
  }
  if (
    priorProject.commitment?.kind !== nextProject.commitment?.kind ||
    priorProject.commitment?.artifactKind !== nextProject.commitment?.artifactKind
  ) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_commitment_changed",
      payload: {
        previous: priorProject.commitment ?? null,
        next: nextProject.commitment ?? null,
      },
    });
  }
  if (params.prior.identity.activeGoalTask !== params.next.identity.activeGoalTask) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "omega_active_goal_changed",
      payload: {
        previous: params.prior.identity.activeGoalTask,
        next: params.next.identity.activeGoalTask,
      },
    });
  }
  const priorContinuity = priorProject.continuityScore;
  const nextContinuity = nextProject.continuityScore;
  if (
    typeof priorContinuity === "number" &&
    typeof nextContinuity === "number" &&
    Math.abs(priorContinuity - nextContinuity) >= 0.1
  ) {
    events.push({
      ts,
      sessionKey: params.sessionKey,
      kind: "skynet_continuity_shift",
      payload: {
        previous: priorContinuity,
        next: nextContinuity,
      },
    });
  }
  return events;
}

export async function appendOpenSkynetLivingMemoryEvents(params: {
  historyPath: string;
  events: OpenSkynetLivingMemoryEvent[];
}): Promise<void> {
  if (params.events.length === 0) {
    return;
  }
  await fs.mkdir(path.dirname(params.historyPath), { recursive: true });
  const lines = params.events.map((event) => JSON.stringify(event)).join("\n") + "\n";
  await fs.appendFile(params.historyPath, lines, "utf-8");
}
