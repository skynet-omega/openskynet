# OpenClaw vs OpenSkyNet

**Fecha:** 2026-03-26

Este documento compara el padre `openclaw` con `OpenSkyNet` para medir si realmente nos estamos distanciando o si solo estamos acumulando adornos.

## 1. Veredicto

`OpenSkyNet` ya supera a `openclaw` en **ambicion experimental** y en la capacidad de sostener un proyecto interno autónomo configurable como benchmark agentico.

`OpenSkyNet` todavia no supera al padre en **disciplina operacional global**.

La conclusion correcta no es "vamos mal".
La conclusion correcta es:

- `openclaw` sigue siendo mas nitido como plataforma general
- `OpenSkyNet` ya es mas interesante como laboratorio cognitivo
- el trabajo serio ahora es convertir esa ambicion en una arquitectura mas soberana y menos cosida a mano

## 2. Donde El Padre Sigue Mejor

### 2.1 Automatizacion y scheduling

El padre tiene mas claro el contrato entre:

- heartbeat
- cron
- sesiones principales
- sesiones aisladas
- retencion de sesiones
- logs operativos

Eso se ve en:

- `docs/automation/cron-vs-heartbeat.md`
- `docs/gateway/heartbeat.md`
- `docs/reference/session-management-compaction.md`

`OpenSkyNet` heredó esa base, pero la mezcló por momentos con loops propios y termino ensuciando `main` hasta que se corrigio.

### 2.2 Superficie de producto

`openclaw` es mas limpio como producto:

- mejores fronteras entre gateway, channels, cron y UI
- mejores docs operativas para control UI, seguridad y scheduling
- menos ambiguedad sobre que path gobierna que conducta

### 2.3 Cohesion del runtime general

El padre tiene menos ambicion cognitiva, pero por eso mismo tiene menos stitching manual entre capas.

## 3. Donde OpenSkyNet Ya Supera Al Padre

### 3.1 Memoria viva experimental

El padre no tiene un equivalente fuerte a:

- `.openskynet/living-memory/state/*.json`
- `.openskynet/living-memory/history.jsonl`
- un proyecto interno persistente y configurable, hoy `Skynet`

Eso ya es una diferencia real, no cosmetica.

### 3.2 World model y capa de experimento

`OpenSkyNet` ya integra:

- `world-model`
- `state-authority`
- `study-supervisor`
- `nucleus`
- `continuity`
- `commitment`
- artefactos de experimento

El padre no intenta eso.

### 3.3 Direccion de salto

El padre quiere ser una plataforma agente potente.

`OpenSkyNet` quiere ser una plataforma que incube un nucleo cientifico soberano.

Eso es un objetivo distinto y mucho mas exigente.

## 4. Riesgo Real De OpenSkyNet

El riesgo no es "ser peor que el padre".
El riesgo es este:

- tener mas ideas que el padre
- tener mas modulos que el padre
- pero no tener una ley de estado y decision mas fuerte que el padre

Eso produciria exactamente el problema que queremos evitar:

> un clon del padre con adornos experimentales poco justificados

## 5. Que Cambio Marca Diferencia Real

La diferencia real no sale de agregar probes aislados.
Sale de estas consolidaciones:

### 5.1 Autoridad de memoria viva

El proyecto interno ya no depende de diarios planos como fuente primaria.

### 5.2 Desacople de heartbeat legacy

El `main` humano ya no debe recibir basura de automatizacion de fondo.

### 5.3 Autoridad de runtime para el proyecto interno

Desde esta revision existe `src/skynet/runtime-authority.ts`.

Eso importa porque:

- `pulse`
- `autonomy_pulse_01`
- `decision-bifurcation-probe`

ya no recalculan por separado:

- `world-model`
- experimento activo
- compromiso
- memoria viva

Eso ya no es un micro-ajuste.
Es una reduccion real de stitching manual en la capa experimental.

## 6. Test Falsable

Podemos decir que `OpenSkyNet` se distancia bien del padre solo si en las siguientes iteraciones ocurre esto:

1. menos centros de estado
2. menos sesiones contaminadas
3. menos recalculo duplicado
4. mas decision estructurada y menos narrativa libre
5. mas ciencia autonoma medible

Si no ocurre eso, entonces solo estaremos envolviendo `openclaw` con retorica cognitiva.

## 7. Recomendacion

La estrategia correcta no es seguir copiando mecanismos del padre ni descartarlos por orgullo.

La estrategia correcta es:

- conservar del padre lo que ya es disciplinado
- superar al padre donde el objetivo de `OpenSkyNet` exige mas
- matar toda diferencia que no produzca una mejora causal demostrable

En una linea:

`OpenSkyNet` debe dejar de ser "OpenClaw + Omega + Skynet" y pasar a ser una sola arquitectura con soberania propia.
