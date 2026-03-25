import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaDurableMemoryEntry } from "./durable-memory.js";
import type { OmegaOperationalTurnMemoryEntry } from "./operational-memory.js";
import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";
import type { OmegaSessionOutcomeSnapshot } from "./session-context.js";

export type OmegaProblemAgendaItem = {
  id: string;
  classKey: string;
  label: string;
  source: "failure_pattern" | "stalled_progress" | "initiative";
  status: "open" | "active" | "resolved" | "dormant";
  priority: number;
  evidenceCount: number;
  activationCount: number;
  successCount: number;
  failureCount: number;
  realizedUtility: number;
  firstSeenAt: number;
  lastSeenAt: number;
  lastActivatedAt?: number;
};

export type OmegaAgendaExecutionContract = {
  hypothesis: string;
  deliverable: string;
  successCriteria: string;
  experimentMode?: "probe_experiment";
};

export type OmegaAgendaContractOutcome = {
  fulfilled: boolean;
  reason: string;
  utilityDelta: number;
};

type OmegaProblemAgendaStore = {
  sessionKey: string;
  updatedAt: number;
  items: OmegaProblemAgendaItem[];
};

const OMEGA_PROBLEM_AGENDA_LIMIT = 16;

function canonicalizeAgendaSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  if (normalized === "main" || normalized.toLowerCase() === "agent:main:main") {
    return "agent:main:main";
  }
  return normalized;
}

function resolveAgendaFile(params: { workspaceRoot: string; sessionKey: string }): string {
  const canonicalSessionKey = canonicalizeAgendaSessionKey(params.sessionKey);
  const safe = `${canonicalSessionKey}`.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 48) || "main";
  const digest = crypto.createHash("sha256").update(canonicalSessionKey).digest("hex").slice(0, 12);
  return path.join(
    params.workspaceRoot,
    ".openskynet",
    "omega-problem-agenda",
    `${safe}-${digest}.json`,
  );
}

function normalizeItem(value: unknown): OmegaProblemAgendaItem | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const item = value as Partial<OmegaProblemAgendaItem>;
  if (
    typeof item.id !== "string" ||
    typeof item.classKey !== "string" ||
    typeof item.label !== "string" ||
    typeof item.source !== "string" ||
    typeof item.status !== "string" ||
    typeof item.priority !== "number" ||
    typeof item.evidenceCount !== "number" ||
    typeof item.activationCount !== "number" ||
    typeof item.firstSeenAt !== "number" ||
    typeof item.lastSeenAt !== "number"
  ) {
    return undefined;
  }
  return {
    id: item.id,
    classKey: item.classKey,
    label: item.label,
    source:
      item.source === "failure_pattern" ||
      item.source === "stalled_progress" ||
      item.source === "initiative"
        ? item.source
        : "initiative",
    status:
      item.status === "open" ||
      item.status === "active" ||
      item.status === "resolved" ||
      item.status === "dormant"
        ? item.status
        : "open",
    priority: Math.max(0, Math.min(1, item.priority)),
    evidenceCount: Math.max(0, Math.floor(item.evidenceCount)),
    activationCount: Math.max(0, Math.floor(item.activationCount)),
    successCount: Math.max(0, Math.floor(item.successCount ?? 0)),
    failureCount: Math.max(0, Math.floor(item.failureCount ?? 0)),
    realizedUtility:
      typeof item.realizedUtility === "number" && Number.isFinite(item.realizedUtility)
        ? Math.max(-1, Math.min(1, item.realizedUtility))
        : 0,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    lastActivatedAt: typeof item.lastActivatedAt === "number" ? item.lastActivatedAt : undefined,
  };
}

export async function loadOmegaProblemAgenda(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OmegaProblemAgendaItem[]> {
  try {
    const raw = await fs.readFile(resolveAgendaFile(params), "utf-8");
    const parsed = JSON.parse(raw) as Partial<OmegaProblemAgendaStore>;
    if (!Array.isArray(parsed.items)) {
      return [];
    }
    return parsed.items
      .map(normalizeItem)
      .filter((item): item is OmegaProblemAgendaItem => item !== undefined)
      .sort((a, b) => b.priority - a.priority || b.lastSeenAt - a.lastSeenAt);
  } catch {
    return [];
  }
}

export function deriveOmegaAgendaContractOutcome(params: {
  classKey: string;
  outcome: OmegaSessionOutcomeSnapshot;
  reply?: string;
}): OmegaAgendaContractOutcome {
  const hasVerifiedArtifact =
    (params.outcome.observedChangedFiles?.length ?? 0) > 0 ||
    params.outcome.writeOk === true ||
    params.outcome.structuredOk === true;
  const replyText = params.reply?.toLowerCase() ?? "";
  const mentionsExperiment = /experiment|hypothesis|metric|measur/i.test(replyText);

  if (params.classKey === "initiative:autonomy_improvement") {
    if (params.outcome.status === "ok" && (hasVerifiedArtifact || mentionsExperiment)) {
      return {
        fulfilled: true,
        reason: "autonomy_change_or_experiment_produced",
        utilityDelta: 0.3,
      };
    }
    return { fulfilled: false, reason: "no_verifiable_autonomy_output", utilityDelta: -0.18 };
  }
  if (params.classKey === "initiative:stalled_progress") {
    if (params.outcome.status === "ok" && (hasVerifiedArtifact || mentionsExperiment)) {
      return { fulfilled: true, reason: "new_attack_path_materialized", utilityDelta: 0.24 };
    }
    return { fulfilled: false, reason: "stall_contract_unfulfilled", utilityDelta: -0.16 };
  }
  if (params.classKey.startsWith("failure:")) {
    if (params.outcome.status === "ok" && hasVerifiedArtifact) {
      return {
        fulfilled: true,
        reason: "reusable_failure_mitigation_materialized",
        utilityDelta: 0.26,
      };
    }
    return { fulfilled: false, reason: "failure_strategy_not_materialized", utilityDelta: -0.16 };
  }
  return params.outcome.status === "ok" && hasVerifiedArtifact
    ? { fulfilled: true, reason: "generic_initiative_contract_fulfilled", utilityDelta: 0.22 }
    : { fulfilled: false, reason: "generic_initiative_contract_unfulfilled", utilityDelta: -0.14 };
}

export function deriveOmegaAgendaExecutionContract(classKey: string): OmegaAgendaExecutionContract {
  if (classKey === "initiative:stalled_progress") {
    return {
      hypothesis:
        "Reducing the current stalled loop requires reframing the active plan into a smaller or different attack path.",
      deliverable:
        "Produce one explicit reframe or next-step plan that changes the current approach.",
      successCriteria:
        "Success only if the next cycle has a materially different plan, target focus, or recovery route.",
    };
  }
  if (classKey === "initiative:autonomy_improvement") {
    return {
      hypothesis:
        "A small autonomy improvement can measurably reduce wasted cycles or improve initiative quality.",
      deliverable:
        "Propose and execute one small measurable autonomy experiment or implementation step.",
      successCriteria:
        "Success only if a concrete change or runnable experiment is produced, not just an idea dump.",
    };
  }
  if (classKey === "initiative:somatic_optimization") {
    return {
      hypothesis:
        "High response latency is degrading cognitive coherence and causing metabolic stress.",
      deliverable:
        "Identify and eliminate redundant I/O, simplify context processing, or optimize engine loading.",
      successCriteria: "Average turn latency drops below 15 seconds.",
    };
  }
  if (classKey.startsWith("failure:")) {
    const errorKind = classKey.slice("failure:".length);
    return {
      hypothesis: `There is a reusable countermeasure for the failure class ${errorKind}.`,
      deliverable: `Produce one reusable mitigation strategy or focused repair path for ${errorKind}.`,
      successCriteria:
        "Success only if the mitigation is concrete enough to change later routing, validation, or execution behavior.",
    };
  }
  return {
    hypothesis: "This problem class is worth a small, verifiable initiative step.",
    deliverable: "Produce one concrete next step with observable output.",
    successCriteria:
      "Success only if the initiative creates a verifiable artifact or state change.",
  };
}

function buildCandidates(params: {
  kernel?: OmegaSelfTimeKernelState;
  durableMemory: OmegaDurableMemoryEntry[];
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
}): Array<
  Pick<OmegaProblemAgendaItem, "classKey" | "label" | "source" | "priority" | "evidenceCount">
> {
  const candidates: Array<
    Pick<OmegaProblemAgendaItem, "classKey" | "label" | "source" | "priority" | "evidenceCount">
  > = [];
  const stalledTurns = params.operationalSignals.filter(
    (entry) => entry.turnHealth === "stalled",
  ).length;
  if (stalledTurns >= 2) {
    candidates.push({
      classKey: "initiative:stalled_progress",
      label: "Investigate stalled progress patterns and open a better line of attack",
      source: "stalled_progress",
      priority: Math.min(1, 0.55 + stalledTurns * 0.1),
      evidenceCount: stalledTurns,
    });
  }

  const repeatedFailures = new Map<string, number>();
  for (const entry of params.durableMemory) {
    if (entry.kind !== "repeated_failure" || !entry.errorKind) {
      continue;
    }
    repeatedFailures.set(
      entry.errorKind,
      Math.max(repeatedFailures.get(entry.errorKind) ?? 0, entry.failureCount),
    );
  }
  for (const [errorKind, count] of repeatedFailures) {
    candidates.push({
      classKey: `failure:${errorKind}`,
      label: `Explore a reusable strategy for ${errorKind}`,
      source: "failure_pattern",
      priority: Math.min(1, 0.45 + count * 0.08),
      evidenceCount: count,
    });
  }

  if (
    (params.kernel?.tension.openGoalCount ?? 0) === 0 &&
    repeatedFailures.size === 0 &&
    stalledTurns === 0
  ) {
    candidates.push({
      classKey: "initiative:autonomy_improvement",
      label: "Open a small autonomy-improvement experiment with measurable value",
      source: "initiative",
      priority: 0.32,
      evidenceCount: 1,
    });
  }

  // PROACTIVIDAD RADICAL: Iniciativa de optimización somática ante estrés detectado
  const recentLatency =
    params.operationalSignals.slice(-3).reduce((acc, s) => acc + s.latencyBreakdown.totalMs, 0) / 3;
  if (recentLatency > 20000) {
    // > 20s promedio
    candidates.push({
      classKey: "initiative:somatic_optimization",
      label: "Optimize cognitive metabolism to reduce response latency",
      source: "initiative",
      priority: 0.75,
      evidenceCount: 1,
    });
  }

  return candidates;
}

export async function syncOmegaProblemAgenda(params: {
  workspaceRoot: string;
  sessionKey: string;
  kernel?: OmegaSelfTimeKernelState;
  durableMemory: OmegaDurableMemoryEntry[];
  operationalSignals: OmegaOperationalTurnMemoryEntry[];
}): Promise<OmegaProblemAgendaItem[]> {
  const existing = await loadOmegaProblemAgenda(params);
  const now = Date.now();
  const candidates = buildCandidates(params);
  const next = new Map(existing.map((item) => [item.classKey, { ...item }]));
  const seen = new Set<string>();

  for (const candidate of candidates) {
    seen.add(candidate.classKey);
    const current = next.get(candidate.classKey);
    if (current) {
      current.label = candidate.label;
      current.source = candidate.source;
      const evidencePersistsAfterActivation =
        current.status === "active" &&
        typeof current.lastActivatedAt === "number" &&
        current.lastActivatedAt <= now;
      if (evidencePersistsAfterActivation) {
        current.failureCount += 1;
        current.realizedUtility = Math.max(-1, current.realizedUtility - 0.18);
      }
      current.priority = Math.max(
        0.1,
        Math.max(current.priority * 0.6, candidate.priority) + current.realizedUtility * 0.08,
      );
      const hasNewEvidence = candidate.evidenceCount > current.evidenceCount;
      current.evidenceCount = Math.max(current.evidenceCount, candidate.evidenceCount);
      current.lastSeenAt = now;
      if (current.failureCount >= 2 && current.realizedUtility <= -0.3) {
        current.status = "dormant";
        current.priority = Math.min(current.priority, 0.16);
      } else if (
        current.status === "dormant" ||
        (current.status === "resolved" && hasNewEvidence)
      ) {
        current.status = "open";
      }
      continue;
    }
    next.set(candidate.classKey, {
      id: crypto.createHash("sha256").update(candidate.classKey).digest("hex").slice(0, 12),
      classKey: candidate.classKey,
      label: candidate.label,
      source: candidate.source,
      status: "open",
      priority: candidate.priority,
      evidenceCount: candidate.evidenceCount,
      activationCount: 0,
      successCount: 0,
      failureCount: 0,
      realizedUtility: 0,
      firstSeenAt: now,
      lastSeenAt: now,
    });
  }

  for (const item of next.values()) {
    if (seen.has(item.classKey)) {
      continue;
    }
    if (item.status === "active") {
      item.status = "resolved";
      item.successCount += 1;
      item.realizedUtility = Math.min(1, item.realizedUtility + 0.24);
    } else if (item.status !== "resolved") {
      item.status = "dormant";
    }
    item.priority = Math.max(0.05, item.priority * 0.92 + item.realizedUtility * 0.05);
    if (item.failureCount >= 2 && item.realizedUtility <= -0.3) {
      item.status = "dormant";
      item.priority = Math.min(item.priority, 0.16);
    }
  }

  const items = Array.from(next.values())
    .sort((a, b) => b.priority - a.priority || b.lastSeenAt - a.lastSeenAt)
    .slice(0, OMEGA_PROBLEM_AGENDA_LIMIT);

  await fs.mkdir(path.dirname(resolveAgendaFile(params)), { recursive: true });
  await fs.writeFile(
    resolveAgendaFile(params),
    JSON.stringify(
      { sessionKey: params.sessionKey, updatedAt: now, items } satisfies OmegaProblemAgendaStore,
      null,
      2,
    ),
    "utf-8",
  );
  return items;
}

export async function markOmegaProblemAgendaItemActivated(params: {
  workspaceRoot: string;
  sessionKey: string;
  classKey: string;
}): Promise<void> {
  const items = await loadOmegaProblemAgenda(params);
  const now = Date.now();
  const nextItems = items.map((item) =>
    item.classKey === params.classKey
      ? {
          ...item,
          status: "active" as const,
          activationCount: item.activationCount + 1,
          lastActivatedAt: now,
          lastSeenAt: now,
        }
      : item,
  );
  await fs.mkdir(path.dirname(resolveAgendaFile(params)), { recursive: true });
  await fs.writeFile(
    resolveAgendaFile(params),
    JSON.stringify(
      {
        sessionKey: params.sessionKey,
        updatedAt: now,
        items: nextItems,
      } satisfies OmegaProblemAgendaStore,
      null,
      2,
    ),
    "utf-8",
  );
}

export async function recordOmegaAgendaContractOutcome(params: {
  workspaceRoot: string;
  sessionKey: string;
  classKey: string;
  outcome: OmegaAgendaContractOutcome;
}): Promise<void> {
  const items = await loadOmegaProblemAgenda(params);
  const now = Date.now();
  const nextItems = items.map((item) => {
    if (item.classKey !== params.classKey) {
      return item;
    }
    const successCount =
      item.status === "resolved" && params.outcome.fulfilled
        ? item.successCount
        : item.successCount + (params.outcome.fulfilled ? 1 : 0);
    const failureCount = item.failureCount + (params.outcome.fulfilled ? 0 : 1);
    const realizedUtility = Math.max(
      -1,
      Math.min(1, item.realizedUtility + params.outcome.utilityDelta),
    );
    const status = params.outcome.fulfilled
      ? ("resolved" as const)
      : failureCount >= 2 && realizedUtility <= -0.3
        ? ("dormant" as const)
        : ("open" as const);
    const priority = params.outcome.fulfilled
      ? Math.min(1, item.priority + 0.08)
      : Math.max(0.05, item.priority - 0.08);
    return {
      ...item,
      status,
      successCount,
      failureCount,
      realizedUtility,
      priority,
      lastSeenAt: now,
    };
  });
  await fs.mkdir(path.dirname(resolveAgendaFile(params)), { recursive: true });
  await fs.writeFile(
    resolveAgendaFile(params),
    JSON.stringify(
      {
        sessionKey: params.sessionKey,
        updatedAt: now,
        items: nextItems,
      } satisfies OmegaProblemAgendaStore,
      null,
      2,
    ),
    "utf-8",
  );
}
