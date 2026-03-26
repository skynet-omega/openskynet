# CRITICA ACTUALIZADA A OPENSKYNET

Fecha de actualizacion: 2026-03-25

Este documento reemplaza la version anterior que mezclaba critica valida con afirmaciones ya obsoletas.

La lectura correcta hoy no es:

- "OpenSkyNet sigue siendo solo un collage sin convergencia"

Tampoco es:

- "OpenSkyNet ya resolvio su arquitectura ejecutiva"

La formulacion precisa es esta:

- OpenSkyNet ya salio de la fase de collage puro
- logro convergencia util en varias piezas ejecutivas importantes
- pero todavia no tiene soberania arquitectonica cerrada
- y todavia no tiene validacion experimental suficiente para declarar cierre

## 1. Que es hoy OpenSkyNet

Hoy OpenSkyNet no es AGI ni esta cerca en el sentido fuerte.

Hoy es:

- un sistema agente instrumental con memoria operativa real
- continuidad parcial entre sesiones
- recovery util
- policy ejecutiva parcialmente convergida
- instrumentation suficiente para medir y corregir

Eso ya no es trivial.
Pero tampoco es una cognicion general cerrada.

## 2. Que partes de la critica vieja quedaron obsoletas

Estas afirmaciones ya no describen bien el repo actual y se eliminan como critica vigente:

- que `heartbeat` y `omega_work` operan como cerebros casi separados
- que no existe continuidad real o que el pensamiento continuo muere siempre al final del ciclo
- que no existe WSP util en el path de decision
- que no existe clasificacion explicita de autoridad de estado
- que no existe interfaz comun de engines o scoring agregado

Hoy si existen:

- `src/omega/decision-context.ts`
- `src/omega/state-authority.ts`
- `src/omega/omega-wsp.ts`
- `src/omega/engines/registry.ts`
- `src/omega/engines/score-engine-signal.ts`
- consumo compartido de `decision-context` desde `heartbeat` y `omega_work`

Por eso la critica ya no puede seguir escrita como si faltaran todas las piezas.

## 3. Que sigue siendo verdadero

### 3.1 El LLM sigue siendo parte del motor efectivo

OMEGA gano estructura, pero OpenSkyNet sigue siendo una arquitectura ejecutiva alrededor de un LM.

Sigue faltando:

- loop frio sin LLM
- loop caliente con LLM solo por umbral
- separacion dura entre control base y expansion semantica costosa

Mientras eso no exista, el sistema sigue dependiendo demasiado del modelo base para cerrar conducta.

### 3.2 No hay soberania cerrada del estado

La clasificacion de autoridad fue una mejora correcta.
Pero clasificar stores no es lo mismo que resolver una sola ley de estado.

La autoridad sigue repartida entre:

- `self-time-kernel`
- `execution-controller`
- `operational-memory`
- `world-model`
- `omega-wsp`

El sistema ya no esta en caos puro.
Pero tampoco en soberania unificada.

### 3.3 La continuidad temporal mejoro, pero sigue siendo fragil

Hoy ya hay:

- sesiones persistidas
- durable memory
- cross-session bridge
- recovery runner
- contexto compartido de decision

Pero todavia no hay identidad cognitiva acumulativa fuerte.

El sistema aun no sostiene bien:

- lineas de investigacion largas sin deriva
- consolidacion mecanistica reusable
- revision retrospectiva fuerte de decisiones viejas
- aprendizaje autonomo estable entre escalas

### 3.4 No existe descubrimiento cientifico autonomo cerrado

OpenSkyNet ya puede:

- detectar tension
- registrar fallos
- inducir hipotesis focalizadas
- correr validaciones y benchmarks

Pero todavia no cierra el ciclo completo de ciencia sin supervison fuerte:

1. formular hipotesis nuevas de valor
2. disenar experimento fuerte
3. ejecutar
4. analizar
5. refinar teoria
6. integrar mecanismo
7. volver a medir con criterio de kill

Sigue siendo un colaborador cientifico creciente, no un cientifico autonomo fuerte.

### 3.5 Falta abstraccion mecanistica transferible

Este sigue siendo uno de los muros principales.

OpenSkyNet puede:

- corregir localmente
- preservar estructura correcta
- retomar objetivos
- enrutar recovery con mas criterio

Pero le sigue costando:

- descubrir mecanismos generales
- comprimir hallazgos en reglas reutilizables
- transferir un aprendizaje entre dominios
- convertir resultados en ley operativa durable

## 4. Que gano realmente el sistema

Esto si cambio y no debe seguir negandose:

- `heartbeat` y `omega_work` ya no operan por caminos totalmente separados
- existe un `decision-context` comun
- existe una matriz de autoridad de estado
- existe baseline funcional de engines comparables
- existe scoring agregado de senales
- existe mejor recovery y continuidad que en la etapa anterior

En otras palabras:

antes el problema era "faltan piezas".

hoy el problema es:

- hay varias piezas correctas
- varias ya convergieron
- pero no hay cierre suficientemente duro sobre quien manda, cuando manda y como cambia la conducta despues de aprender

## 5. Cuellos de botella vigentes

### 5.1 Memoria util vs memoria acumulada

El problema no es guardar mas.
El problema sigue siendo:

- que memoria cambia decisiones futuras de forma fiable

OpenSkyNet mejoro durable memory, retrieval y continuidad.
Pero aun no demuestra que la memoria acumulada produzca aprendizaje mecanistico suficientemente fuerte.

### 5.2 Recovery y edicion selectiva

Esta sigue siendo una de las fronteras mas prometedoras del sistema.

La direccion buena sigue siendo:

- corregir sin destruir
- editar localmente
- preservar subestructura correcta
- evitar replay global innecesario

Esto no es un detalle menor de tooling.
Es una propiedad cognitiva util y una de las pocas lineas con senal empirica real.

### 5.3 Politica de control y economia cognitiva

Sigue faltando una economia cognitiva dura.

Todavia puede:

- pensar demasiado donde no conviene
- despertar sin valor suficiente
- sostener objetivos de bajo retorno
- mezclar observacion, mantenimiento y accion correctiva sin umbral duro

Esto se ve tambien en la operacion autonoma: el sistema puede comportarse razonablemente, pero la politica aun es demasiado blanda para dejarlo actuar sin vigilancia fuerte sobre el workspace.

### 5.4 Construccion y seleccion de hipotesis

La induccion cientifica ya no esta rota como antes.
Pero eso no equivale a autonomia epistemica fuerte.

Sigue faltando:

- mejor priorizacion de hipotesis
- mejor descarte de hipotesis malas
- mejor cierre entre hypothesis, benchmark y kill criteria

### 5.5 Transferencia entre escalas

OpenSkyNet ya opera mejor en la escala:

- archivo
- tarea
- recovery puntual

Pero sigue flojo en la union entre:

- tarea y proyecto
- proyecto y agenda cientifica
- agenda cientifica y arquitectura durable

Ese salto de escala sigue siendo uno de los muros duros.

## 6. Critica operativa nueva: autonomia todavia demasiado abierta

Esta parte no estaba suficientemente clara en la critica vieja y hoy si merece quedar escrita.

El problema ya no es solo arquitectonico.
Tambien es operativo.

En modo heartbeat/cron, OpenSkyNet puede observar, escribir memoria y potencialmente actuar sobre el repo si interpreta que esta "combatiendo entropia".

Eso significa:

- la ultima pasada observada fue razonable y no danina
- pero la politica autonoma todavia no es suficientemente segura para dejarla sin restricciones fuertes sobre `~/openskynet`

La critica correcta hoy incluye esto:

- OpenSkyNet ya tiene mas autonomia instrumental de la que su economia cognitiva puede gobernar con seguridad plena

## 7. Donde estamos hoy

La formulacion mas precisa hoy es esta:

OpenSkyNet ya no falla por ausencia de piezas cognitivas.
OpenSkyNet falla por:

- soberania arquitectonica incompleta
- economia cognitiva insuficiente
- validacion experimental insuficiente
- autonomia operativa todavia demasiado abierta para el riesgo que implica

Eso es progreso real.
La critica correcta ya no es "no hay nada".
La critica correcta ahora es "hay convergencia util, pero no cierre".

## 8. Continuidad correcta

No seguiria con:

- mas refactor lateral
- otra capa de estado canonico
- mas narrativa arquitectonica sin medicion
- mas autonomia abierta sobre el repo sin restricciones

Seguiria con este orden:

1. hardening del modo autonomo
   - heartbeat observacional por defecto
   - sin write/edit/exec libre sobre el workspace
   - ask/on o agente separado para cron

2. benchmark and authority hardening
   - A/B sobre dispatch util
   - falsos positivos autonomos
   - WSP drives vs kernel drives
   - valor real del scoring agregado

3. kill criteria explicitos
   - matar motores que no mejoren conducta
   - matar rutas autonomas de bajo valor

4. recien despues
   - adapters formales para los engines supervivientes
   - separacion fria/caliente real

## 9. Veredicto corto

OpenSkyNet esta mejor de lo que decia la critica mas dura.
Tambien esta menos cerrado de lo que implicaba el entusiasmo arquitectonico.

La conclusion correcta hoy es:

- ya hay convergencia util
- ya hay baseline ejecutivo defendible
- pero todavia no hay soberania cerrada ni evidencia suficiente para cantar victoria

El siguiente trabajo serio no es "mas arquitectura".
Es:

- hardening operativo de la autonomia
- medicion dura de la arquitectura que ya existe
