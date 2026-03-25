# Analisis Empirico Macro/Micro del Proyecto

Fecha: 2026-03-25
Autor: Codex
Base de evidencia: revision directa de `src/`, pipeline real, conteo de archivos/LOC, build y tests locales.

Este documento esta pensado para revision por pares. No usa la documentacion del repo como fuente primaria, porque gran parte esta obsoleta. La evidencia aqui sale del codigo ejecutable.

## 1. Analisis Propio

### 1.1 Mapa macro real del proyecto

El proyecto no es "Omega con extras". El proyecto real es una plataforma grande con al menos 3 estratos:

1. Sustrato de producto general
   - `src/agents`
   - `src/gateway`
   - `src/infra`
   - `src/auto-reply`
   - `src/config`
   - `src/cli`

2. Capa de entidad/autonomia
   - `src/omega`

3. Capas de integracion y superficie
   - `src/channels`
   - `src/telegram`
   - `src/discord`
   - `src/slack`
   - `src/plugins`
   - `src/memory`

Observaciones medidas en `src/`:

- `src/agents`: 892 archivos TS, 192333 lineas
- `src/gateway`: 365 archivos TS, 87251 lineas
- `src/infra`: 483 archivos TS, 83612 lineas
- `src/auto-reply`: 288 archivos TS, 66753 lineas
- `src/config`: 238 archivos TS, 44485 lineas
- `src/omega`: 145 archivos TS, 27997 lineas

Conclusion macro:

- Omega es importante, pero no domina el proyecto.
- El sistema real es un framework general con una entidad experimental incrustada.
- Si la estrategia futura solo toca `src/omega`, no va a corregir los limites estructurales mas importantes del proyecto.

### 1.2 Pipeline real observado

Flujo principal real, segun el codigo:

1. Entrada de usuario/canal:
   - `src/gateway/server-methods/chat.ts`
   - `src/auto-reply/dispatch.ts`

2. Resolucion de reply y sesion:
   - `src/auto-reply/reply/get-reply.ts`
   - `src/auto-reply/reply/get-reply-run.ts`

3. Registro de tools del agente:
   - `src/agents/pi-tools.ts`
   - `src/agents/openclaw-tools.ts`

4. Enrutamiento Omega para trabajo validado:
   - `src/agents/tools/omega-work-tool.ts`
   - `src/agents/tools/sessions-send-tool.ts`
   - `src/agents/tools/sessions-spawn-tool.ts`

5. Ciclo autonomo/heartbeat:
   - `src/infra/heartbeat-runner.ts`
   - `src/omega/heartbeat.ts`
   - `src/omega/execution-controller.ts`
   - `src/omega/executive-state.ts`

6. Persistencia de estado y memoria Omega:
   - `src/omega/session-context.ts`
   - `src/omega/self-time-kernel.ts`
   - `src/omega/operational-memory.ts`
   - `src/omega/durable-memory.ts`
   - `src/omega/world-model.ts`
   - `src/omega/executive-state.ts`
   - `src/omega/omega-wsp.ts`
   - `src/omega/holographic-memory.ts`

### 1.3 Lo que funciona bien hoy

Hay capacidad real, no solo narrativa:

- El proyecto tiene una infraestructura grande y util para channels, tools, gateway y sesiones.
- El camino `omega_work` ya agrega valor real en validacion, reintentos y prevencion de falsos exitos.
- El heartbeat y la capa ejecutiva ya tienen persistencia y control operativo reales.
- El proyecto puede medir, testear y compilar a gran escala. Eso importa mucho.

Esto significa que la base no debe demolerse. Debe reordenarse sin perder la potencia acumulada.

### 1.4 Lo que esta mal estructurado hoy

#### A. `src/omega` esta demasiado plano

Evidencia:

- `src/omega` tiene 145 archivos TS
- 131 viven en el root de `src/omega`

Eso indica que el modulo ya no tiene fronteras internas solidas. El resultado es acoplamiento semantico y dificultad para saber que es core, que es experimental y que es legado.

#### B. La cognicion experimental se filtra al core general

Evidencia observada:

- `src/auto-reply/reply/get-reply.ts` importaba directamente `HolographicMemoryManager` y `getNeuralLogicEngine`
- Eso hacia que la ruta generica de reply quedara contaminada por mecanismos Omega experimentales
- Este acoplamiento no pasaba por una interfaz explicita

Esto es un problema macro, no solo de estilo:

- impide aislar experimentos
- dificulta medir impacto real
- mezcla framework general con investigacion cognitiva

#### C. El builder de tools mezcla demasiadas responsabilidades

Evidencia:

- `src/agents/openclaw-tools.ts` registra browser, canvas, cron, message, nodes, gateway, omega, sessions, subagents, web fetch/search, image, pdf y plugins en una sola funcion

Eso vuelve difusa la frontera entre:

- tooling general
- tooling de sesiones
- tooling Omega
- tooling de plugins

#### D. Hay demasiadas fuentes de verdad de estado

Fuentes observadas:

- `session-context`
- `self-time-kernel`
- `operational-memory`
- `durable-memory`
- `world-model`
- `executive-state`
- `omega-wsp`
- `holographic-memory`

No todas cumplen el mismo rol. Algunas son utiles. El problema es que hoy no esta explicitado cual es:

- canonico
- derivado
- experimental
- solo para observabilidad

Sin esa jerarquia, la continuidad cognitiva nunca se vuelve fuerte.

#### E. Las decisiones estan distribuidas en demasiados lugares

Decision points observados:

- `get-reply.ts`
- `omega-work-tool.ts`
- `frontal/wake-policy.ts`
- `policy-engine.ts`
- `heartbeat.ts`
- `execution-controller.ts`
- `executive-arbitration.ts`
- `autonomous-executor.ts`

Eso genera una economia cognitiva blanda. El sistema parece profundo, pero a nivel operativo tiene demasiados sitios decidiendo foco, accion y prioridad.

## 2. Problemas Criticos a Resolver

### Criticos actuales

1. Falta una separacion dura entre sustrato de producto y runtime cognitivo experimental.
2. Falta una fuente de verdad canonica para el estado operativo.
3. Falta un loop unico y explicito de `observe -> update -> decide -> act -> learn`.
4. Falta una interfaz estable para integrar motores no-LLM sin contaminar el core.
5. `src/omega` tiene demasiada expansion lateral y poca estructura interna.

### Desafios futuros

1. Crear un transductor real de input a estado interno latente.
2. Sustituir heuristicas bio-narrativas por dinamicas medibles.
3. Integrar motores no-LLM sin volverlos prompt-decoration.
4. Demostrar que nuevas capas mejoran capacidad real y no solo complejidad.
5. Evitar que el proyecto se fracture entre framework general y laboratorio de ideas.
6. Evitar un error conceptual clave: un minimizador de energia cerrado colapsa a reposo; la cognicion util requiere un sistema abierto, impulsado y disipativo.

## 3. Critica Actual del Proyecto

Mi critica actual es esta:

El proyecto es potente, ambicioso y ya hace cosas que muchos sistemas no hacen. Pero hoy esta atrapado en una tension estructural:

- quiere ser plataforma general
- quiere ser entidad autonoma
- quiere ser laboratorio de nueva cognicion

Las tres cosas son validas. El problema es que hoy conviven demasiado mezcladas.

### Critica 1: Hay mucha inteligencia arquitectonica, pero poca ley interna unificada

Hay muchas piezas interesantes:

- validacion
- recovery
- agenda
- memories
- executive state
- world model
- NLE
- JEPA
- HM
- WSP

Pero todavia no existe una ley interna simple y dominante que gobierne el sistema completo.

Mientras eso no exista, cada modulo nuevo tiende a ser:

- una mejora local
- una capacidad lateral
- o una hipotesis semantica mas

Eso no alcanza para el salto que buscas.

### Critica 2: Mucha cognicion sigue siendo semantica, no dinamica

Gran parte de la "vida interna" actual sigue expresandose como:

- prompts
- metadata
- reglas heuristicas
- scoring y thresholds

Eso sirve para control y observabilidad. Pero no constituye todavia una nueva fisica cognitiva del sistema.

### Critica 2.5: La frontera correcta no es "mas adornos biologicos", sino dinamica fuera del equilibrio

La intuicion fuerte detras de `SKYNET_THEORY.md` es valida:

- un sistema puramente simbolico/determinista/monolitico tiene limites serios para continuidad, plasticidad y adaptacion
- un sistema puramente minimizador tambien colapsa si es cerrado

La correccion importante es esta:

- la biologia no gana por "ser biologica"
- gana por ser un sistema abierto, historico, plastico, multi-escala y acoplado causalmente al entorno

Por eso, la tesis util para OpenSkyNet no debe formularse como:

- "AGI necesita biologia literal"

Sino como:

- "AGI practica requiere propiedades de sistemas biofisicos: no equilibrio, plasticidad, memoria multiescala, acoplamiento sensorio-motor, tension-resolucion y aprendizaje local"

Eso deja abierta la implementacion:

- humano + maquina
- sustrato computacional inspirado en fisica
- sistema hibrido con humano en el loop
- hardware no convencional

Lo importante son las propiedades dinamicas, no la palabra "biologia" por si sola.

### Critica 3: El riesgo real no es que falten ideas; es que las ideas se integren mal

El proyecto no necesita mas imaginacion en abstracto. Necesita:

- mejores interfaces experimentales
- mejores kill-switches
- medicion mas dura
- y una migracion arquitectonica que no rompa lo ya ganado

### Critica 4: Si no se separa "core" de "frontera", el proyecto va a seguir creciendo por agregacion

Eso llevara a:

- mayor costo cognitivo para mantenerlo
- menor falsabilidad
- y dificultad creciente para saber que produce capacidad real

## 4. Plan de Mejora Detallado, Paso a Paso

Este plan busca superar los limites actuales sin perder lo que ya funciona.

### Fase 0 - Estabilizacion inicial

Objetivo:
recuperar una base compilable y empezar a crear fronteras reales.

Pasos:

1. Reparar build/test en la ruta Omega.
2. Extraer todo acoplamiento experimental duro de rutas genericas a seams explicitos.
3. Dejar un artefacto formal de analisis y roadmap para revision por pares.

Estado actual de esta fase:

- Hecho: `src/auto-reply/reply/get-reply.ts` ya no importa NLE/HM directamente; ahora usa `src/omega/inbound-cognition.ts`
- Hecho: se reparo la integracion de `competence_drive` en `src/omega/autonomous-executor.ts`
- Verificado: `pnpm build` pasa
- Verificado: tests dirigidos pasan

### Fase 1 - Delimitar el sustrato estable del producto

Objetivo:
separar framework operativo de mecanismos cognitivos.

Pasos:

1. Definir estos grupos como capas oficiales:
   - `product substrate`: `gateway`, `agents`, `infra`, `auto-reply`, `config`
   - `entity runtime`: capa de estado/decision/accion/aprendizaje
   - `experimental engines`: NLE, HM, JEPA, Bifasic, futuros motores

2. Refactorizar `src/agents/openclaw-tools.ts` en suites:
   - core tools
   - session tools
   - omega tools
   - plugin tools

3. Revisar todos los imports cruzados desde `src/omega` hacia `auto-reply`, `agents` e `infra`.
   - Todo cruce debe pasar por una interfaz nombrada
   - Nada experimental debe entrar por import directo al path critico generico

Criterio de salida:

- poder listar claramente que codigo es framework, que codigo es runtime de entidad y que codigo es experimental

### Fase 2 - Crear estado canonico unico

Objetivo:
resolver la fragmentacion de memoria y continuidad.

Pasos:

1. Definir un estado canonico nuevo, por ejemplo:
   - `CognitiveRuntimeState`

2. Ese estado debe contener solo lo minimo necesario para el loop principal:
   - identity
   - goals
   - world observations
   - current tensions
   - budget/resources
   - recent outcomes
   - current focus

3. Clasificar los stores existentes:
   - canonicos
   - derivados
   - experimentales
   - observabilidad

4. Mantener compatibilidad via adapters:
   - `self-time-kernel` -> adapter
   - `operational-memory` -> adapter
   - `durable-memory` -> adapter
   - `world-model` -> adapter
   - `executive-state` -> derived cache
   - `omega-wsp` -> experimental sidecar, no core until integrated

Criterio de salida:

- una unica snapshot canonica capaz de alimentar decision, ejecucion y aprendizaje

### Fase 3 - Unificar el loop ejecutivo

Objetivo:
convertir el sistema en una dinamica clara y medible.

Loop objetivo:

1. Observe
2. Update state
3. Decide
4. Act
5. Evaluate outcome
6. Learn

Pasos:

1. Reducir los puntos de decision duplicados.
2. Dejar un solo arbitro ejecutivo final.
3. Hacer que heartbeat, omega_work y autonomia usen la misma logica de decision, no forks semanticos.

Criterio de salida:

- cada accion importante puede rastrearse a una decision emitida por el mismo runtime ejecutivo

### Fase 4 - Crear interfaz formal para motores cognitivos

Objetivo:
abrir la puerta a nuevas fronteras sin contaminar el proyecto.

Interfaz sugerida:

```ts
type SensorFrame = {
  text?: string;
  interactionMeta: Record<string, unknown>;
  systemMeta: Record<string, unknown>;
};

type EngineSignal = {
  confidence: number;
  proposedFocus?: string;
  urgency?: number;
  latentDelta?: number[];
  notes?: string[];
};

interface CognitiveEngine {
  name: string;
  observe(frame: SensorFrame): Promise<EngineSignal>;
  learn?(outcome: Record<string, unknown>): Promise<void>;
}
```

Motores iniciales:

- LLM executive engine
- NLE engine
- JEPA tension engine
- future physics/biology engine

Regla:

- ningun motor nuevo entra directo al core
- entra solo via esta interfaz o equivalente

### Fase 5 - Ruta seria para IA + biologia/fisica

Objetivo:
hacer investigacion real, no decoracion conceptual.

Pasos:

1. Construir un transductor explicito:
   - mensajes
   - metadatos temporales
   - errores
   - frecuencia de eventos
   - outcomes
   ->
   - estado latente compacto

2. Hacer que el sustrato bio/fisico opere sobre ese estado, no sobre prompts sueltos.

3. Diseñar el sustrato como sistema abierto y disipativo, no como minimizador cerrado.
   - debe recibir drive externa
   - debe tener clamp perceptual
   - debe tener tension interna
   - debe poder sostener metastabilidad en vez de caer a reposo trivial

4. Explorar formalmente la linea `SKYNET_THEORY.md` en version falsable:
   - inferencia por relajacion
   - aprendizaje contrastivo local
   - estado complejo/fasorial o equivalente
   - accion como reduccion de sorpresa o energia libre

5. Medir si produce mejoras reales en:
   - deteccion temprana de fallos
   - asignacion de foco
   - continuidad de investigacion
   - recovery sin supervision

6. Mantener el LLM como un motor mas, no como centro ontologico del sistema.

7. Mantener un modo explicito de simbiosis humano-maquina.
   - Si el humano aporta correccion, intuicion o direccion, eso no es un fallo.
   - Puede ser una forma fuerte de inteligencia hibrida.
   - OpenSkyNet puede evolucionar como "runtime de simbiosis cognitiva" antes de pretender autonomia total.

Hipotesis falsable central:

- Si un motor no-LLM mejora las metricas del loop ejecutivo respecto al baseline LLM-only, se mantiene.
- Si no mejora, se relega a experimental o se elimina.

Hipotesis falsable secundaria:

- Si una dinamica de relajacion fisica solo converge a reposo o ruido y no mejora continuidad/accion util, entonces no sirve como sustrato cognitivo aunque sea matematicamente elegante.

### Fase 6 - Benchmark y disciplina de descarte

Objetivo:
evitar que la complejidad gane por inertia.

Metricas obligatorias:

1. false success prevention
2. recovery after interruption
3. useful autonomous actions per 24h
4. mean dispatch cost
5. state coherence across sessions
6. ratio de acciones utiles / complejidad añadida

Kill criteria:

- si una capa experimental no mejora nada medible tras una ventana definida, sale del core
- si una capa solo agrega narrativa y no cambia decisiones futuras, sale del path critico

## 5. Acciones Concretas Recomendadas a Continuacion

Orden recomendado:

1. Consolidar la Fase 1
   - separar suites de tools
   - separar imports experimentales del sustrato general

2. Ejecutar la Fase 2
   - diseñar y montar el estado canonico
   - adapters desde stores existentes

3. Ejecutar la Fase 3
   - reducir decision points
   - una sola economia cognitiva

4. Solo despues empujar fuerte la Fase 5
   - transductor
   - motores experimentales
   - control de recursos
   - benchmarks

## 6. Lo que ya se hizo en esta intervencion

Cambios implementados:

1. Se creo `src/omega/inbound-cognition.ts`
   - nuevo seam para cognicion experimental inbound
   - evita importar NLE/HM directamente en `get-reply.ts`

2. Se actualizo `src/auto-reply/reply/get-reply.ts`
   - ahora usa el seam anterior
   - reduce acoplamiento directo con Omega experimental

3. Se reparo `src/omega/autonomous-executor.ts`
   - soporte para `competence_drive`
   - build vuelve a pasar

4. Se agrego `src/omega/inbound-cognition.test.ts`
   - pruebas dirigidas del seam nuevo

Verificacion local:

- `pnpm test src/omega/inbound-cognition.test.ts src/omega/inner-life/drives.test.ts` -> OK
- `pnpm build` -> OK

## 7. Veredicto Final

El proyecto no necesita una limpieza esteril que mate la frontera.
Tampoco necesita seguir creciendo por acumulacion de modulos heterogeneos.

Necesita esto:

- preservar el sustrato fuerte que ya existe
- construir una frontera experimental formal
- unificar el estado operativo
- y hacer que la proxima generacion cognitiva entre por interfaces y benchmarks, no por acoples informales

Con la tesis de `SKYNET_THEORY.md`, la formulacion correcta queda asi:

- OpenSkyNet no debe aspirar a ser solo "mas LLM + mas wrappers"
- tampoco debe perseguir "biologia" como estetica
- debe perseguir un runtime cognitivo hibrido, abierto y fuera del equilibrio, capaz de plasticidad, continuidad y acoplamiento causal real

Eso es compatible con este documento. No invalida la critica estructural. La vuelve mas precisa.

Eso permite explorar IA + biologia + fisica sin volver el sistema ilegible ni romper lo que ya funciona.
