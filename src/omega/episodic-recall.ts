import fs from "node:fs/promises";
import path from "node:path";
import type { OmegaEmpiricalRoute } from "./empirical-metrics.js";
import type { OmegaSessionValidationSnapshot } from "./session-context.js";
import {
  parseOmegaTaskTransactions,
  type OmegaTaskTransaction,
  type OmegaTaskTransactionRecoveryStep,
} from "./task-transaction.js";

const OMEGA_EPISODIC_RECALL_FILE_LIMIT = 16;
const OMEGA_EPISODIC_RECALL_RESULT_LIMIT = 3;
const OMEGA_EPISODIC_RECALL_MIN_SCORE = 0.2;
const OMEGA_EPISODE_MEMORY_LIMIT = 12;
const OMEGA_SEMANTIC_RECALL_RESULT_LIMIT = 2;

type OmegaSessionTimelineFileLike = {
  sessionKey?: unknown;
  updatedAt?: unknown;
  transactions?: unknown;
};

export type OmegaRecoveryEpisode = {
  sessionKey: string;
  updatedAt: number;
  transactionId: string;
  task: string;
  status: OmegaTaskTransaction["status"];
  errorKind?: string;
  lastRoute?: OmegaEmpiricalRoute;
  nextRecoveryStep: OmegaTaskTransactionRecoveryStep;
  targets: string[];
  requiredKeys: string[];
  observedChangedFiles: string[];
  attempts: number;
  score: number;
};

export type OmegaSemanticRecallSnippet = {
  path: string;
  citation: string;
  score: number;
  snippet: string;
};

function normalizeSessionKey(sessionKey: string): string {
  const normalized = sessionKey.trim() || "main";
  if (normalized === "main" || normalized.toLowerCase() === "agent:main:main") {
    return "agent:main:main";
  }
  return normalized;
}

function resolveOmegaSessionStateDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".openskynet", "omega-session-state");
}

export function resolveOmegaEpisodeMemoryDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, "memory", "omega-episodes");
}

function sanitizeSessionKeyForFilename(sessionKey: string): string {
  return (
    normalizeSessionKey(sessionKey)
      .replace(/[^a-z0-9]+/gi, "__")
      .replace(/^_+|_+$/g, "") || "agent__main__main"
  );
}

export function resolveOmegaEpisodeMemoryFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    resolveOmegaEpisodeMemoryDir(params.workspaceRoot),
    `${sanitizeSessionKeyForFilename(params.sessionKey)}.md`,
  );
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return Array.from(
    new Set(
      normalizeText(text)
        .split(/[^a-z0-9_]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3),
    ),
  );
}

function overlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let matches = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) {
      matches += 1;
    }
  }
  return matches / Math.max(leftSet.size, rightSet.size);
}

function taskSimilarity(leftTask: string, rightTask: string): number {
  const leftTokens = tokenize(leftTask);
  const rightTokens = tokenize(rightTask);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return normalizeText(leftTask) === normalizeText(rightTask) ? 1 : 0;
  }
  return overlapRatio(leftTokens, rightTokens);
}

function sameTargets(left: string[], right: string[]): boolean {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function scoreEpisode(params: {
  episode: Omit<OmegaRecoveryEpisode, "score">;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  errorKind?: string;
}): number {
  let score = 0;

  const taskScore = taskSimilarity(params.task, params.episode.task);
  score += taskScore * 0.35;

  if (params.errorKind && params.episode.errorKind === params.errorKind) {
    score += 0.3;
  }

  if (params.validation.expectedPaths.length > 0 && params.episode.targets.length > 0) {
    score += overlapRatio(params.validation.expectedPaths, params.episode.targets) * 0.2;
  }

  if (params.validation.expectedKeys.length > 0 && params.episode.requiredKeys.length > 0) {
    score += overlapRatio(params.validation.expectedKeys, params.episode.requiredKeys) * 0.1;
  }

  if (
    params.validation.expectedPaths.length > 0 &&
    sameTargets(params.validation.expectedPaths, params.episode.targets)
  ) {
    score += 0.05;
  }

  return Math.min(1, Number(score.toFixed(4)));
}

function buildEpisode(params: {
  sessionKey: string;
  updatedAt: number;
  transaction: OmegaTaskTransaction;
}): Omit<OmegaRecoveryEpisode, "score"> {
  const lastAttempt = params.transaction.attempts.at(-1);
  const lastFailureAttempt = [...params.transaction.attempts]
    .reverse()
    .find((attempt) => typeof attempt.errorKind === "string");
  return {
    sessionKey: params.sessionKey,
    updatedAt: params.updatedAt,
    transactionId: params.transaction.id,
    task: params.transaction.task,
    status: params.transaction.status,
    // Preserve the failure that triggered recovery even after a later verified success.
    errorKind: params.transaction.verifiedOutcome.errorKind ?? lastFailureAttempt?.errorKind,
    lastRoute: lastAttempt?.route,
    nextRecoveryStep: {
      ...params.transaction.nextRecoveryStep,
      remainingTargets: [...params.transaction.nextRecoveryStep.remainingTargets],
      requiredKeys: [...params.transaction.nextRecoveryStep.requiredKeys],
    },
    targets: [...params.transaction.validation.expectedPaths],
    requiredKeys: [...params.transaction.validation.expectedKeys],
    observedChangedFiles: [...(params.transaction.verifiedOutcome.observedChangedFiles ?? [])],
    attempts: params.transaction.attempts.length,
  };
}

function formatAttemptSummary(transaction: OmegaTaskTransaction): string[] {
  return transaction.attempts.map((attempt, index) => {
    const bits = [
      `${index + 1}. status=${attempt.status}`,
      `trigger=${attempt.trigger}`,
    ];
    if (attempt.route) {
      bits.push(`route=${attempt.route}`);
    }
    if (attempt.errorKind) {
      bits.push(`error=${attempt.errorKind}`);
    }
    if (attempt.resumedFromKernel) {
      bits.push("resumed_from_kernel=true");
    }
    if (attempt.observedChangedFiles.length > 0) {
      bits.push(`changed=${attempt.observedChangedFiles.join(", ")}`);
    }
    return bits.join(" | ");
  });
}

function buildOmegaEpisodeMemoryDocument(params: {
  sessionKey: string;
  transactions: OmegaTaskTransaction[];
}): string | undefined {
  const completed = [...params.transactions]
    .filter((transaction) => transaction.status === "completed")
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, OMEGA_EPISODE_MEMORY_LIMIT);
  if (completed.length === 0) {
    return undefined;
  }

  const lines = [
    "# OMEGA Recovery Episodes",
    "",
    `sessionKey: ${normalizeSessionKey(params.sessionKey)}`,
    `episodeCount: ${completed.length}`,
    "",
    "Semantically searchable summaries of completed OMEGA recoveries.",
  ];

  completed.forEach((transaction, index) => {
    const lastFailureAttempt = [...transaction.attempts]
      .reverse()
      .find((attempt) => typeof attempt.errorKind === "string");
    const successfulAttempt = [...transaction.attempts]
      .reverse()
      .find((attempt) => attempt.status === "ok");
    lines.push("");
    lines.push(`## Episode ${index + 1}: ${transaction.task}`);
    lines.push(`transactionId: ${transaction.id}`);
    lines.push(`status: ${transaction.status}`);
    lines.push(`attempts: ${transaction.attempts.length}`);
    if (transaction.validation.expectedPaths.length > 0) {
      lines.push(`targets: ${transaction.validation.expectedPaths.join(", ")}`);
    }
    if (transaction.validation.expectedKeys.length > 0) {
      lines.push(`requiredKeys: ${transaction.validation.expectedKeys.join(", ")}`);
    }
    if (lastFailureAttempt?.errorKind) {
      lines.push(`priorVerifiedFailure: ${lastFailureAttempt.errorKind}`);
    }
    if (successfulAttempt?.route) {
      lines.push(`successfulRoute: ${successfulAttempt.route}`);
    }
    if ((transaction.verifiedOutcome.observedChangedFiles ?? []).length > 0) {
      lines.push(
        `verifiedObservedWrites: ${transaction.verifiedOutcome.observedChangedFiles?.join(", ")}`,
      );
    }
    lines.push(`nextRecoveryStep: ${transaction.nextRecoveryStep.kind}`);
    if (transaction.nextRecoveryStep.route) {
      lines.push(`nextRecoveryRoute: ${transaction.nextRecoveryStep.route}`);
    }
    lines.push("");
    lines.push("Attempt timeline:");
    lines.push(...formatAttemptSummary(transaction));
  });

  return lines.join("\n");
}

export async function syncOmegaEpisodeMemoryDigest(params: {
  workspaceRoot: string;
  sessionKey: string;
  transactions: OmegaTaskTransaction[];
}): Promise<void> {
  const filePath = resolveOmegaEpisodeMemoryFile(params);
  const document = buildOmegaEpisodeMemoryDocument(params);
  await fs.mkdir(resolveOmegaEpisodeMemoryDir(params.workspaceRoot), { recursive: true });
  if (!document) {
    await fs.rm(filePath, { force: true }).catch(() => undefined);
    return;
  }
  await fs.writeFile(filePath, document, "utf-8");
}

async function loadEpisodeCandidates(params: {
  workspaceRoot: string;
}): Promise<Array<Omit<OmegaRecoveryEpisode, "score">>> {
  const stateDir = resolveOmegaSessionStateDir(params.workspaceRoot);
  let files: string[] = [];
  try {
    const entries = await fs.readdir(stateDir, { withFileTypes: true });
    files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(stateDir, entry.name));
  } catch {
    return [];
  }

  const loaded = await Promise.all(
    files.map(async (filePath) => {
      try {
        const raw = await fs.readFile(filePath, "utf-8");
        const parsed = JSON.parse(raw) as OmegaSessionTimelineFileLike;
        const sessionKey =
          typeof parsed.sessionKey === "string" ? normalizeSessionKey(parsed.sessionKey) : undefined;
        if (!sessionKey) {
          return [];
        }
        const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
        const transactions = parseOmegaTaskTransactions(parsed.transactions);
        return transactions.map((transaction) =>
          buildEpisode({
            sessionKey,
            updatedAt,
            transaction,
          }),
        );
      } catch {
        return [];
      }
    }),
  );

  return loaded
    .flat()
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, OMEGA_EPISODIC_RECALL_FILE_LIMIT * OMEGA_EPISODIC_RECALL_RESULT_LIMIT);
}

export async function loadOmegaRecoveryEpisodeRecall(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  errorKind?: string;
  maxResults?: number;
}): Promise<OmegaRecoveryEpisode[]> {
  const currentSessionKey = normalizeSessionKey(params.sessionKey);
  const candidates = await loadEpisodeCandidates({
    workspaceRoot: params.workspaceRoot,
  });
  const maxResults = Math.max(1, params.maxResults ?? OMEGA_EPISODIC_RECALL_RESULT_LIMIT);

  return candidates
    .filter((episode) => {
      if (episode.sessionKey !== currentSessionKey) {
        return true;
      }
      if (episode.status === "completed") {
        return true;
      }
      return !(normalizeText(episode.task) === normalizeText(params.task) &&
        sameTargets(episode.targets, params.validation.expectedPaths));
    })
    .map((episode) => ({
      ...episode,
      score: scoreEpisode({
        episode,
        task: params.task,
        validation: params.validation,
        errorKind: params.errorKind,
      }),
    }))
    .filter((episode) => episode.score >= OMEGA_EPISODIC_RECALL_MIN_SCORE)
    .toSorted((left, right) => right.score - left.score || right.updatedAt - left.updatedAt)
    .slice(0, maxResults);
}

function buildOmegaSemanticRecallQuery(params: {
  task: string;
  validation: OmegaSessionValidationSnapshot;
  errorKind?: string;
}): string {
  const lines = [params.task.trim(), "OMEGA recovery episode"];
  if (params.errorKind) {
    lines.push(params.errorKind);
  }
  if (params.validation.expectedPaths.length > 0) {
    lines.push(params.validation.expectedPaths.join(" "));
  }
  if (params.validation.expectedKeys.length > 0) {
    lines.push(params.validation.expectedKeys.join(" "));
  }
  return lines.filter((value) => value.trim().length > 0).join("\n");
}

function isOmegaEpisodeMemoryPath(relPath: string): boolean {
  return relPath.replace(/\\/g, "/").startsWith("memory/omega-episodes/");
}

function compactSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function formatCitation(pathValue: string, startLine: number, endLine: number): string {
  return startLine === endLine
    ? `${pathValue}#L${startLine}`
    : `${pathValue}#L${startLine}-L${endLine}`;
}

export async function loadOmegaSemanticRecoveryRecall(params: {
  workspaceRoot: string;
  sessionKey: string;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  errorKind?: string;
  maxResults?: number;
}): Promise<OmegaSemanticRecallSnippet[]> {
  const query = buildOmegaSemanticRecallQuery({
    task: params.task,
    validation: params.validation,
    errorKind: params.errorKind,
  });
  if (query.trim().length === 0) {
    return [];
  }

  const maxResults = Math.max(1, params.maxResults ?? OMEGA_SEMANTIC_RECALL_RESULT_LIMIT);
  try {
    const [{ loadConfig }, { getMemorySearchManager }, { resolveAgentIdFromSessionKey }] =
      await Promise.all([
        import("../config/config.js"),
        import("../memory/index.js"),
        import("../routing/session-key.js"),
      ]);
    const cfg = loadConfig();
    const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
    const { manager } = await getMemorySearchManager({
      cfg,
      agentId,
    });
    if (!manager) {
      return [];
    }
    const results = await manager.search(query, {
      maxResults: Math.max(maxResults * 3, maxResults),
      minScore: 0.2,
      sessionKey: normalizeSessionKey(params.sessionKey),
    });
    return results
      .filter((entry) => isOmegaEpisodeMemoryPath(entry.path))
      .slice(0, maxResults)
      .map((entry) => ({
        path: entry.path,
        citation:
          entry.citation ?? formatCitation(entry.path, entry.startLine, entry.endLine),
        score: Number(entry.score.toFixed(4)),
        snippet: compactSnippet(entry.snippet),
      }));
  } catch {
    return [];
  }
}

export function formatOmegaRecoveryEpisodeRecall(
  episodes: OmegaRecoveryEpisode[],
): string[] {
  if (episodes.length === 0) {
    return [];
  }
  const lines = [
    "[OMEGA Similar Episodes]",
    "Use these as prior evidence only. Prefer current verified state over analogies.",
  ];
  episodes.forEach((episode, index) => {
    const bits = [
      `${index + 1}. score=${episode.score.toFixed(2)}`,
      episode.status,
      `task=${episode.task}`,
    ];
    if (episode.errorKind) {
      bits.push(`error=${episode.errorKind}`);
    }
    if (episode.lastRoute) {
      bits.push(`route=${episode.lastRoute}`);
    }
    bits.push(`next=${episode.nextRecoveryStep.kind}`);
    if (episode.nextRecoveryStep.route) {
      bits.push(`next_route=${episode.nextRecoveryStep.route}`);
    }
    lines.push(bits.join(" | "));
    if (episode.targets.length > 0) {
      lines.push(`Targets: ${episode.targets.join(", ")}`);
    }
    if (episode.observedChangedFiles.length > 0) {
      lines.push(`Observed writes: ${episode.observedChangedFiles.join(", ")}`);
    }
  });
  return lines;
}

export function formatOmegaSemanticRecoveryRecall(
  snippets: OmegaSemanticRecallSnippet[],
): string[] {
  if (snippets.length === 0) {
    return [];
  }
  const lines = [
    "[OMEGA Semantic Recall]",
    "Use semantically related completed episodes as hints, not as proof.",
  ];
  snippets.forEach((snippet, index) => {
    lines.push(`${index + 1}. score=${snippet.score.toFixed(2)} | ${snippet.citation}`);
    lines.push(snippet.snippet);
  });
  return lines;
}
