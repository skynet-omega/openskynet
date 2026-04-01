# Claude Code Runtime Patterns - 2026-04-01

## Veredicto

Claude Code no aporta un "cerebro" listo para copiar a `Omega`. Lo que sí aporta son
patrones de runtime productivo que hacen más confiables los experimentos de aprendizaje:

- contratos de eventos claros
- locks explícitos para trabajo de fondo
- cheap-first gating antes de operaciones costosas
- watchdogs para distinguir lentitud, bloqueo e inactividad real

Eso sí tiene buen costo/beneficio para `OpenSkyNet`.

## Adoptado ya en el lab

### 1. Lock explícito

Inspirado en `autoDream.ts`, el tap live del runtime observer ahora usa lock de archivo:

- `src/skynet/runtime-observer/live-event-store.ts`
- evita correr dos taps al mismo tiempo
- trata el observador como tarea de fondo seria, no como script desechable

### 2. Eventos estructurados y append-only

Inspirado en `toolExecution.ts` y en el tratamiento de tareas de Claude:

- `src/skynet/runtime-observer/live-event-normalizer.ts`
- `src/skynet/experiments/runtime_observer_live_01.ts`

El experimento ya no depende sólo de transcripts finales. Consume eventos vivos del gateway:

- `agent`
- `session.tool`
- `sessions.changed`
- `session.message`

Y los persiste en JSONL append-only.

### 3. Watchdog de quietud

Inspirado en `LocalShellTask.tsx`, el tap live emite eventos sintéticos:

- `tap.connect`
- `tap.idle`
- `tap.disconnect`

Eso evita confundir:

- sistema quieto
- observador roto
- conexión caída

## Patrones valiosos aún pendientes

### Circuit breakers de compaction

`autoCompact.ts` tiene una disciplina útil:

- thresholds baratos primero
- no compactar por costumbre
- distinguir presión real de ruido

Esto sería útil para futuras fases de `runtime-observer` y `cognitive-kernel`, pero todavía no
justifica código nuevo en el kernel.

### Taxonomía fuerte de tool failures

`toolExecution.ts` clasifica mejor:

- error del tool
- error ambiental
- error de permisos
- error recuperable

Esto es probablemente la mejora de más valor para el dataset causal. Hoy `OpenSkyNet` todavía
colapsa demasiados fallos en `stall`.

## Lo que no conviene copiar

- UI/Ink
- Bun-specific infra
- Growthbook/telemetría de producto
- complejidad de desktop/remote no relacionada con el runtime causal

## Criterio para promoción al kernel

Sólo promover si mejora el sistema real de forma medible en al menos una de estas:

- mejor observabilidad causal
- mejor separación entre fallo ambiental y fallo cognitivo
- mejor tasa predictiva del observer sobre baseline
- menor complejidad total que la alternativa hardcodeada
