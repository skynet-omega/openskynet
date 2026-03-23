import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type CognitiveRule = {
  id: string;
  trigger: string; // Escenario donde se aplica (e.g. "Edición de archivos grandes")
  mechanism: string; // El por qué (e.g. "El AST se corrompe por falta de contexto")
  invariant: string; // La regla de oro (e.g. "Usar siempre fragmentos de < 100 líneas")
  confidence: number; // 0-1 basado en repeticiones
  sourceFailures: string[]; // IDs de fallos que originaron esta regla
};

export class CognitiveRuleEngine {
  private rulesPath: string;
  private cachedRules: string | null = null;

  constructor(workspaceRoot: string) {
    this.rulesPath = path.join(workspaceRoot, "memory", "COGNITIVE_RULES.md");
  }

  async distillFromMemories(params: {
    inducedHypothesis: string;
    classKey: string;
    averageCausalImpact: number;
  }): Promise<void> {
    if (params.averageCausalImpact > 0.8) return; // No consolidar si todo va bien

    const ruleId = crypto.createHash("sha256").update(params.classKey).digest("hex").slice(0, 8);
    const ruleContent = `
### 🧠 Regla Cognitiva [${ruleId}]
*   **Clase de Problema:** ${params.classKey}
*   **Hipótesis Destilada:** ${params.inducedHypothesis}
*   **Acción Preventiva:** Basado en el estancamiento observado, evitar reintentos directos sin variar los parámetros de la herramienta.
*   **Estado:** VALIDADA (Impacto Causal Bajo detectado persistentemente)
`;

    await fs.mkdir(path.dirname(this.rulesPath), { recursive: true }).catch(() => {});
    await fs.appendFile(this.rulesPath, ruleContent, "utf-8");
    this.cachedRules = null; // Invalidate cache
  }

  async loadRulesForPrompt(): Promise<string> {
    if (this.cachedRules !== null) return this.cachedRules;

    try {
      const content = await fs.readFile(this.rulesPath, "utf-8");
      this.cachedRules = `\n[OMEGA LEARNED INVARIANTS - Wisdom from previous cycles]\n${content}\n`;
      return this.cachedRules;
    } catch {
      this.cachedRules = "";
      return "";
    }
  }
}
