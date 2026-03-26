# Skynet - Nucleo Experimental

Fecha: 2026-03-25
Autor: Codex

## Proposito

`Skynet` es hoy el nombre por defecto del proyecto interno autónomo configurado en `INTERNAL_PROJECT.json`.

No reemplaza a `OpenSkyNet`. Tampoco define por sí solo la identidad completa del sistema.

La division correcta ahora es:

- `OpenSkyNet`: agente principal, supervision, memoria, evaluacion, tooling, canales y benchmark global
- `Omega`: linea experimental interna del propio agente/plataforma
- `Skynet`: proyecto interno por defecto para trabajo libre y benchmarking de autonomia agentica

## Tesis

El stack actual de `OpenSkyNet` es util, pero sigue demasiado cerca de un agente instrumental basado en LLM.

Para buscar un salto de arquitectura, el trabajo nuevo debe concentrarse en un nucleo con:

- continuidad interna persistente
- agenda cientifica endogena
- costo cognitivo real
- decision como bifurcacion y no solo scoring
- dualidad entre ejecutivo y campo dinamico

## Modulos minimos

### 1. Executive lobe

Mantiene:

- macro objetivo actual
- pregunta activa
- nivel de compromiso

No decide todo.
Su funcion es sostener direccion.

### 2. Metabolic layer

Mantiene:

- presupuesto cognitivo
- strain
- curiosidad
- sesgo de conservacion

Su funcion es introducir costo y tension real.

### 3. Pattern field

Mantiene:

- coherencia
- plasticidad
- bias de localidad

Su funcion es representar cuanto puede cambiar el sistema sin romperse.

### 4. Study supervisor bridge

Conecta `Skynet` con la cola de investigacion persistente y con la agenda abierta del runtime actual.

## Estado actual

Ya existe un primer prototipo minimo en [nucleus.ts](/home/daroch/openskynet/src/skynet/nucleus.ts#L1).

Tambien existe un primer programa de trabajo persistente en [study-program.ts](/home/daroch/openskynet/src/skynet/study-program.ts#L1).

Y ahora existe una primera medicion de continuidad en [continuity-tracker.ts](/home/daroch/openskynet/src/skynet/continuity-tracker.ts#L1).

Ademas existe un ciclo de experimento activo en [experiment-cycle.ts](/home/daroch/openskynet/src/skynet/experiment-cycle.ts#L1).

Y ahora existe un primer modulo experimental ejecutable en [autonomy_pulse_01.ts](/home/daroch/openskynet/src/skynet/experiments/autonomy_pulse_01.ts#L1).

Tambien existe un primer artefacto de bifurcacion ejecutiva en [decision-bifurcation-probe.ts](/home/daroch/openskynet/src/skynet/artifacts/decision-bifurcation-probe.ts#L1).

Ese prototipo:

- persiste un estado por sesion
- deriva un modo basal: `explore`, `reframe`, `stabilize` o `exploit`
- toma como input la agenda de estudio consolidada y las senales operativas recientes
- se integra al `world model`
- genera work items concretos para que el modo libre del sistema produzca artefactos y evidencia
- registra continuidad entre ciclos para medir si el foco y el trabajo sobreviven
- genera un experimento activo con hipotesis, deliverable, benchmark hook y kill criteria
- ya puede correr un modulo experimental que estima presion de iniciativa y decide si intensificar, mantener, estabilizar o reencuadrar
- ya puede correr un probe de bifurcacion que decide si mantener, ramificar o comprometer el siguiente paso

Todavia no existe:

- dinamica interna continua
- aprendizaje estructural propio
- bifurcaciones causales verdaderas
- automejora fuerte

## Que partes del estado anterior siguen vigentes

Estas afirmaciones siguen siendo utiles, pero ya no son el centro estrategico:

1. Fase 1 cerrada; convergencia de Fases 2 y 3 en curso
2. baseline funcional de engines en `src/omega/engines`
3. gateway y `decision-context` estables

Estas siguen siendo verdad como base de plataforma.
No son el siguiente salto.

## Que pasa a segundo plano

Estas lineas no deben monopolizar la agenda:

- hardening incremental de engines como si fuera el objetivo final
- mas microajustes de routing/policy sin cambio de nucleo
- expansion de complejidad sin nueva dinamica interna

## Siguiente milestone real

El siguiente milestone no es otro documento.

Es este:

- usar el `study supervisor` y el `nucleus` para sostener un programa de estudio autonomo
- traducir ese programa a experimentos persistentes
- medir si aparece continuidad operativa, agenda propia y aprendizaje estructural
