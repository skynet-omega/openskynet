import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildOmegaInteractionPrompt } from "./interaction-model.js";
import { recordOmegaSessionOutcome } from "./session-context.js";
import { 
  resolveOmegaEpisodeMemoryFile, 
  loadOmegaRecoveryEpisodeRecall,
  loadOmegaSemanticRecoveryRecall
} from "./episodic-recall.js";

// Mock del motor de memoria
const semanticResultsMock = vi.fn();
vi.mock("../memory/index.js", () => ({
  getMemorySearchManager: async () => ({
    manager: {
      search: semanticResultsMock,
    },
  }),
}));

describe("OMEGA Memory Stress Tests", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-stress-"));
    semanticResultsMock.mockReset();
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("Stress 1: High-volume rapid transaction export", async () => {
    const sessionKey = "agent:stress-tester:main";
    const transactionCount = 50;
    
    // Ejecutamos 50 transacciones en ráfaga
    const tasks = Array.from({ length: transactionCount }).map((_, i) => ({
      task: `Rapid Task ${i}`,
      targets: [`file_${i}.txt`]
    }));

    for (const t of tasks) {
      await recordOmegaSessionOutcome({
        workspaceRoot,
        sessionKey,
        task: t.task,
        validation: { expectsJson: false, expectedKeys: [], expectedPaths: t.targets },
        outcome: { status: "ok", observedChangedFiles: t.targets, writeOk: true },
        execution: { route: "sessions_spawn", trigger: "direct" }
      });
    }

    const episodeFile = resolveOmegaEpisodeMemoryFile({ workspaceRoot, sessionKey });
    const content = await fs.readFile(episodeFile, "utf-8");
    
    // OMEGA_EPISODE_MEMORY_LIMIT es 12. Debería haber exactamente 12 episodios en el .md
    const episodeHeaders = content.match(/^## Episode/gm);
    expect(episodeHeaders?.length).toBe(12);
    
    // Debería contener los más recientes (del 38 al 49 si el índice empezó en 0)
    expect(content).toContain("Rapid Task 49");
    expect(content).not.toContain("Rapid Task 0");
    
    console.log("🔥 STRESS: High-volume export handled correctly (Pruning verified).");
  });

  it("Stress 2: Semantic ambiguity and overlap", async () => {
    const sessionKey = "main";
    
    // Creamos episodios muy similares pero distintos
    const similarProblems = [
      { task: "Fix Docker networking timeout", snippet: "Added keep-alive to docker config" },
      { task: "Fix Postgres connection timeout", snippet: "Increased pool size in pg-init" },
      { task: "Fix Redis connection timeout", snippet: "Updated redis-cli timeout params" }
    ];

    semanticResultsMock.mockResolvedValue(similarProblems.map((p, i) => ({
      path: `memory/omega-episodes/session_${i}.md`,
      citation: `session_${i}.md#L10`,
      score: 0.95 - (i * 0.05),
      snippet: `Episode: ${p.snippet}`
    })));

    const prompt = await buildOmegaInteractionPrompt({
      workspaceRoot,
      sessionKey,
      task: "Service timeout issues",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
    });

    // OMEGA_SEMANTIC_RECALL_RESULT_LIMIT es 2. Debería haber solo 2 resultados en el prompt.
    expect(prompt).toContain("1. score=0.95");
    expect(prompt).toContain("2. score=0.90");
    expect(prompt).not.toContain("score=0.85");
    
    expect(prompt).toContain("Added keep-alive");
    expect(prompt).toContain("Increased pool size");
    
    console.log("🔥 STRESS: Semantic ambiguity handled (Top-K filtering verified).");
  });

  it("Stress 3: Prompt pressure and context bloat", async () => {
    const sessionKey = "main";
    const longTask = "A".repeat(1000); // Tarea muy larga
    
    // Llenamos el kernel con muchos fallos previos
    for (let i = 0; i < 5; i++) {
      await recordOmegaSessionOutcome({
        workspaceRoot,
        sessionKey,
        task: `Prior Failure ${i}`,
        validation: { expectsJson: true, expectedKeys: ["k"], expectedPaths: ["p.ts"] },
        outcome: { status: "error", errorKind: "invalid_structured_result" }
      });
    }

    semanticResultsMock.mockResolvedValue([
      {
        path: "memory/omega-episodes/huge.md",
        citation: "huge.md#L1",
        score: 0.99,
        snippet: "B".repeat(2000) // Snippet muy largo
      }
    ]);

    const prompt = await buildOmegaInteractionPrompt({
      workspaceRoot,
      sessionKey,
      task: longTask,
      validation: { expectsJson: true, expectedKeys: ["k"], expectedPaths: ["p.ts"] },
    });

    // Validamos integridad estructural del prompt a pesar del tamaño
    expect(prompt).toContain("[OMEGA Input Interpretation]");
    expect(prompt).toContain("[OMEGA Similar Episodes]");
    expect(prompt).toContain("[OMEGA Semantic Recall]");
    expect(prompt).toContain("[OMEGA Outcome Model]");
    
    // Verificamos que el snippet largo esté presente (compactado)
    if (prompt) {
      expect(prompt.length).toBeGreaterThan(2000);
    }
    
    console.log("🔥 STRESS: Prompt pressure handled without structural breakdown.");
  });

  it("Stress 4: Concurrency and race conditions", async () => {
    const sessionKeys = ["agent:worker-1:main", "agent:worker-2:main", "agent:worker-3:main"];
    
    // Ejecutamos grabaciones en paralelo de diferentes agentes sobre el mismo workspace
    const promises = sessionKeys.map(key => recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: key,
      task: `Concurrent Task for ${key}`,
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: ["shared.ts"] },
      outcome: { status: "ok", observedChangedFiles: ["shared.ts"], writeOk: true }
    }));

    await Promise.all(promises);

    // Verificamos que cada agente tenga su propio archivo de memoria sin colisiones
    for (const key of sessionKeys) {
      const episodeFile = resolveOmegaEpisodeMemoryFile({ workspaceRoot, sessionKey: key });
      const fileExists = await fs.access(episodeFile).then(() => true).catch(() => false);
      expect(fileExists, `Memory file for ${key} should exist`).toBe(true);
      
      const content = await fs.readFile(episodeFile, "utf-8");
      expect(content).toContain(`Concurrent Task for ${key}`);
    }
    
    console.log("🔥 STRESS: Concurrency handled (Multi-agent safe).");
  });
});
