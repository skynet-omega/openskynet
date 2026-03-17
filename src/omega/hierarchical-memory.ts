/**
 * Hierarchical Memory para OpenSkyNet
 * 
 * 4 niveles inspirados en arquitectura cognitiva humana (Miller, 1956):
 * 
 * 0. Working Memory    — Buffer limitado (7 items, contexto actual, ~1 segundo)
 * 1. Episodic Memory   — Eventos con z_state tensor (~10 minutos)
 * 2. Semantic Memory   — Conceptos abstractos (patrones, reglas) (~permanente)
 * 3. Procedural Memory — Skills ejecutables (~permanente)
 * 
 * El ciclo:
 *   Working → Episodic (cada decisión) → Semantic (cada 5-10 episodios)
 *                                      → Procedural (cuando se ejecuta skill)
 * 
 * Permite que OpenSkyNet "consolide" lo que aprende dormido (cuando no actúa)
 */

export interface WorkingMemoryItem {
  timestamp: number;
  content: {
    driveKind: string;
    frustration: number;
    successRate: number;
    action?: string;
  };
}

export interface EpisodicMemoryItem {
  timestamp: number;
  cycleNumber: number;
  z_state: number[];        // Latent state snapshot
  frustration: number;
  driveKind: string;
  outcome: 'success' | 'failure' | 'neutral';
  reward?: number;
  metadata?: Record<string, any>;
}

export interface SemanticConcept {
  id: string;
  name: string;
  pattern: number[];        // Abstract pattern in latent space
  frequency: number;        // Cuántas veces visto
  avgReward: number;
  lastSeen: number;
  rule?: string;            // if-then rule en texto
}

export interface ProceduralSkill {
  name: string;
  description: string;
  conditions: string[];     // when to use
  steps: string[];          // how to execute
  successRate: number;
  lastUsed: number;
}

export class HierarchicalMemory {
  // Nivel 0: Working Memory
  private working: WorkingMemoryItem[] = [];
  private readonly WORKING_CAPACITY = 7; // Miller's magical number

  // Nivel 1: Episodic Memory (fossil-like, con tensores)
  private episodic: EpisodicMemoryItem[] = [];
  private readonly EPISODIC_MAX_SIZE = 10000;

  // Nivel 2: Semantic Memory (conceptos)
  private semantic: Map<string, SemanticConcept> = new Map();
  private readonly CONSOLIDATION_THRESHOLD = 3; // episodios similares → concepto

  // Nivel 3: Procedural Memory (skills)
  private procedural: Map<string, ProceduralSkill> = new Map();

  // Estado de consolidación
  private episodesSinceConsolidation = 0;
  private lastConsolidationTime = Date.now();

  constructor() {
    this.initializeDefaultSkills();
  }

  /**
   * Nivel 0: Working Memory - add/retrieve
   */
  addToWorking(item: Omit<WorkingMemoryItem, 'timestamp'>): void {
    this.working.push({
      ...item,
      timestamp: Date.now(),
    });

    if (this.working.length > this.WORKING_CAPACITY) {
      this.working.shift(); // FIFO
    }
  }

  getWorkingMemory(): WorkingMemoryItem[] {
    return [...this.working];
  }

  clearWorking(): void {
    this.working = [];
  }

  /**
   * Nivel 1: Episodic Memory - fossil brain
   * Almacena snapshots del estado latent + metadatos
   */
  addEpisode(
    z_state: number[],
    frustration: number,
    driveKind: string,
    outcome: 'success' | 'failure' | 'neutral',
    cycleNumber: number,
    metadata?: Record<string, any>
  ): void {
    const episode: EpisodicMemoryItem = {
      timestamp: Date.now(),
      cycleNumber,
      z_state: [...z_state], // Copia para no mutar
      frustration,
      driveKind,
      outcome,
      metadata,
    };

    this.episodic.push(episode);
    if (this.episodic.length > this.EPISODIC_MAX_SIZE) {
      this.episodic.shift(); // FIFO - olvida lo más antiguo
    }

    this.episodesSinceConsolidation++;

    // Trigger consolidación automática cada N episodios
    if (this.episodesSinceConsolidation >= this.CONSOLIDATION_THRESHOLD) {
      this._consolidateToSemantic();
      this.episodesSinceConsolidation = 0;
    }
  }

  /**
   * Nivel 1: Query episodic memory (similar a retrieve_relevant)
   */
  queryEpisodic(
    z_query: number[],
    k: number = 3
  ): EpisodicMemoryItem[] {
    if (this.episodic.length === 0) return [];

    // Similarity search: encontrar k episodios más similares
    const similarities = this.episodic.map((ep) => ({
      episode: ep,
      similarity: this.cosineSimilarity(z_query, ep.z_state),
    }));

    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, k).map((s) => s.episode);
  }

  /**
   * Nivel 2: Semantic Memory - consolidación automática
   * Convierte episodios similares en conceptos abstractos
   */
  private _consolidateToSemantic(): void {
    if (this.episodic.length < this.CONSOLIDATION_THRESHOLD) return;

    // Agrupar últimos episodios por driveKind
    const recentEpisodes = this.episodic.slice(-this.CONSOLIDATION_THRESHOLD);
    const byDrive: Map<string, EpisodicMemoryItem[]> = new Map();

    for (const ep of recentEpisodes) {
      const key = ep.driveKind;
      if (!byDrive.has(key)) byDrive.set(key, []);
      byDrive.get(key)!.push(ep);
    }

    // Para cada grupo, crear/actualizar concepto semántico
    for (const [driveKind, episodes] of byDrive) {
      const avgState = this._averageState(
        episodes.map((e) => e.z_state)
      );
      const avgReward = episodes.reduce(
        (s, e) => s + (e.metadata?.reward ?? 0),
        0
      ) / episodes.length;

      const conceptId = `semantic_${driveKind}_${Date.now()}`;
      const concept: SemanticConcept = {
        id: conceptId,
        name: `Pattern: ${driveKind}`,
        pattern: avgState,
        frequency: episodes.length,
        avgReward,
        lastSeen: Date.now(),
        rule: `When drive is ${driveKind}, avg reward=${avgReward.toFixed(2)}`,
      };

      this.semantic.set(conceptId, concept);
    }

    this.lastConsolidationTime = Date.now();
  }

  /**
   * Nivel 2: Query semantic memory
   */
  getSemanticConcepts(): SemanticConcept[] {
    return Array.from(this.semantic.values());
  }

  querySemantic(pattern: string): SemanticConcept[] {
    return Array.from(this.semantic.values()).filter(
      (c) =>
        c.name.toLowerCase().includes(pattern.toLowerCase()) ||
        c.rule?.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  /**
   * Nivel 3: Procedural Memory
   */
  addSkill(skill: ProceduralSkill): void {
    this.procedural.set(skill.name, skill);
  }

  getSkill(name: string): ProceduralSkill | undefined {
    return this.procedural.get(name);
  }

  getSuggestedSkills(task: string): ProceduralSkill[] {
    const taskLower = task.toLowerCase();
    return Array.from(this.procedural.values()).filter(
      (s) =>
        s.conditions.some((c) => taskLower.includes(c.toLowerCase())) ||
        s.description.toLowerCase().includes(taskLower)
    );
  }

  /**
   * Interfaz unificada: retrieve_relevant()
   * Simila a SKYNET_OMEGA, combina todos los niveles
   */
  retrieveRelevantContext(
    z_query: number[],
    taskText: string
  ): {
    working: WorkingMemoryItem[];
    episodic: EpisodicMemoryItem[];
    semantic: SemanticConcept[];
    procedural: ProceduralSkill[];
  } {
    return {
      working: this.getWorkingMemory(),
      episodic: this.queryEpisodic(z_query, 5),
      semantic: this.querySemantic(taskText),
      procedural: this.getSuggestedSkills(taskText),
    };
  }

  /**
   * Helpers
   */
  private _averageState(states: number[][]): number[] {
    if (states.length === 0) return [];
    const dim = states[0].length;
    const result = Array(dim).fill(0);
    for (const state of states) {
      for (let i = 0; i < dim; i++) {
        result[i] += state[i];
      }
    }
    return result.map((v) => v / states.length);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
    const normA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const normB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (normA * normB);
  }

  /**
   * Inicializar skills por defecto
   */
  private initializeDefaultSkills(): void {
    this.addSkill({
      name: 'frustrated_exploration',
      description: 'When frustration is high, explore alternatives',
      conditions: ['frustration > 0.7', 'success_rate < 0.3'],
      steps: [
        'Increase entropy',
        'Sample from exploration polytope',
        'Log alternative outcomes',
      ],
      successRate: 0.65,
      lastUsed: 0,
    });

    this.addSkill({
      name: 'stability_maintenance',
      description: 'When things are working, hold the line',
      conditions: ['frustration < 0.4', 'success_rate > 0.7'],
      steps: ['Reduce entropy', 'Commit to known good pattern', 'Refine slightly'],
      successRate: 0.85,
      lastUsed: 0,
    });

    this.addSkill({
      name: 'error_recovery',
      description: 'When error diverges, reset and retry',
      conditions: ['error > 0.9', 'consecutive_failures > 2'],
      steps: ['Clear working memory', 'Re-initialize drive', 'Use episodic memory to guide'],
      successRate: 0.72,
      lastUsed: 0,
    });
  }

  /**
   * Estadísticas completas
   */
  getStats() {
    return {
      working: this.working.length,
      episodic: this.episodic.length,
      semantic: this.semantic.size,
      procedural: this.procedural.size,
      avgEpisodicReward: this.episodic.reduce((s, e) => s + (e.metadata?.reward ?? 0), 0) / Math.max(1, this.episodic.length),
      lastConsolidation: this.lastConsolidationTime,
      timeSinceConsolidation: Date.now() - this.lastConsolidationTime,
    };
  }
}

/**
 * Singleton
 */
let hmInstance: HierarchicalMemory | null = null;

export function getHierarchicalMemory(): HierarchicalMemory {
  if (!hmInstance) {
    hmInstance = new HierarchicalMemory();
  }
  return hmInstance;
}

export function initializeHierarchicalMemory(): HierarchicalMemory {
  hmInstance = new HierarchicalMemory();
  console.log('[HM] Hierarchical Memory initialized (4 levels)');
  return hmInstance;
}
