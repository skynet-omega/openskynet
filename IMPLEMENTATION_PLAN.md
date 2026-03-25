# Implementation Plan

Fecha: 2026-03-25
Base: `ANALISIS_EMPIRICO_MACRO_MICRO.md` + contraste directo con el codigo real de `~/openskynet`

## 0. Proposito

Este plan existe para convertir el analisis en ejecucion sin caer en dos errores:

- abrir otra arquitectura paralela encima de la actual
- importar experimentos externos como monolitos sin benchmark ni seam

La direccion es esta:

- consolidar OpenSkyNet alrededor de un runtime ejecutivo unico
- definir un estado canonico unico
- mover los motores experimentales a interfaces comparables
- medir todo con benchmark y kill criteria

## 1. Baseline verificado

Hechos ya verificados en el repo:

- `src/auto-reply/reply/get-reply.ts` ya usa `src/omega/inbound-cognition.ts`
- existe una columna ejecutiva real en:
  - `src/omega/executive-arbitration.ts`
  - `src/omega/executive-runtime.ts`
  - `src/omega/executive-state.ts`
  - `src/omega/execution-controller.ts`
- existe telemetria en:
  - `src/omega/empirical-metrics.ts`
  - `src/omega/empirical-validation.ts`
  - `src/omega/learning-validation.ts`
  - `src/omega/live-validation.ts`
  - `src/omega/jepa-empirical-logger.ts`

Desalineaciones actuales:

- `src/agents/openclaw-tools.ts` sigue mezclando demasiadas responsabilidades
- `src/omega/heartbeat.ts` sigue siendo un punto de mezcla entre runtime y frontera experimental
- el estado sigue fragmentado entre `session-context`, `self-time-kernel`, `operational-memory`, `durable-memory`, `world-model`, `executive-state`, `omega-wsp`, `holographic-memory`
- `omega_work` y `heartbeat` comparten objetivos pero no consumen la misma economia de decision extremo a extremo

## 2. Reglas de implementacion

- No duplicar estructuras ya existentes. Si una pieza ya existe, converger sobre ella.
- No crear otro loop ejecutivo paralelo.
- No meter motores experimentales directo en `get-reply.ts`, `heartbeat.ts` o builders generales.
- No portar `SKYNET_OMEGA` ni `SKYNET_X` completos.
- Toda hipotesis nueva debe declarar:
  - variable observable
  - archivo de implementacion
  - benchmark de validacion
  - criterio de descarte

## 3. Roadmap

### Fase 1. Delimitar el sustrato estable

Objetivo:
separar framework general de runtime de entidad y de frontera experimental.

Archivos de entrada:

- `src/agents/openclaw-tools.ts`
- `src/agents/pi-tools.ts`
- `src/agents/tools/omega-work-tool.ts`
- `src/agents/tools/sessions-send-tool.ts`
- `src/agents/tools/sessions-spawn-tool.ts`

Trabajo:

1. Extraer suites desde `src/agents/openclaw-tools.ts` sin cambiar comportamiento:
   - `src/agents/tool-suites/core-tools.ts`
   - `src/agents/tool-suites/session-tools.ts`
   - `src/agents/tool-suites/omega-tools.ts`
   - `src/agents/tool-suites/plugin-tools.ts`
2. Dejar `openclaw-tools.ts` como ensamblador fino.
3. Marcar explícitamente qué tools son:
   - substrate
   - runtime
   - experimental

Salida esperada:

- `openclaw-tools.ts` deja de ser el punto único de registro manual
- la frontera `omega` queda visible como grupo

Criterio de salida:

- el diff de comportamiento es nulo o mínimo
- `pnpm build` pasa
- tests existentes de tools y sesiones siguen pasando

### Fase 2. Estado canonico unico

Objetivo:
definir una snapshot minima que alimente decision, ejecucion y aprendizaje.

Archivos de entrada:

- `src/omega/session-context.ts`
- `src/omega/self-time-kernel.ts`
- `src/omega/operational-memory.ts`
- `src/omega/durable-memory.ts`
- `src/omega/world-model.ts`
- `src/omega/executive-state.ts`
- `src/omega/omega-wsp.ts`
- `src/omega/holographic-memory.ts`

Trabajo:

1. Introducir:
   - `src/omega/runtime-state/cognitive-runtime-state.ts`
   - `src/omega/runtime-state/load-runtime-state.ts`
   - `src/omega/runtime-state/save-runtime-state.ts`
2. Clasificar stores actuales como:
   - canonico
   - derivado
   - experimental
   - observabilidad
3. Crear adapters, no migraciones destructivas:
   - `src/omega/runtime-state/adapters/session-context-adapter.ts`
   - `src/omega/runtime-state/adapters/self-time-kernel-adapter.ts`
   - `src/omega/runtime-state/adapters/operational-memory-adapter.ts`
   - `src/omega/runtime-state/adapters/durable-memory-adapter.ts`
   - `src/omega/runtime-state/adapters/world-model-adapter.ts`

Forma minima del estado:

- identity
- active goals
- tensions
- current focus
- resource budget
- recent outcomes
- current world observations

Salida esperada:

- una sola snapshot reconstruible
- el resto de stores pasa a ser fuente derivada o sidecar explícito

Criterio de salida:

- `heartbeat`, `omega_work` y runtime ejecutivo pueden leer la misma snapshot

### Fase 3. Convergencia del loop ejecutivo

Objetivo:
usar la columna ejecutiva existente como centro real del sistema.

Archivos de entrada:

- `src/omega/executive-arbitration.ts`
- `src/omega/executive-runtime.ts`
- `src/omega/executive-state.ts`
- `src/omega/execution-controller.ts`
- `src/omega/policy-engine.ts`
- `src/omega/frontal/wake-policy.ts`
- `src/omega/heartbeat.ts`
- `src/omega/autonomous-executor.ts`
- `src/agents/tools/omega-work-tool.ts`

Trabajo:

1. Definir la cadena canonica:
   - observe -> `executive-arbitration.ts`
   - plan -> `executive-runtime.ts`
   - persist -> `executive-state.ts`
   - route/control -> `execution-controller.ts`
2. Hacer que `omega_work` consulte esta cadena antes de rutear trabajo.
3. Hacer que `heartbeat.ts` deje de decidir por ramas paralelas cuando exista señal ejecutiva suficiente.
4. Reducir la lógica duplicada entre:
   - `policy-engine.ts`
   - `wake-policy.ts`
   - `heartbeat.ts`
   - `omega-work-tool.ts`

No hacer:

- no crear todavía otro runtime en `src/omega/executive/*` si la extracción no está clara

Salida esperada:

- cada acción relevante puede rastrearse a una decisión del mismo stack ejecutivo

Criterio de salida:

- una misma tarea produce la misma política base tanto desde `omega_work` como desde `heartbeat`

### Fase 4. Interfaz formal de engines

Objetivo:
desacoplar motores experimentales del path crítico.

Archivos de entrada:

- `src/omega/neural-logic-engine.ts`
- `src/omega/jepa-control.ts`
- `src/omega/bifasic-client.ts`
- `src/omega/continuous-thinking-engine.ts`
- `src/omega/entropy-minimization-loop.ts`
- `src/omega/omega-integrated-reasoning.ts`
- `src/omega/integrated-brain.ts`
- `src/omega/heartbeat.ts`

Trabajo:

1. Introducir tipos comunes:
   - `src/omega/engines/types.ts`
   - `src/omega/engines/registry.ts`
   - `src/omega/engines/score-engine-signal.ts`
2. Envolver motores existentes con adapters:
   - `src/omega/engines/adapters/nle-engine.ts`
   - `src/omega/engines/adapters/jepa-engine.ts`
   - `src/omega/engines/adapters/bifasic-engine.ts`
   - `src/omega/engines/adapters/integrated-reasoning-engine.ts`
3. Sustituir imports directos en `heartbeat.ts` por consumo de señales agregadas desde registry.
4. Mantener el LLM como engine, no como centro ontológico.

Forma minima:

```ts
type EngineSignal = {
  confidence: number;
  urgency?: number;
  proposedFocus?: string;
  frustration?: number;
  novelty?: number;
  viability?: number;
  notes?: string[];
};
```

Salida esperada:

- `heartbeat.ts` deja de conocer detalles internos de cada engine
- cada engine produce señales comparables

Criterio de salida:

- desactivar un engine no rompe el runtime
- activar un engine nuevo no requiere tocar `get-reply.ts` ni `heartbeat.ts`

### Fase 5. Frontera experimental falsable

Objetivo:
llevar ideas de `SOLITONES` al repo como módulos pequeños y medibles.

Fuentes externas prioritarias:

- `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V4.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V5.py`
- `/home/daroch/SOLITONES/EX/SKYNET_CORE_V17_GATED.py`
- `/home/daroch/SOLITONES/EX/SKYNET_CORE_V27_HOLO_KOOPMAN.py`
- `/home/daroch/SOLITONES/EX/SKYNET_CORE_V55_HOLODYNAMICS.py`
- `/home/daroch/SOLITONES/EX/SKYNET_CORE_V67_OMEGA.py`
- `/home/daroch/SOLITONES/EX/SKYNET_CORE_V77_5_CHIMERA.py`

Primeras hipótesis a probar:

1. `frustration` como señal ejecutiva explícita
2. `viability` como métrica compuesta de continuidad operativa
3. `memory_integrity` e `interference_pressure` como guardas de escritura
4. forcing dinámico sobre estado latente, no solo scoring heurístico

Implementación sugerida:

- `src/omega/engines/experimental/viability-signal.ts`
- `src/omega/engines/experimental/memory-integrity.ts`
- `src/omega/engines/experimental/interference-pressure.ts`
- `src/omega/engines/experimental/latent-forcing.ts`

Ecuaciones mínimas de referencia:

```text
z_{t+1} = f(z_t, u_t, d_t, m_t)
EFE(a) = base(a) + w_e * epistemic(a) + w_n * ambiguity(a) + w_p * pragmatic_risk(a)
viability = alpha * predictive_coherence + beta * memory_integrity + gamma * homeostatic_stability
```

Regla:

- extraer patrones, no monolitos

### Fase 6. Benchmark y descarte

Objetivo:
hacer que complejidad nueva tenga que ganarse su lugar.

Archivos de entrada:

- `src/omega/empirical-metrics.ts`
- `src/omega/empirical-validation.ts`
- `src/omega/learning-validation.ts`
- `src/omega/live-validation.ts`
- `src/omega/evals.ts`
- `src/omega/jepa-empirical-logger.ts`

Suites a crear siguiendo la convención actual:

- `src/omega/omega-runtime-baseline.test.ts`
- `src/omega/omega-engine-ablation.test.ts`
- `src/omega/omega-memory-interference.test.ts`
- `src/omega/omega-viability-metrics.test.ts`

Métricas obligatorias:

1. false success prevention
2. recovery after interruption
3. useful autonomous actions per 24h
4. mean dispatch cost
5. state coherence across sessions
6. utilidad añadida / complejidad añadida

Kill criteria:

- si un engine no mejora ninguna métrica acordada, sale del core
- si un engine solo aporta narrativa o introspección cosmética, queda experimental
- si una memoria experimental no preserva localidad de escritura, no entra al runtime

## 4. Orden de ejecucion recomendado

1. Fase 1
2. Fase 2
3. Fase 3
4. Fase 6 en paralelo temprano
5. Fase 4
6. Fase 5

Razon:

- primero hay que limpiar fronteras y estado
- luego unificar decision
- despues medir
- solo entonces tiene sentido empujar frontera experimental

## 5. Primeros tres entregables concretos

### Entregable A

Refactor de `src/agents/openclaw-tools.ts` a suites sin cambiar comportamiento.

### Entregable B

Primer `CognitiveRuntimeState` con adapters desde stores actuales, aunque todavía sea parcial.

### Entregable C

Primer `engine registry` que envuelva NLE y JEPA y quite imports directos de engines desde `heartbeat.ts`.

## 6. Definicion de exito

El plan va bien si al final de estas fases se cumple esto:

- el runtime tiene una columna ejecutiva claramente identificable
- el estado operativo tiene una snapshot canonica
- los engines experimentales compiten por interfaz y benchmark
- las ideas de `SOLITONES` entran como modulos pequeños, medibles y removibles
- OpenSkyNet deja de crecer como collage y empieza a crecer como sistema convergente
