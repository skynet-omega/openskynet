# 📚 API_REFERENCE.md — Public Functions & Types

**Descripción:** Todas las funciones públicas que puede usar un agente entrante.

---

## 🎯 HEARTBEAT.ts — El Loop Principal

**Archivo:** `src/omega/heartbeat.ts`  
**Propósito:** Main loop autónomo que ejecuta cada ciclo

### Función Principal
```typescript
export async function runHeartbeat(
  context: HeartbeatContext,
  options?: HeartbeatOptions
): Promise<HeartbeatResult>
```

**Parámetros:**
- `context: HeartbeatContext` — Estado actual del sistema
- `options?: HeartbeatOptions` — Configuración optional

**Retorna:**
```typescript
{
  cycleId: string;
  decisions: Decision[];
  executed: number;
  tension_before: number;
  tension_after: number;
  logs: LogEntry[];
}
```

**Ejemplo:**
```typescript
const result = await runHeartbeat({
  current_state: {...},
  memory: episodicRecall
}, { verbose: true });

console.log(`Decisiones ejecutadas: ${result.executed}`);
```

### Sub-funciones (internas, pero accesibles)
```typescript
// Detecta señales de tensión
async function checkTensionSignals(state): Promise<TensionSignal[]>

// Evalúa qué hacer (elige motor)
async function evaluateDrives(state, signals): Promise<Decision>

// Ejecuta decisión en el mundo
async function executeDecision(decision): Promise<ExecutionResult>
```

---

## 🧠 NEURAL_LOGIC_ENGINE.ts — Razonamiento sin LLM

**Archivo:** `src/omega/neural-logic-engine.ts`  
**Propósito:** Inference lógico/simbólico sin llamadas al LLM

### Clase Principal
```typescript
export class NeuralLogicEngine {
  constructor(rules?: Rule[], embeddings?: Embedding[])
  
  // Razona sobre un contexto
  async reason(
    context: ReasoningContext,
    state: AgentState
  ): Promise<LogicalConclusion>
  
  // Aprende de una experiencia
  async learn(episode: Episode): Promise<void>
  
  // Obtiene reglas aplicables
  getRules(context: ReasoningContext): Rule[]
}
```

**Ejemplo:**
```typescript
const engine = new NeuralLogicEngine();

const conclusion = await engine.reason({
  query: "¿Debería resetear la conexión?",
  available_actions: ["reset", "retry", "abort"]
}, agentState);

// conclusion.action = "reset"
// conclusion.confidence = 0.95
```

**Reglas internas:** ~64 reglas aprendidas (en latent space)

---

## 💾 EPISODIC_RECALL.ts — Memoria Consolidada

**Archivo:** `src/omega/episodic-recall.ts`  
**Propósito:** Almacenar y recuperar episodios aprendidos

### Clase Principal
```typescript
export class EpisodicRecall {
  constructor()
  
  // Almacena un episodio
  async store(episode: Episode): Promise<void>
  
  // Recupera similares
  async retrieve(query: RetrievalQuery): Promise<Episode[]>
  
  // Consolida episodios múltiples
  async consolidate(): Promise<void>
}
```

**Estructura de Episode:**
```typescript
interface Episode {
  id: string;
  timestamp: Date;
  state: AgentState;
  action: Decision;
  outcome: Outcome;
  lesson?: string;
  embedding?: number[];  // Embedding semántico
}
```

**Ejemplo:**
```typescript
const recall = new EpisodicRecall();

// Guardar un episodio
await recall.store({
  state: {...},
  action: decision,
  outcome: { success: true, time_ms: 150 }
});

// Recuperar aprendizajes similares
const similar = await recall.retrieve({
  query: "¿Qué pasó cuando intenté conexión remota?",
  limit: 5
});
```

---

## ⚡ OLLAMA_STREAM.ts — Inferencia

**Archivo:** `src/agents/ollama-stream.ts`  
**Propósito:** Llamadas a modelos de lenguaje (cloud + local)

### Función Principal
```typescript
async function createOllamaStreamResponse(
  prompt: string,
  model: string,
  options?: InferenceOptions
): Promise<string>
```

**Parámetros:**
- `prompt: string` — Lo que preguntar
- `model: string` — `'kimi-k2.5:cloud'` o `'qwen3.5:latest'`
- `options.temperature?: number` — [0.1, 1.0]
- `options.timeout?: number` — ms (default: 60000)

**Retorna:** Texto de respuesta completa

**Ejemplo:**
```typescript
const response = await createOllamaStreamResponse(
  "¿Cuál es el siguiente paso?",
  "kimi-k2.5:cloud",
  { timeout: 60000 }
);
```

### POC-1 Integration (interno)
```typescript
// Automático: temperature se ajusta según modelo
// qwen3.5:latest → T=0.3 (reducido por POC-1)
// kimi-k2.5:cloud → T=0.7 (sin cambio)
```

---

## 🛡️ LYAPUNOV_CONTROLLER.ts — Homeostasis

**Archivo:** `src/omega/lyapunov-controller.ts`  
**Propósito:** Detecta y mitiga divergencia/estrés

### Clase Principal
```typescript
export class LyapunovController {
  constructor(options?: ControllerOptions)
  
  // Calcula divergencia actual
  calculateDivergence(
    state_current: State,
    state_previous: State,
    prediction: Prediction
  ): number  // [0.0, 1.0]
  
  // Aplica control (damping)
  applyControl(
    state: State,
    divergence: number
  ): ControlSignal
}
```

**Señales de Control:**
```typescript
enum ControlZone {
  VERDE = "divergence < 0.3",      // OK
  AMARILLO = "0.3 <= d < 0.6",     // Reduce temperature
  ROJO = "d >= 0.6"                // Fallback a rules
}
```

**Ejemplo:**
```typescript
const controller = new LyapunovController();

const div = controller.calculateDivergence(
  currentState,
  previousState,
  nextStatePrediction
);

if (div > 0.6) {
  const signal = controller.applyControl(currentState, div);
  // signal.action = "use_rules_only"  // Evitar LLM
}
```

---

## 🌀 ENTROPY_MINIMIZATION_LOOP.ts — Homeostasis

**Archivo:** `src/omega/entropy-minimization-loop.ts`  
**Propósito:** Reduce desorden interno

### Función Principal
```typescript
export async function minimizeEntropy(
  system_state: SystemState
): Promise<EntropySummary>
```

**Acciones:**
- Detecta contradicciones
- Consolida episodios similares
- Actualiza reglas si es necesario
- Limpia log temporal

**Retorna:**
```typescript
{
  entropy_before: number;
  entropy_after: number;
  changes_made: number;
  time_ms: number;
}
```

---

## 📊 TYPES.ts — Estructuras Clave

**Archivo:** `src/omega/types.ts`  
**Propósito:** Tipos compartidos

```typescript
// Estado del agente
interface AgentState {
  id: string;
  cycle: number;
  tension: number;           // [0.0, 1.0]
  autonomy_level: number;    // [0.0, 1.0]
  memory: EpisodicRecall;
  rules: Rule[];
}

// Decisión que tomar
interface Decision {
  action: string;
  confidence: number;
  reasoning: string;
  estimated_time_ms: number;
}

// Resultado de ejecución
interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  time_ms: number;
}
```

---

## 🎯 ENTRY POINTS PARA AGENTES

### Si necesitas RAZONAR (sin LLM)
→ `NeuralLogicEngine.reason()`

### Si necesitas APRENDER
→ `EpisodicRecall.store()` + `.consolidate()`

### Si necesitas PREGUNTAR AL LLM
→ `createOllamaStreamResponse()`

### Si necesitas DETECTAR ESTRÉS
→ `LyapunovController.calculateDivergence()`

### Si necesitas ENTENDER ESTADO
→ `runHeartbeat()` retorna `HeartbeatResult`

---

## ⚠️ LO QUE NO HAGAS

```
❌ No llamar directamente a temperatura hardcoded
   → Usa createOllamaStreamResponse() (incluye POC-1)

❌ No ignorar LyapunovController si divergence > 0.6
   → Significa que algo está mal

❌ No almacenar estado en memoria volátil
   → Usa EpisodicRecall o session logs

❌ No ejecutar heartbeat sin verificar CURRENT_STATE.md
   → Puede haber problemas conocidos
```

---

## 🔍 Ejemplo Completo: Un Ciclo

```typescript
// 1. En heartbeat.ts:
const result = await runHeartbeat(context);

// 2. Internamente, eso llama:
const signals = await checkTensionSignals(state);  // Detecta problema

// 3. Elige qué hacer:
const decision = await evaluateDrives(state, signals);
// decision.action = "query_llm"

// 4. Ejecuta:
if (decision.action === "query_llm") {
  const response = await createOllamaStreamResponse(
    decision.prompt,
    "kimi-k2.5:cloud"
    // POC-1 automáticamente ajusta temp si es qwen
  );
}

// 5. Aprende del resultado:
const episode: Episode = {
  state: state,
  action: decision,
  outcome: { success: true, ... }
};
await episodicRecall.store(episode);

// 6. Log:
await logState(result);
```

---

**Para más detalles:** Lee el código fuente directamente.  
**Para entender decisiones:** Ver `ARCHITECTURE_DECISIONS.md`.  
**Para verificar estado:** Ver `CURRENT_STATE.md`.
