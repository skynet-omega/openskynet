# Auditoría Crítica V2

> Estado actualizado al `2026-04-04`. Este documento reemplaza el diagnóstico anterior para que el repo no quede con hallazgos ya resueltos mezclados con pendientes reales.

## Veredicto

El kernel de `src/omega` ya no está en el estado criticado originalmente. Las piezas que antes eran aspiracionales o engañosas quedaron en una de estas categorías:

- `resuelto`: el problema lógico fue corregido en código y cubierto por tests.
- `parcial`: el problema bajó de severidad, pero todavía falta validación empírica más dura.
- `vigente`: sigue siendo una deuda real y no debe venderse como cerrada.

## Macro

### Resuelto

- `recovery.ts`: la recuperación autónoma ya no aborta tras un solo fallo. `OMEGA_AUTONOMOUS_RECOVERY_MAX_FAILURE_STREAK` pasó a `2`, con tests en `wake-policy.test.ts` y `task-transaction.test.ts`.
- `omega-wsp.ts`: WSP dejó de ser solo lectura. Ahora tiene writer único por turno desde `recordOmegaSessionOutcome()`, persiste en `.openskynet/omega-wsp.json`, actualiza drives, beliefs, causal edges y tensiones.
- `state-authority.ts`: WSP ya no tiene autoridad por existir. Solo cuenta si fue calibrado de verdad (`updateCount > 0`) y no está stale.
- `jepa-drive-enhancement.ts`: sigue manteniendo el nombre histórico por compatibilidad, pero el contenido y los reasons visibles ahora lo describen como heurística observacional, no como JEPA real.
- `session-context.ts`: se corrigió la canonicalización de `sessionKey`, eliminando el bug que vaciaba transacciones al recargar.
- `sparse-metabolism.ts` y `omega-integrated-reasoning.ts`: `Lyapunov` y `CausalReasoner` quedaron fuera del path productivo por defecto detrás de `OPENSKYNET_EXPERIMENTAL_REASONING=1`.
- `science-base-writer.ts`: ya no deduplica por substring débil. Ahora normaliza task+files, deduplica por clave semántica y dispara compresión automática cuando la tabla crece.
- `science-base-compressor.ts`: además de deduplicar, ahora impone un tope real de reglas para evitar crecimiento indefinido.

### Parcial

- `omega-wsp.ts`: beliefs y causal edges ya tienen writer y lector, pero todavía falta medir con ablación dura si mejoran decisiones reales frente a `kernel-only`.
- `study-supervisor.ts` y `problem-agenda.ts`: siguen siendo capas derivadas útiles, pero no tienen benchmark fuerte de utilidad incremental.
- `science-base`: ya no crece de forma ingenua, pero su valor sigue dependiendo de la calidad de las reglas generadas; la poda de tamaño evita daño, no demuestra beneficio.

### Vigente

- No existe todavía una ablación formal `kernel-only vs kernel+WSP` que pruebe costo/beneficio en decisiones reales.
- `Lyapunov` y `CausalReasoner` están correctamente despromovidos, pero no rehabilitados. Siguen siendo experimentos, no capacidades productivas demostradas.

## Meso

### 1. Kernel + Wake Policy

Estado: `resuelto`

Sigue siendo la parte más limpia y falsable del sistema. El cambio importante fue remover el aborto prematuro de recovery. Hoy el comportamiento es más razonable:

- `failureStreak <= 2`: todavía intenta recuperación.
- `failureStreak >= 3`: aborta la recuperación interrumpida.

### 2. Durable Memory + Empirical Metrics

Estado: `resuelto`

No apareció evidencia nueva que contradiga el diagnóstico bueno original. Siguen siendo las piezas más directamente empíricas del kernel:

- aprendizaje por fingerprint de tarea/targets
- routing ajustado por historial
- métricas operativas persistidas en JSON llano

### 3. WSP

Estado: `parcial`

La crítica original ya no es correcta. Antes WSP estaba medio muerto; ahora sí cierra un loop mínimo:

`turno -> syncOmegaWspFromTurn -> saveOmegaWsp -> state-authority/policy`

Qué sí hace ahora:

- decaimiento temporal de drives
- satisfacción/penalización por outcome
- tensiones persistentes
- beliefs mínimas sobre outcome, errores y targets verificables
- causal edges mínimos sobre tarea→error y tarea→write

Qué falta:

- demostrar que este estado cambia decisiones con beneficio neto suficiente
- evitar inflar la narrativa más allá de ese loop mínimo

### 4. Lyapunov Controller

Estado: `resuelto` como problema de honestidad arquitectónica

No fue “arreglado” para producción; fue correctamente relegado a experimento opt-in. Eso resuelve el problema práctico: ya no contamina el kernel productivo con una promesa que no cumple.

### 5. CausalReasoner

Estado: `resuelto` como problema de honestidad arquitectónica

Mismo criterio que Lyapunov. Sigue existiendo como laboratorio, no como pieza activa del runtime normal.

### 6. JEPA Enhancement

Estado: `resuelto`

La implementación sigue siendo heurística simple, pero ya no se presenta como una capacidad que no es. El problema pendiente aquí era semántico y de arquitectura de expectativas, no de corrección funcional.

### 7. SCIENCE_BASE

Estado: `parcial`

Antes el problema era doble:

- dedupe débil
- compresión no automática

Eso ya quedó corregido:

- el writer normaliza archivos, deduplica por task+files y evita duplicados por orden distinto
- la compresión se dispara automáticamente al cruzar umbral
- el compresor también recorta el tamaño total de reglas retenidas

Lo que sigue pendiente es más epistemológico que operativo: demostrar que las reglas retenidas mejoran realmente el comportamiento en vez de solo ocupar contexto.

## Micro

### M1. Recovery max failure streak

Estado: `resuelto`

- Antes: `1`
- Ahora: `2`
- Evidencia: `wake-policy.test.ts`, `task-transaction.test.ts`

### M2. WSP sin writer real

Estado: `resuelto`

- Antes: WSP era casi todo estructura sin metabolismo operativo
- Ahora: `recordOmegaSessionOutcome()` sincroniza WSP por turno y persiste el resultado

### M3. Beliefs y causal edges del WSP vacíos

Estado: `resuelto`

Ya no están vacíos por diseño. Se alimentan con outcome, targets esperados, cambios observados y kinds de error.

### M4. Dos grafos causales muertos en producción

Estado: `resuelto` de forma pragmática

El kernel mantiene su grafo útil. Las otras capas causales quedaron fuera del path productivo por defecto en lugar de seguir fingiendo relevancia runtime.

### M5. SCIENCE_BASE sin control de crecimiento

Estado: `resuelto`

Ahora hay:

- dedupe por clave normalizada
- compresión automática por umbral
- límite de reglas retenidas

## Conclusión

La versión anterior de esta auditoría quedó obsoleta en puntos clave. Hoy el juicio más honesto es:

- el núcleo útil del sistema sí existe y está mejor alineado con su retórica
- las capas experimentales fueron despromovidas correctamente
- WSP pasó de “casi decorativo” a “mínimamente operativo”
- la deuda principal ya no es de wiring, sino de validación empírica costo/beneficio

## Criterio para subir a Git

Para este frente, el proyecto ya no tiene un pendiente crítico que impida subirlo por incoherencia interna del kernel. Lo que queda abierto es investigación y benchmark, no una contradicción obvia entre documento y código productivo.
