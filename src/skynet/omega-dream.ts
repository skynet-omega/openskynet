import fs from "node:fs/promises";
import path from "node:path";
import { HolographicMemoryManager } from "../omega/holographic-memory.js";

export interface DreamResult {
  consolidated: number;
  wisdomGained: string[];
  status: "success" | "skipped" | "error";
  reason?: string;
  clusters?: number;
}

export interface OmegaDreamConfig {
  minIntervalMs: number;
  minNewFossils: number;
  minClusterSize: number;
  similarityThreshold: number;
  maxClusterSpanMs: number;
  staleLockMs: number;
  maxClustersPerRun: number;
}

type OmegaDreamState = {
  lastDreamAt?: number;
  lastDreamStatus?: DreamResult["status"];
  lastDreamReason?: string;
  lastDreamClusters?: number;
  totalConsolidated?: number;
};

const DEFAULT_DREAM_CONFIG: OmegaDreamConfig = {
  minIntervalMs: 6 * 60 * 60 * 1000,
  minNewFossils: 6,
  minClusterSize: 2,
  similarityThreshold: 0.94,
  maxClusterSpanMs: 12 * 60 * 60 * 1000,
  staleLockMs: 30 * 60 * 1000,
  maxClustersPerRun: 3,
};

export class OmegaDreamer {
  private memory: HolographicMemoryManager;
  private lockPath: string;
  private statePath: string;
  private readonly config: OmegaDreamConfig;
  private initialized = false;

  constructor(
    private readonly workspaceRoot: string,
    config?: Partial<OmegaDreamConfig>,
  ) {
    this.memory = new HolographicMemoryManager(workspaceRoot);
    this.lockPath = path.join(workspaceRoot, ".openskynet", "skynet", "dream.lock");
    this.statePath = path.join(workspaceRoot, ".openskynet", "skynet", "omega-dream-state.json");
    this.config = { ...DEFAULT_DREAM_CONFIG, ...config };
  }

  async shouldDream(nowMs: number = Date.now()): Promise<
    | {
        shouldDream: true;
        clusters: Awaited<ReturnType<HolographicMemoryManager["findRedundantClusters"]>>;
        state: OmegaDreamState;
      }
    | { shouldDream: false; reason: string; state: OmegaDreamState }
  > {
    await this.ensureInitialized();
    const state = await this.loadState();
    const lockState = await this.ensureLockHealthy(nowMs);
    if (lockState === "locked") {
      return { shouldDream: false, reason: "lock-active", state };
    }

    const lastDreamAt = state.lastDreamAt ?? 0;
    if (lastDreamAt > 0 && nowMs - lastDreamAt < this.config.minIntervalMs) {
      return { shouldDream: false, reason: "interval-not-met", state };
    }

    const fossils = this.memory.getFossilsSnapshot();
    const newFossils = fossils.filter((fossil) => fossil.createdAt > lastDreamAt);
    if (newFossils.length < this.config.minNewFossils) {
      return { shouldDream: false, reason: "not-enough-new-fossils", state };
    }

    const clusters = this.memory.findRedundantClusters({
      sinceTimestamp: lastDreamAt,
      minClusterSize: this.config.minClusterSize,
      similarityThreshold: this.config.similarityThreshold,
      maxClusterSpanMs: this.config.maxClusterSpanMs,
      sameDomainOnly: true,
    });
    if (clusters.length === 0) {
      return { shouldDream: false, reason: "no-redundant-clusters", state };
    }

    return { shouldDream: true, clusters, state };
  }

  async dream(): Promise<DreamResult> {
    const decision = await this.shouldDream();
    if (!decision.shouldDream) {
      await this.saveState({
        ...decision.state,
        lastDreamStatus: "skipped",
        lastDreamReason: decision.reason,
      });
      return { consolidated: 0, wisdomGained: [], status: "skipped", reason: decision.reason };
    }

    const clusters = decision.clusters.slice(0, this.config.maxClustersPerRun);
    const wisdom: string[] = [];
    let consolidated = 0;
    try {
      await this.acquireLock();
      for (const cluster of clusters) {
        const summary = this.distillCluster(cluster.fossils.map((fossil) => fossil.content));
        const result = await this.memory.consolidateCluster({
          cluster,
          summary,
          metadata: {
            dreamedAt: Date.now(),
            workspaceRoot: this.workspaceRoot,
          },
        });
        consolidated += result.consolidatedCount;
        wisdom.push(result.summary);
      }
      await this.saveState({
        ...decision.state,
        lastDreamAt: Date.now(),
        lastDreamStatus: "success",
        lastDreamReason: undefined,
        lastDreamClusters: clusters.length,
        totalConsolidated: (decision.state.totalConsolidated ?? 0) + consolidated,
      });
      return {
        consolidated,
        wisdomGained: wisdom,
        status: "success",
        clusters: clusters.length,
      };
    } catch (error) {
      await this.saveState({
        ...decision.state,
        lastDreamStatus: "error",
        lastDreamReason: error instanceof Error ? error.message : String(error),
      });
      return {
        consolidated: 0,
        wisdomGained: [],
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await this.releaseLock();
    }
  }

  private async ensureInitialized() {
    if (this.initialized) {
      return;
    }
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await this.memory.initialize();
    this.initialized = true;
  }

  private distillCluster(contents: string[]): string {
    const snippets = contents
      .map((content) => content.trim().replace(/\s+/g, " "))
      .filter(Boolean)
      .slice(0, 3)
      .map((content) => (content.length <= 160 ? content : `${content.slice(0, 159).trimEnd()}…`));
    return `[Dream synthesis] ${contents.length} related fossils distilled into one memory. Signals: ${snippets.join(" | ")}`;
  }

  private async loadState(): Promise<OmegaDreamState> {
    try {
      const raw = await fs.readFile(this.statePath, "utf-8");
      return JSON.parse(raw) as OmegaDreamState;
    } catch {
      return {};
    }
  }

  private async saveState(state: OmegaDreamState) {
    await fs.writeFile(this.statePath, JSON.stringify(state, null, 2), "utf-8");
  }

  private async ensureLockHealthy(nowMs: number): Promise<"free" | "locked"> {
    try {
      const stat = await fs.stat(this.lockPath);
      if (nowMs - stat.mtimeMs > this.config.staleLockMs) {
        await fs.unlink(this.lockPath).catch(() => {});
        return "free";
      }
      return "locked";
    } catch {
      return "free";
    }
  }

  private async acquireLock() {
    await fs.writeFile(this.lockPath, Date.now().toString());
  }

  private async releaseLock() {
    try {
      await fs.unlink(this.lockPath);
    } catch {}
  }
}
