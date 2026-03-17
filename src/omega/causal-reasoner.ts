/**
 * Causal Reasoner para OpenSkyNet
 * 
 * Problema: LLMs ven CORRELACIÓN no CAUSALIDAD
 *   - Si historia de 100 veces que A → B, asumen A causa B
 *   - Pero puede ser: A y B correlacionan porque C causa ambos
 * 
 * Solución: Razonador causal ligero que:
 *   1. Construye DAG (Directed Acyclic Graph) de dependencias observadas
 *   2. Detecta confounders (variables confusoras)
 *   3. Aplica intervenciones (do-calculus) mentalmente antes de decidir
 *   4. Resultado: Decisiones más robustas
 * 
 * Inspiración: exp05_causal_expansion en EXPERIMENTOS
 */

export interface CausalNode {
  name: string;
  type: 'cause' | 'effect' | 'confounder';
  parents: string[];     // Variables que causan esta
  children: string[];    // Variables que esta causa
  strength: number;      // Fuerza de la causalidad (0-1)
  evidence: number;      // Cuántas veces observado (prior)
  lastUpdated: number;
}

export interface CausalEdge {
  from: string;
  to: string;
  strength: number;      // 0-1, fuerza de la causalidad
  type: 'direct' | 'confounded' | 'indirect';
  evidence: number;      // Cuántas observaciones apoyan esto
}

export interface InterventionPlan {
  action: string;
  expectedEffects: { variable: string; direction: 'up' | 'down'; confidence: number }[];
  potentialBackfires: string[];
  reason: string;
}

export class CausalReasoner {
  private nodes: Map<string, CausalNode> = new Map();
  private edges: Map<string, CausalEdge> = new Map();
  private confounders: Set<string> = new Set();

  private observationCount = 0;
  private readonly EVIDENCE_THRESHOLD = 3; // Mínimo para creer una causalidad

  // No default causes right now
  constructor() {}

  /**
   * Observar una correlación entre dos variables
   * (Puede ser causal o correlación espuria)
   */
  observeCorrelation(
    varA: string,
    varB: string,
    direction: 'A→B' | 'B→A' | 'bidirectional'
  ): void {
    // Asegurar que existen los nodos
    if (!this.nodes.has(varA)) this.nodes.set(varA, this._createNode(varA, 'cause'));
    if (!this.nodes.has(varB)) this.nodes.set(varB, this._createNode(varB, 'effect'));

    const nodeA = this.nodes.get(varA)!;
    const nodeB = this.nodes.get(varB)!;

    if (direction === 'A→B' || direction === 'bidirectional') {
      // Potencial edge A → B
      const edgeKey = `${varA}→${varB}`;
      if (!this.edges.has(edgeKey)) {
        this.edges.set(edgeKey, {
          from: varA,
          to: varB,
          strength: 0.5,
          type: 'direct',
          evidence: 0,
        });
      }

      const edge = this.edges.get(edgeKey)!;
      edge.evidence++;
      edge.strength = Math.min(1, edge.evidence / 10); // Crecer con evidencia

      nodeA.children.push(varB);
      nodeB.parents.push(varA);
    }

    if (direction === 'B→A' || direction === 'bidirectional') {
      // Potencial edge B → A
      const edgeKey = `${varB}→${varA}`;
      if (!this.edges.has(edgeKey)) {
        this.edges.set(edgeKey, {
          from: varB,
          to: varA,
          strength: 0.5,
          type: 'direct',
          evidence: 0,
        });
      }

      const edge = this.edges.get(edgeKey)!;
      edge.evidence++;
      edge.strength = Math.min(1, edge.evidence / 10);

      nodeB.children.push(varA);
      nodeA.parents.push(varB);
    }

    this.observationCount++;

    // Si encontramos confounders, marcarlos
    if (direction === 'bidirectional') {
      this.confounders.add(varA);
      this.confounders.add(varB);
    }
  }

  /**
   * Detectar confounders (variables que causan ambas observadas)
   * Usa simple heurística: si dos variables tienen muchos padres en común
   */
  detectConfounders(): string[] {
    const potentialConfounders: string[] = [];

    for (const [nodeName, node] of this.nodes) {
      // Si tiene muchos hijos sin ser el "final" en la cadena
      // Podría ser un confounder
      if (node.children.length >= 2 && node.parents.length === 0) {
        potentialConfounders.push(nodeName);
        this.confounders.add(nodeName);
      }
    }

    return potentialConfounders;
  }

  /**
   * Core: Razonamiento causal
   * 
   * Pregunta: "¿Si hago acción X, qué pasará?"
   * Respuesta: Intervención mental en el DAG
   */
  reasonAboutIntervention(action: string): InterventionPlan {
    // Encontrar qué variable representa la acción
    let actionNode = this.nodes.get(action);
    if (!actionNode) {
      actionNode = this._createNode(action, 'cause');
      this.nodes.set(action, actionNode);
    }

    // 1. Recorrer el grafo para encontrar efectos directos
    const directEffects: string[] = actionNode.children;
    const expectedEffects: { variable: string; direction: 'up' | 'down'; confidence: number }[] = [];

    // 2. Expandir a efectos indirectos (BFS)
    const visited = new Set<string>();
    const queue = [...directEffects];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const node = this.nodes.get(current);
      if (node) {
        const edge = Array.from(this.edges.values()).find(
          (e) => e.from === action && e.to === current
        );
        const confidence = edge?.strength ?? 0.5;

        expectedEffects.push({
          variable: current,
          direction: 'up', // Asumir que la acción causa aumento
          confidence,
        });

        // Continuar a efectos indirectos
        queue.push(...node.children);
      }
    }

    // 3. Detectar backfires (efectos adversos inesperados)
    const potentialBackfires: string[] = [];
    for (const confounder of this.confounders) {
      const node = this.nodes.get(confounder);
      if (node && node.children.includes(action)) {
        // El confounder causa la acción, así que al intervenir
        // podrías romper la cadena causal y causar un backlash
        potentialBackfires.push(
          `Confounder '${confounder}' may cause unexpected side effects`
        );
      }
    }

    const reason =
      expectedEffects.length > 0
        ? `Action '${action}' has ${expectedEffects.length} direct/indirect effects based on causal graph`
        : `Action '${action}' has no known causal chain. Proceed with caution.`;

    return {
      action,
      expectedEffects,
      potentialBackfires,
      reason,
    };
  }

  /**
   * Comparar dos acciones causalmente
   */
  compareActions(
    action1: string,
    action2: string
  ): {
    winner: string;
    reasoning: string;
    expectedEffectsA1: number;
    expectedEffectsA2: number;
    confoundersA1: number;
    confoundersA2: number;
  } {
    const plan1 = this.reasonAboutIntervention(action1);
    const plan2 = this.reasonAboutIntervention(action2);

    const expectedCount1 = plan1.expectedEffects.length;
    const expectedCount2 = plan2.expectedEffects.length;
    const backfireCount1 = plan1.potentialBackfires.length;
    const backfireCount2 = plan2.potentialBackfires.length;

    // Scoring: más efectos esperados es bueno (si positivos)
    // Más potenciales backfires es malo
    const score1 = expectedCount1 - backfireCount1 * 2;
    const score2 = expectedCount2 - backfireCount2 * 2;

    const winner = score1 > score2 ? action1 : action2;
    const reasoning =
      score1 > score2
        ? `'${action1}' has better causal structure (${expectedCount1} effects, ${backfireCount1} backfires)`
        : `'${action2}' has better causal structure (${expectedCount2} effects, ${backfireCount2} backfires)`;

    return {
      winner,
      reasoning,
      expectedEffectsA1: expectedCount1,
      expectedEffectsA2: expectedCount2,
      confoundersA1: backfireCount1,
      confoundersA2: backfireCount2,
    };
  }

  /**
   * Obtener el DAG como descripción textual
   */
  explainCausalStructure(): string {
    if (this.nodes.size === 0) {
      return '[Causal] No causal structure learned yet.';
    }

    let explanation = `[Causal Reasoner]\n`;
    explanation += `  Nodes: ${this.nodes.size}\n`;
    explanation += `  Edges: ${this.edges.size}\n`;
    explanation += `  Confounders detected: ${this.confounders.size}\n`;
    explanation += `  Total observations: ${this.observationCount}\n\n`;

    // Root causes (sin padres)
    const roots = Array.from(this.nodes.values()).filter((n) => n.parents.length === 0);
    if (roots.length > 0) {
      explanation += `  Root Causes:\n`;
      for (const root of roots) {
        explanation += `    → ${root.name} (children: ${root.children.join(', ')})\n`;
      }
    }

    // Confounders
    if (this.confounders.size > 0) {
      explanation += `\n  Confounders:\n`;
      for (const conf of this.confounders) {
        const node = this.nodes.get(conf);
        if (node) {
          explanation += `    ⚠ ${conf} (causes: ${node.children.join(', ')})\n`;
        }
      }
    }

    return explanation;
  }

  /**
   * Helpers
   */
  private _createNode(name: string, type: 'cause' | 'effect' | 'confounder'): CausalNode {
    return {
      name,
      type,
      parents: [],
      children: [],
      strength: 0.5,
      evidence: 1,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Estadísticas
   */
  getStats() {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      confounders: this.confounders.size,
      observations: this.observationCount,
      avgEdgeStrength:
        Array.from(this.edges.values()).reduce((s, e) => s + e.strength, 0) /
        Math.max(1, this.edges.size),
    };
  }
}

/**
 * Singleton
 */
let reasonerInstance: CausalReasoner | null = null;

export function getCausalReasoner(): CausalReasoner {
  if (!reasonerInstance) {
    reasonerInstance = new CausalReasoner();
  }
  return reasonerInstance;
}

export function initializeCausalReasoner(): CausalReasoner {
  reasonerInstance = new CausalReasoner();
  console.log('[Causal] Reasoner initialized');
  return reasonerInstance;
}
