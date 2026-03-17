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

// Mock del motor de memoria para simular búsqueda semántica
const semanticResultsMock = vi.fn();
vi.mock("../memory/index.js", () => ({
  getMemorySearchManager: async () => ({
    manager: {
      search: semanticResultsMock,
    },
  }),
}));

describe("OMEGA Empirical Validation Suite", () => {
  let workspaceRoot = "";

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "omega-empirical-"));
    semanticResultsMock.mockReset();
  });

  afterEach(async () => {
    if (workspaceRoot) {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("Step 1 & 4: Validates Automatic Export and Engineering Integrity", async () => {
    const sessionKey = "agent:tester:main";
    const task = "Fix broken docker-compose.yml networking";
    const targets = ["docker-compose.yml"];

    // Registramos un resultado
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey,
      task,
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: targets },
      outcome: { status: "ok", observedChangedFiles: targets, writeOk: true },
      execution: { route: "sessions_spawn", runId: "run-1", trigger: "direct" }
    });

    // 1. Verificación física del archivo exportado
    const episodeFile = resolveOmegaEpisodeMemoryFile({ workspaceRoot, sessionKey });
    const fileExists = await fs.access(episodeFile).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    const content = await fs.readFile(episodeFile, "utf-8");
    expect(content).toContain("# OMEGA Recovery Episodes");
    expect(content).toContain(`## Episode 1: ${task}`);
    expect(content).toContain("status: completed");
    
    console.log("✅ EMPIRICAL: Episode export verified on disk.");
  });

  it("Step 2: Validates Hybrid Memory Search (Structured + Semantic)", async () => {
    const sessionKey = "main";
    const targets = ["src/auth.ts"];
    
    // Escenario: El agente ya resolvió un problema de "auth tokens" en el pasado
    await recordOmegaSessionOutcome({
      workspaceRoot,
      sessionKey: "agent:past-session:main",
      task: "Handle expired auth tokens in middleware",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: targets },
      outcome: { status: "ok", observedChangedFiles: targets, writeOk: true },
      execution: { route: "omega_delegate", runId: "old-run", trigger: "direct" }
    });

    // Búsqueda Estructurada (Palabras clave similares)
    const structuredEpisodes = await loadOmegaRecoveryEpisodeRecall({
      workspaceRoot,
      sessionKey,
      task: "Fix auth token expiration",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: targets },
    });
    expect(structuredEpisodes.length).toBeGreaterThan(0);
    expect(structuredEpisodes[0].task).toContain("auth tokens");

    // Búsqueda Semántica (Mocking el resultado del indexador vectorial)
    semanticResultsMock.mockResolvedValue([
      {
        path: "memory/omega-episodes/past_session.md",
        citation: "memory/omega-episodes/past_session.md#L5",
        score: 0.92,
        snippet: "Episode: Resolved middleware issue with token refresh logic."
      }
    ]);

    const semanticSnippets = await loadOmegaSemanticRecoveryRecall({
      workspaceRoot,
      sessionKey,
      task: "Middleware is failing due to credentials", // Tarea redactada de forma muy distinta
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
    });

    expect(semanticSnippets.length).toBeGreaterThan(0);
    expect(semanticSnippets[0].score).toBe(0.92);
    
    console.log("✅ EMPIRICAL: Hybrid search (Structured + Semantic) verified.");
  });

  it("Step 3: Validates Context Injection in Prompt", async () => {
    const sessionKey = "main";
    
    // Simulamos que hay un episodio previo relevante
    semanticResultsMock.mockResolvedValue([
      {
        path: "memory/omega-episodes/agent__main.md",
        citation: "memory/omega-episodes/agent__main.md#L12",
        score: 0.88,
        snippet: "Episode: Fixed circular dependency in main.ts"
      }
    ]);

    const prompt = await buildOmegaInteractionPrompt({
      workspaceRoot,
      sessionKey,
      task: "Circular dependency issues",
      validation: { expectsJson: false, expectedKeys: [], expectedPaths: [] },
    });

    // Verificamos que el prompt final contenga la sección de recall semántico
    expect(prompt).toContain("[OMEGA Semantic Recall]");
    expect(prompt).toContain("Fixed circular dependency in main.ts");
    expect(prompt).toContain("score=0.88");

    console.log("✅ EMPIRICAL: Semantic recall successfully injected into system prompt.");
  });
});
