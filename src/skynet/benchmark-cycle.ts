import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomic } from "../infra/json-files.js";
import { resolveOmegaStateDir } from "../omega/paths.js";
import type { OpenSkynetRuntimeAuthority } from "./runtime-authority.js";
import { syncOpenSkynetRuntimeAuthority } from "./runtime-authority.js";

export type OpenSkynetBenchmarkCycleSnapshot = {
  sessionKey: string;
  updatedAt: number;
  project: {
    key: string;
    name: string;
    role: string;
    mission: string;
    benchmarkPurpose: string;
    successCriteria: string[];
  };
  benchmark: {
    score: number;
    continuityScore: number | null;
    focusKey: string | null;
    focusTitle: string | null;
    mode: string | null;
    topWorkItem: string | null;
    recommendedAction: string | null;
    commitmentTask: string | null;
    deliverable: string | null;
    benchmarkHook: string | null;
  };
  runtime: {
    authorityStateFile: string;
    livingHistoryFile: string;
    benchmarkSnapshotFile: string;
    artifactStateDir: string;
    cycleResultFile: string;
  };
  cycleRules: {
    oneConcreteStepOnly: true;
    doNotBroadScanWorkspace: true;
    doNotInferMissingStateFiles: true;
    benchmarkSnapshotIsDerived: true;
    writeCycleResultTo: string;
    resultKinds: Array<"artifact" | "measurement" | "improvement" | "no-progress">;
    resultFormat: string;
  };
};

function sanitizeSessionKey(sessionKey: string): string {
  return (sessionKey.trim() || "main").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "main";
}

export function resolveOpenSkynetBenchmarkCycleFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    resolveOmegaStateDir(params.workspaceRoot),
    "internal-project-benchmark",
    `${sanitizeSessionKey(params.sessionKey)}.json`,
  );
}

export function resolveOpenSkynetBenchmarkCycleResultFile(params: {
  workspaceRoot: string;
  sessionKey: string;
}): string {
  return path.join(
    resolveOmegaStateDir(params.workspaceRoot),
    "internal-project-benchmark",
    `${sanitizeSessionKey(params.sessionKey)}-last-cycle.json`,
  );
}

export function deriveOpenSkynetBenchmarkCycleSnapshot(
  workspaceRoot: string,
  runtimeAuthority: OpenSkynetRuntimeAuthority,
  benchmarkSnapshotFile: string,
): OpenSkynetBenchmarkCycleSnapshot {
  const stateFile = path.join(
    resolveOmegaStateDir(workspaceRoot),
    "living-memory",
    "state",
    `${sanitizeSessionKey(runtimeAuthority.sessionKey)}.json`,
  );
  const cycleResultFile = resolveOpenSkynetBenchmarkCycleResultFile({
    workspaceRoot,
    sessionKey: runtimeAuthority.sessionKey,
  });

  return {
    sessionKey: runtimeAuthority.sessionKey,
    updatedAt: Date.now(),
    project: {
      key: runtimeAuthority.project.key,
      name: runtimeAuthority.project.name,
      role: runtimeAuthority.project.role,
      mission: runtimeAuthority.project.mission,
      benchmarkPurpose: runtimeAuthority.project.benchmarkPurpose,
      successCriteria: runtimeAuthority.project.successCriteria,
    },
    benchmark: {
      score: runtimeAuthority.livingState.agenticBenchmark.benchmarkScore,
      continuityScore: runtimeAuthority.livingState.agenticBenchmark.continuityScore,
      focusKey: runtimeAuthority.livingState.internalProjectState.focusKey,
      focusTitle: runtimeAuthority.livingState.internalProjectState.focusTitle,
      mode: runtimeAuthority.livingState.internalProjectState.mode,
      topWorkItem: runtimeAuthority.livingState.internalProjectState.topWorkItem,
      recommendedAction: runtimeAuthority.livingState.internalProjectState.recommendedAction,
      commitmentTask:
        runtimeAuthority.livingState.internalProjectState.commitment?.executableTask ?? null,
      deliverable:
        runtimeAuthority.livingState.internalProjectState.experiment?.deliverable ?? null,
      benchmarkHook:
        runtimeAuthority.livingState.internalProjectState.experiment?.benchmarkHook ?? null,
    },
    runtime: {
      authorityStateFile: stateFile,
      livingHistoryFile: path.join(
        resolveOmegaStateDir(workspaceRoot),
        "living-memory",
        "history.jsonl",
      ),
      benchmarkSnapshotFile,
      artifactStateDir: path.join(resolveOmegaStateDir(workspaceRoot), "skynet-artifacts"),
      cycleResultFile,
    },
    cycleRules: {
      oneConcreteStepOnly: true,
      doNotBroadScanWorkspace: true,
      doNotInferMissingStateFiles: true,
      benchmarkSnapshotIsDerived: true,
      writeCycleResultTo: cycleResultFile,
      resultKinds: ["artifact", "measurement", "improvement", "no-progress"],
      resultFormat:
        "RESULT: <artifact|measurement|improvement|no-progress>; IMPACT: <one line>; NEXT: <one line>",
    },
  };
}

export async function writeOpenSkynetBenchmarkCycleSnapshot(params: {
  workspaceRoot: string;
  runtimeAuthority: OpenSkynetRuntimeAuthority;
}): Promise<OpenSkynetBenchmarkCycleSnapshot> {
  const filePath = resolveOpenSkynetBenchmarkCycleFile({
    workspaceRoot: params.workspaceRoot,
    sessionKey: params.runtimeAuthority.sessionKey,
  });
  const snapshot = deriveOpenSkynetBenchmarkCycleSnapshot(
    params.workspaceRoot,
    params.runtimeAuthority,
    filePath,
  );
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await writeJsonAtomic(filePath, snapshot);
  return snapshot;
}

export async function syncOpenSkynetBenchmarkCycleSnapshot(params: {
  workspaceRoot: string;
  sessionKey: string;
}): Promise<OpenSkynetBenchmarkCycleSnapshot> {
  const runtimeAuthority = await syncOpenSkynetRuntimeAuthority(params);
  return writeOpenSkynetBenchmarkCycleSnapshot({
    workspaceRoot: params.workspaceRoot,
    runtimeAuthority,
  });
}
