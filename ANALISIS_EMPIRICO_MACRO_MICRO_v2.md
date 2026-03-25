# Analisis Empirico Macro/Micro v2

Fecha: 2026-03-25
Autor: Codex
Base de evidencia: lectura directa de codigo en `src/`, contraste con `ANALISIS_EMPIRICO_MACRO_MICRO.md`, `IMPLEMENTATION_PLAN.md`, `AUDITORIA_CRITICA_V2.md`, y validacion local de tests focalizados.

## 0. Proposito de esta v2

Este documento no reemplaza al analisis largo original.

Su funcion es otra:

- releer el plan y la auditoria contra el repo actual
- distinguir que partes quedaron correctas, viejas o superadas
- dejar una foto compacta del estado real
- fijar el siguiente milestone util

La conclusion central es esta:

- el repo ya no esta en el estado descrito por la auditoria mas dura
- tampoco llego todavia al runtime ejecutivo unico propuesto por el analisis original
- el salto de las ultimas iteraciones fue real, pero fue un salto de convergencia, no de cierre

## 1. Relectura de los documentos previos

### 1.1 `ANALISIS_EMPIRICO_MACRO_MICRO.md`

Sigue siendo el mejor documento de direccion.

Lo que sigue correcto:

- no conviene seguir acumulando modulos heterogeneos
- la direccion buena sigue siendo converger runtime, estado y engines
- `heartbeat` era un punto de mezcla excesivo
- el seam inbound en `get-reply.ts` era una frontera estructural importante
- la columna ejecutiva era mas prometedora que seguir agregando piezas laterales

Lo que necesita matiz:

- la Fase 2 original proponia otro arbol de estado canonico; hoy eso seria un error
- el repo ya avanzo mas de lo que el documento original podia reflejar en convergencia entre `heartbeat` y `omega_work`

### 1.2 `IMPLEMENTATION_PLAN.md`

Quedo mitad ejecutado y mitad obsoleto.

Estado por fase:

- Fase 1: hecha
- Fase 2: replanteada
- Fase 3: mayormente hecha
- Fase 4: hecha en su baseline util, no en su version final
- Fase 5 y 6: no hechas

La parte que descarto explicitamente del plan es esta:

- no abrir `src/omega/runtime-state/*` como otro store canonico

La parte que mantengo:

- clasificar stores con autoridad explicita
- usar la misma decision base en `heartbeat` y `omega_work`
- desacoplar engines del path critico mediante interfaz y scoring comparable
- medir con benchmark y ablation antes de seguir agregando motores

### 1.3 `AUDITORIA_CRITICA_V2.md`

Sigue siendo util como presion conceptual, pero ya no describe bien el repo actual en varios puntos.

Quedo vieja en esto:

- ya no es correcto decir que no hay continuidad real o que todo el pensamiento continuo muere sin persistencia
- ya no es correcto decir que no existe WSP o que las drives homeostaticas son solo una idea
- ya no es correcto decir que `heartbeat` orquesta todo sin ningun contexto compartido

Sigue acertando en esto:

- el sistema todavia no tiene soberania arquitectonica cerrada
- el LLM sigue siendo parte del motor ejecutivo efectivo
- no existe todavia un loop frio/caliente claramente separado
- no hay benchmark formal suficiente para decidir entre engines o matar hipotesis

## 2. Estado real verificado hoy

### 2.1 Fase 1: sustrato estable

Esto ya cerro.

Evidencia:

- `src/agents/openclaw-tools.ts` ya es un ensamblador fino
- existen `src/agents/tool-suites/core-tools.ts`
- existen `src/agents/tool-suites/session-tools.ts`
- existen `src/agents/tool-suites/omega-tools.ts`
- existen `src/agents/tool-suites/plugin-tools.ts`

Lectura:

- el builder monolitico original ya no es el cuello principal
- la frontera entre sustrato, sesiones y `omega` ahora es visible

### 2.2 Fase 2: estado canonico unico

No esta resuelta como "single store".

Pero ya no estamos en el punto anterior.

Lo que si existe:

- `src/omega/decision-context.ts` como snapshot compartida para decision
- `src/omega/state-authority.ts` como clasificacion explicita de autoridad
- `src/omega/policy-engine.ts` consumiendo WSP solo cuando hay autoridad activa
- `src/omega/omega-wsp.ts` cargado en el path comun de decision

Lo que eso significa:

- ya existe una matriz de autoridad real
- ya no estamos discutiendo en abstracto que store deberia mandar
- el repo ya distingue entre `authoritative`, `derived`, `fallback` y `experimental`

Lo que todavia no existe:

- una sola fuente persistida que reemplace de verdad a `self-time-kernel`, `execution-controller`, `operational-memory`, `world-model` y `omega-wsp`

Diagnostico preciso:

- la Fase 2 no se resolvio por consolidacion fisica de stores
- se resolvio parcialmente por gobernanza de stores
- eso fue la decision correcta

### 2.3 Fase 3: convergencia del loop ejecutivo

Esta mayormente hecha.

Evidencia:

- `src/omega/decision-context.ts` alimenta tanto `heartbeat` como `omega_work`
- `src/agents/tools/omega-work-tool.ts` carga contexto comun y consulta routing ejecutivo validado
- `src/omega/heartbeat.ts` consume `driveSignal`, `stateAuthority` y `controllerState` desde la misma snapshot
- `src/omega/execution-controller.ts` ya no es solo sidecar observacional; participa en dispatch real

Ganancia estructural:

- `heartbeat` y `omega_work` ya no operan como dos cerebros casi separados
- la politica base ya no se recalcula por caminos totalmente independientes

Deuda restante:

- todavia hay logica repartida entre `wake-policy`, `policy-engine`, `heartbeat` y el dispatch ejecutivo
- el LLM sigue entrando demasiado arriba en la cadena de control

### 2.4 Fase 4: interfaz formal de engines

Esta cerrada en su baseline util.

Evidencia:

- existen `src/omega/engines/types.ts`
- existe `src/omega/engines/registry.ts`
- existe `src/omega/engines/score-engine-signal.ts`
- `src/omega/heartbeat.ts` ya consume `collectKernelSignals()` + `testUntestedHypotheses()` + scoring agregado
- `src/omega/heartbeat-idle.ts` usa la misma logica de score sobre señales

Esto ya no es "registry parcial".

Lo que ya se logro:

- los engines producen señales comparables
- `heartbeat` dejo de depender solo de llamadas sueltas a modulos experimentales
- las hipotesis ya no activan trabajo autonomo por si solas
- la señal agregada puede reforzar o no la drive base compartida

Lo que todavia no cerro:

- no existen aun adapters formales por engine en `src/omega/engines/adapters/*`
- el registry sigue envolviendo singletons y wrappers legacy de forma directa
- no hay benchmark A/B serio sobre el scoring nuevo

Conclusion:

- Fase 4 no esta pendiente
- Fase 4 baseline ya esta hecha
- lo pendiente es su endurecimiento experimental

### 2.5 Fase 5 y 6: benchmark y kill criteria

Siguen abiertas.

Eso importa porque hoy el repo ya tiene suficiente convergencia interna como para medir, pero todavia no suficiente disciplina experimental como para cerrar hipotesis.

## 3. Que gano realmente el sistema

- Menos dispersion entre `heartbeat` y `omega_work`
- Mas centralidad real del stack ejecutivo
- WSP integrado en decision, aunque no siempre con autoridad activa
- Una clasificacion explicita de autoridad de estado
- Un registry de engines que ya sirve como capa comun
- Un scoring agregado de señales que evita activaciones triviales por bookkeeping experimental

Lo importante aca es conceptual:

antes el problema era "faltan piezas".

hoy el problema ya no es ese.

hoy el problema es:

- hay varias piezas correctas
- varias ya fueron conectadas
- pero todavia no hay cierre suficientemente duro sobre quien manda, cuando manda y como cambia la conducta despues de aprender

## 4. Que sigue roto o incompleto

### 4.1 No hay soberania cerrada del estado

`state-authority.ts` mejora mucho la situacion, pero clasificar no es lo mismo que unificar.

Seguimos con autoridad repartida entre:

- `self-time-kernel`
- `execution-controller`
- `operational-memory`
- `world-model`
- `omega-wsp`

Eso ya no es caos puro, pero tampoco es un runtime con una sola ley de estado.

### 4.2 El WSP existe, pero no manda siempre

Esto es mejor que antes y mas exigente que antes.

Antes el problema era "WSP no existe".

Ahora el problema real es:

- WSP existe
- entra al `decision-context`
- puede gobernar drives si esta calibrado
- pero sigue pudiendo quedar como `experimental` o `fallback`

Eso es correcto como seguridad.

Pero tambien deja claro que el WSP todavia no gano la soberania que el discurso arquitectonico le atribuye.

### 4.3 El LLM sigue siendo parte del motor, no solo un organo periferico

La convergencia actual no cambia esto.

Todavia no existe una separacion limpia de:

- loop frio sin LLM
- loop caliente con LLM solo por umbral

Mientras eso no exista, OpenSkyNet sigue siendo una arquitectura ejecutiva alrededor de un LM, no una cognicion cerrada que usa el LM de manera periferica.

### 4.4 No hay benchmark decisivo

Hoy podemos afirmar mejor estructura.

Todavia no podemos afirmar mejor conducta de forma cerrada contra baseline en:

- dispatch util
- coherencia de politica
- falsos positivos autonomos
- valor del scoring agregado
- ventaja de drives desde WSP frente a drives derivadas del kernel

## 5. Diagnostico actualizado

La formulacion mas precisa hoy es esta:

OpenSkyNet ya no falla por ausencia de piezas cognitivas.
OpenSkyNet falla por soberania arquitectonica incompleta y por validacion experimental insuficiente.

Eso es un progreso real.

Significa que la critica correcta ya no es "no hay nada".

La critica correcta ahora es:

- hay convergencia util
- hay autoridad parcial
- hay señales comparables
- pero todavia no hay cierre suficiente de gobierno ni benchmark suficiente de verdad

## 6. Siguiente milestone recomendado

No seguiria con mas refactor lateral.
Tampoco abriria otro store canonico.

El siguiente milestone deberia ser:

## Benchmark and Authority Hardening Milestone

Objetivo:

- medir si el scoring agregado mejora decisiones reales
- medir si WSP con autoridad activa supera o no al fallback de kernel
- decidir que engines merecen adapters formales y cuales deben degradarse o salir

Orden:

1. benchmark A/B de dispatch y falsos positivos
2. benchmark WSP drives vs kernel drives
3. adapters formales por engine solo para los motores que sobrevivan a la medicion
4. kill criteria explicitos para señales y motores de bajo valor

No haria antes de eso:

- otra capa de estado
- otra familia de micro-refactors cosméticos
- otra ola de engines experimentales sin comparacion dura

## 7. Validacion local de esta lectura

Corrida local ejecutada sobre las suites de convergencia relevantes:

- `src/agents/openclaw-tools.suites.test.ts`
- `src/agents/openclaw-tools.omega-executive-routing.test.ts`
- `src/agents/openclaw-tools.omega-unification.test.ts`
- `src/agents/openclaw-tools.sessions.test.ts`
- `src/agents/openclaw-tools.omega-work.test.ts`
- `src/agents/openclaw-tools.omega-vs-parent.test.ts`
- `src/omega/engines/registry.test.ts`
- `src/omega/engines/score-engine-signal.test.ts`
- `src/omega/execution-controller.test.ts`
- `src/omega/policy-engine.test.ts`
- `src/omega/state-authority.test.ts`
- `src/omega/heartbeat.test.ts`

Resultado:

- 12 archivos de test pasando
- 82 tests pasando

## 8. Veredicto corto

El repo esta mejor de lo que dice la auditoria critica.
Tambien esta menos cerrado de lo que implicaba el entusiasmo del ultimo post-scriptum.

La lectura correcta hoy es:

- Fase 1: cerrada
- Fase 2: replanteada y parcialmente cerrada por autoridad, no por store unico
- Fase 3: mayormente cerrada
- Fase 4: cerrada en baseline util
- Fase 5/6: pendientes

El siguiente trabajo serio ya no es "mas arquitectura".
Es medicion dura sobre la arquitectura que ya existe.
