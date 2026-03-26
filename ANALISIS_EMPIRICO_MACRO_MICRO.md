# Analisis Empirico Macro/Micro del Proyecto

Fecha: 2026-03-25
Autor: Codex
Base de evidencia: revision directa de `src/`, pipeline real, conteo de archivos/LOC, build y tests locales, y contraste con experimentos recientes en `/home/daroch/SOLITONES`.

Este documento esta pensado para revision por pares. No usa la documentacion del repo como fuente primaria, porque gran parte esta obsoleta. La evidencia aqui sale del codigo ejecutable.

## 0. Como debe usarse este documento

### 0.1 Tesis operativa en una pagina

Si un agente solo recuerda una cosa, debe recordar esta:

- OpenSkyNet no debe evolucionar por acumulacion de modulos heterogeneos.
- Debe evolucionar hacia un runtime ejecutivo unico, con estado canonico unico, donde los motores experimentales compiten por interfaz y benchmark.
- La frontera experimental mas prometedora hoy no es "fisica pura", sino dinamica continua + memoria multiescala + arbitraje + señales internas medibles.

### 0.2 Orden de lectura obligatorio para cualquier agente

Antes de proponer cambios, leer en este orden:

1. Este documento completo.
2. `src/auto-reply/reply/get-reply.ts`
3. `src/agents/openclaw-tools.ts`
4. `src/infra/heartbeat-runner.ts`
5. `src/omega/heartbeat.ts`
6. `src/omega/execution-controller.ts`
7. `src/omega/executive-state.ts`
8. `src/omega/session-context.ts`
9. `src/omega/self-time-kernel.ts`
10. `src/omega/operational-memory.ts`
11. `src/omega/durable-memory.ts`
12. `src/omega/world-model.ts`
13. `src/omega/inbound-cognition.ts`
14. `src/agents/tools/omega-work-tool.ts`
15. `src/agents/tools/sessions-send-tool.ts`
16. `src/agents/tools/sessions-spawn-tool.ts`

Despues, si va a tocar frontera experimental, revisar como referencia:

1. `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
2. `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X.py`
3. `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V4.py`
4. `/home/daroch/SOLITONES/EX/SKYNET_CORE_V77_5_CHIMERA.py`
5. `/home/daroch/SOLITONES/EX/SKYNET_CORE_V67_OMEGA.py`
6. `/home/daroch/SOLITONES/EX/SKYNET_CORE_V55_HOLODYNAMICS.py`
7. `/home/daroch/SOLITONES/EX/SKYNET_CORE_V27_HOLO_KOOPMAN.py`
8. `/home/daroch/SOLITONES/EX/SKYNET_CORE_V17_GATED.py`
9. `/home/daroch/SOLITONES/EX/SKYNET_CORE_V12_HAMILTON.py`
10. `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V1.py`
11. `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V2.py`
12. `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V3.py`
13. `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V5.py`

### 0.3 Preguntas que cualquier agente debe responder antes de editar

1. Que parte del sistema estoy tocando: `product substrate`, `entity runtime` o `experimental engines`?
2. Que fuente de verdad estoy usando para decidir?
3. El cambio introduce otra ruta de decision o simplifica una existente?
4. El cambio agrega capacidad medible o solo narrativa?
5. El cambio puede aislarse, apagarse y compararse contra baseline?

### 0.4 Cosas que un agente no debe hacer

- No meter motores experimentales directo en rutas genericas de reply.
- No introducir otra fuente de verdad de estado sin clasificarla como canonica, derivada o experimental.
- No copiar monolitos externos como `skynet_omega_core.py` completos al core de OpenSkyNet.
- No vender analogias biologicas o fisicas como si fueran mejoras demostradas.
- No tocar solo `src/omega` si el problema real nace en `agents`, `auto-reply` o `infra`.

### 0.5 Estado real de alineacion con el repo

Este documento no es un collage arbitrario. Pero tampoco debe leerse como si todo estuviera igual de maduro.

Lo que ya esta alineado con el codigo real:

- Los conteos macro y la tesis de que `src/omega` es importante pero no dominante.
- El seam inbound en `src/auto-reply/reply/get-reply.ts` via `src/omega/inbound-cognition.ts`.
- La existencia de una columna ejecutiva real en:
  - `src/omega/executive-arbitration.ts`
  - `src/omega/executive-runtime.ts`
  - `src/omega/executive-state.ts`
  - `src/omega/execution-controller.ts`
- La existencia de telemetria y validacion en:
  - `src/omega/empirical-metrics.ts`
  - `src/omega/empirical-validation.ts`
  - `src/omega/learning-validation.ts`
  - `src/omega/jepa-empirical-logger.ts`
  - `src/omega/study-supervisor.ts`
  - `src/skynet/study-program.ts`

Lo que sigue desalineado o incompleto:

- `src/agents/openclaw-tools.ts` sigue siendo un builder monolitico.
- `src/omega/heartbeat.ts` sigue importando y orquestando demasiados modulos experimentales directo en el path critico.
- El estado sigue repartido entre varios stores sin una clasificacion canonica suficientemente dura.
- La decision ejecutiva ya tiene piezas fuertes, pero sigue distribuida entre `heartbeat`, `policy-engine`, `wake-policy`, `execution-controller`, `omega_work` y `autonomous-executor`.

Regla de lectura:

- cuando este documento proponga "crear" una estructura, primero verificar si ya existe un precursor real en el repo
- si existe, la accion correcta casi siempre es converger o extraer, no duplicar

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
- `src/auto-reply`: 288 archivos TS, 66726 lineas
- `src/config`: 238 archivos TS, 44485 lineas
- `src/omega`: 147 archivos TS, 28153 lineas

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

### 1.3.5 Lo que aportan los experimentos externos recientes

La revision de:

- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V1.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V2.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V3.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V4.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V5.py`
- `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
- y el linaje en `/home/daroch/SOLITONES/EX`

agrega una correccion importante a este documento:

la frontera experimental ya no debe pensarse como "buscar un motor fisico puro", sino como buscar una sintesis funcional entre:

- dinamica continua
- memoria multiescala
- arbitraje ejecutivo
- y señales internas medibles

Hallazgos principales:

1. `SKYNET_CORE_X_V1` (EqProp), `V2` (Neural ODE) y `V3` (Hamiltonian) son ramas utiles como ablacion de paradigma.
   - Sirven para aislar ideas.
   - Pero por si solas quedan demasiado desnudas para una entidad ejecutiva real.
   - Son buenos laboratorios de fisica local, no buenos runtimes cognitivos completos.

2. `SKYNET_CORE_X.py` y `SKYNET_CORE_X_V4.py` son mas relevantes que las ramas "puras".
   - La razon no es estetica; es estructural.
   - Combinan jerarquia temporal, memoria episodica tipo "fosil" y arbitraje de pondering por entropia/valor.
   - Eso sugiere que el salto de capacidad aparece cuando la dinamica se acopla a memoria y decision, no cuando la fisica se refina aislada.

3. `SKYNET_CORE_X_V5.py` confirma una intuicion importante:
   - una Holo-ODE eficiente puede ser un buen sustrato de dinamica
   - pero si se le quitan memoria, arbitraje y economia cognitiva, queda como tejido elegante con poca ley ejecutiva

4. `skynet_omega_core.py` es la sintesis externa mas cercana a una frontera util.
   Integra:
   - ODE con forcing
   - frustracion predictiva tipo JEPA
   - Expected Free Energy
   - memoria fosil
   - memoria dual-timescale y espacial
   - local memory editor
   - neuromodulacion / hyper-modulation
   - razonamiento implicito con NLE
   - metricas internas de viabilidad e integridad de memoria

5. La leccion fuerte de `SKYNET_OMEGA` no es "copiar el monolito".
   La leccion fuerte es otra:
   - las variables mas prometedoras ya no son solo `surprise` o "energia" en abstracto
   - tambien importan `frustration`, `novelty`, `memory_integrity`, `viability`, `interference_pressure` y control de escritura local

6. El folder `EX` sigue siendo util como genealogia.
   - Ahi se ve la transicion desde motores termodinamicos y energeticos mas puros hacia arquitecturas cada vez mas hibridas.
   - No lo tomaria como estado canonico.
   - Si como mapa de convergencia: la experimentacion fue empujando una y otra vez desde fisica sola hacia fisica + memoria + control + seleccion.

Lectura mas fina del linaje `EX`:

- `SKYNET_V1_Kerr_OLD.py` y `SKYNET_V1_Kerr.py`
  - muestran la etapa de base unitaria/complexa mas simple
  - aportan una leccion de estabilidad numerica
  - no resuelven por si mismas memoria de alto nivel ni arbitraje

- `SKYNET_V202_MIRROR.py` y `SKYNET_V203_RESONANCE.py`
  - exploran perspectiva, espejo y cavidad de resonancia
  - aportan intuiciones sobre iteracion interna y modelado del "otro"
  - su aporte es mas mecanico/local que ejecutivo

- `SKYNET_V302_FUSION.py` y `SKYNET_V304_THERMODYNAMIC.py`
  - ya muestran una fusion mas seria entre estabilidad fisica, retina y resonancia
  - sugieren que la salida util aparece cuando la fisica se mezcla con adaptadores sensoriales y saturacion termodinamica mas robusta

- `SKYNET_CORE_V11_FUSION.py`
  - aparece como ancestro importante de la linea hibrida
  - fusiona memoria estable, JEPA y VICReg
  - ademas documenta un hallazgo valioso: no toda homeostasis/ruido "vivo" mejora tareas de precision

- `SKYNET_CORE_V12_HAMILTON.py`
  - conserva geometria y volumen de fase
  - es una ablacion elegante de dinamica Hamiltoniana + observador simplictico
  - pero sigue mas cerca de un nucleo fisico especializado que de un runtime agente completo

- `SKYNET_CORE_V17_GATED.py`
  - mete memoria matricial con gates explicitos
  - es importante porque ataca binding/capacidad de memoria desde mecanismos de control, no desde mas metafora fisica

- `SKYNET_CORE_V27_HOLO_KOOPMAN.py` y `SKYNET_CORE_V55_HOLODYNAMICS.py`
  - consolidan la linea de osciladores complejos, Koopman, diffusion y dreamer predictivo
  - son probablemente la base matematica mas clara de la familia holo/ode posterior

- `SKYNET_CORE_V67_GENESIS.py` y `SKYNET_CORE_V67_OMEGA.py`
  - hacen visible la transicion desde "motor energetico" hacia "motor energetico con semantica, frustracion y seleccion"
  - ahi empieza a aparecer con fuerza la idea de energy manifold + bridge semantico + control por frustracion

- `SKYNET_CORE_V77_5_CHIMERA.py`
  - parece ser el contenedor previo mas cercano a `SKYNET_OMEGA`
  - ya combina retina holografica, JEPA, crystal memory, energy head y acoplamiento de varios consejos/sistemas
  - confirma que la evolucion natural del linaje fue hacia un ensamblaje hibrido, no hacia una fisica unica dominante

- `SKYNET_V7000_HYBRID_BRAIN.py`
  - agrega una leccion distinta y muy importante: costo computacional
  - pone en primer plano que una arquitectura cognitivamente interesante tambien debe ser ejecutable con presupuesto razonable
  - eso conecta directo con OpenSkyNet, donde costo de dispatch y latencia importan tanto como elegancia del motor

### 1.4 Lo que esta mal estructurado hoy

#### A. `src/omega` esta demasiado plano

Evidencia:

- `src/omega` tiene 147 archivos TS
- 133 viven en el root de `src/omega`

Eso indica que el modulo ya no tiene fronteras internas solidas. El resultado es acoplamiento semantico y dificultad para saber que es core, que es experimental y que es legado.

#### B. La cognicion experimental se filtra al core general

Evidencia observada:

- `src/auto-reply/reply/get-reply.ts` importaba directamente `HolographicMemoryManager` y `getNeuralLogicEngine`
- Eso hacia que la ruta generica de reply quedara contaminada por mecanismos Omega experimentales
- Este acoplamiento no pasaba por una interfaz explicita
- `src/omega/heartbeat.ts` hoy sigue importando directamente varias capas experimentales y de investigacion
  - `continuous-thinking-engine`
  - `entropy-minimization-loop`
  - `jepa-drive-enhancement`
  - `science-base-rag`
  - ademas de drives y recovery
  - eso confirma que el problema no era solo `get-reply.ts`; el path autonomo tambien sigue mezclando core y frontera

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

### Critica 2.6: Los ultimos experimentos externos ya reducen el espacio de busqueda

La revision de `SKYNET_X`, `SKYNET_OMEGA` y `SOLITONES/EX` permite decir algo mas preciso que antes:

- las ramas de fisica casi pura tienden a producir sustratos elegantes pero insuficientes para una economia cognitiva completa
- las ramas hibridas empiezan a mostrar una direccion mas prometedora cuando agregan memoria direccionable, arbitraje y senales internas explicitamente computadas
- la unidad experimental correcta no parece ser "otro motor exotico", sino un modulo que pueda competir como engine dentro de un loop ejecutivo comun

En otras palabras:

- V1/V2/V3 muestran que la fisica sola no basta
- CORE_X/V4 muestran que memoria + arbitraje si cambian la calidad del sistema
- SKYNET_OMEGA sugiere que el siguiente nivel no es mas fisica, sino mejor integracion entre dinamica, memoria y decision

Eso refuerza la tesis de este documento: OpenSkyNet no debe importar un monolito externo; debe construir una interfaz formal donde estas hipotesis compitan con metrica dura.

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

### Critica 5: Falta formalismo minimo compartido entre agentes, codigo y experimentos

Hoy hay una intuicion fuerte, pero todavia falta un lenguaje formal minimo y comun que evite que cada agente reinvente la teoria en cada revision.

Ese formalismo minimo deberia ser este:

#### A. Loop ejecutivo discreto

Estado canonico:

```text
S_t = estado canonico en tiempo t
O_t = observaciones en tiempo t
G_t = goals/tensiones activas
A_t = accion emitida
R_t = outcome/evaluacion
```

Ecuacion minima:

```text
S_{t+1} = U(S_t, O_t, G_t, R_t)
A_t     = Pi(S_t)
R_t     = Eval(S_t, A_t, O_{t+1})
```

Interpretacion:

- `U` no debe vivir repartida en ocho lugares distintos.
- `Pi` debe ser una economia de decision unica.
- `Eval` debe alimentar aprendizaje y metricas, no solo logs.

#### B. Dinamica latente abierta

Si se introduce un motor no-LLM, la forma general correcta no es un minimizador cerrado, sino un sistema abierto:

```text
z_{t+1} = f(z_t, u_t, d_t, m_t)
```

Donde:

- `z_t`: estado latente interno
- `u_t`: forcing perceptual / input proyectado
- `d_t`: drives internos o tensiones
- `m_t`: memoria leida o contexto persistente

Version continua:

```text
dz/dt = F(z, u, d, m)
```

Esto es lo que hace mas interesante a:

- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V2.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V5.py`
- `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`

#### C. Expected Free Energy como shaping de decision, no como dogma

Forma minima util:

```text
EFE(a) = base(a) + w_e * epistemic(a) + w_n * ambiguity(a) + w_p * pragmatic_risk(a)
```

Uso correcto:

- como termino de shaping para priorizar acciones
- no como narrativa totalizante que reemplaza benchmarks

Referencia concreta:

- `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py` en `_compute_expected_free_energy`

#### D. Viabilidad como variable compuesta

Forma minima:

```text
viability =
  alpha * predictive_coherence +
  beta  * memory_integrity +
  gamma * homeostatic_stability
```

Esto importa porque por fin convierte "seguir cognitivamente vivo" en algo medible.

Referencia concreta:

- `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py` en `get_viability_components` y `get_viability`

#### E. Integridad de memoria y colision de escritura

La memoria ya no debe verse solo como "hay buffer o no hay buffer".
Debe evaluarse por:

```text
memory_integrity =
  proteccion de slots
  - drift colateral
  - interference pressure
```

Y una escritura local buena debe aproximarse a:

```text
delta_target >> delta_collateral
```

Si una escritura degrada demasiado el resto del banco, no sirve.

Referencia concreta:

- `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py` en `_update_dynamic_memory`

#### F. Regla de oro para agentes

Si una idea no puede expresarse en:

- variable observable
- ecuacion minima
- archivo de implementacion
- benchmark de salida

entonces todavia no esta lista para entrar al path critico.

## 4. Plan de Mejora Detallado, Paso a Paso

Este plan busca superar los limites actuales sin perder lo que ya funciona.

### Fase 0 - Estabilizacion inicial

Objetivo:
recuperar una base compilable y empezar a crear fronteras reales.

Pasos:

1. Reparar build/test en la ruta Omega.
2. Extraer todo acoplamiento experimental duro de rutas genericas a seams explicitos.
3. Dejar un artefacto formal de analisis y roadmap para revision por pares.

Rutas concretas a revisar en esta fase:

- `src/auto-reply/reply/get-reply.ts`
- `src/omega/inbound-cognition.ts`
- `src/omega/autonomous-executor.ts`
- `src/omega/inner-life/drives.ts`
- `src/omega/heartbeat.ts`

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

Rutas concretas donde actuar:

- Leer:
  - `src/agents/openclaw-tools.ts`
  - `src/agents/pi-tools.ts`
  - `src/agents/tools/omega-work-tool.ts`
  - `src/agents/tools/sessions-send-tool.ts`
  - `src/agents/tools/sessions-spawn-tool.ts`
- Si hace falta crear:
  - `src/agents/tool-suites/core-tools.ts`
  - `src/agents/tool-suites/session-tools.ts`
  - `src/agents/tool-suites/omega-tools.ts`
  - `src/agents/tool-suites/plugin-tools.ts`
- Seams de frontera recomendados:
  - `src/omega/inbound-cognition.ts`
  - `src/omega/engine-bridge.ts` o equivalente

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

Rutas concretas sugeridas:

- Crear si no existen:
  - `src/omega/runtime-state/cognitive-runtime-state.ts`
  - `src/omega/runtime-state/load-runtime-state.ts`
  - `src/omega/runtime-state/save-runtime-state.ts`
  - `src/omega/runtime-state/adapters/session-context-adapter.ts`
  - `src/omega/runtime-state/adapters/self-time-kernel-adapter.ts`
  - `src/omega/runtime-state/adapters/operational-memory-adapter.ts`
  - `src/omega/runtime-state/adapters/durable-memory-adapter.ts`
  - `src/omega/runtime-state/adapters/world-model-adapter.ts`

Stores fuente que un agente debe inspeccionar antes de tocar esta fase:

- `src/omega/session-context.ts`
- `src/omega/self-time-kernel.ts`
- `src/omega/operational-memory.ts`
- `src/omega/durable-memory.ts`
- `src/omega/world-model.ts`
- `src/omega/executive-state.ts`
- `src/omega/omega-wsp.ts`
- `src/omega/holographic-memory.ts`

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

Rutas concretas donde hay duplicacion hoy:

- `src/omega/heartbeat.ts`
- `src/omega/execution-controller.ts`
- `src/omega/executive-arbitration.ts`
- `src/omega/policy-engine.ts`
- `src/omega/autonomous-executor.ts`
- `src/omega/frontal/wake-policy.ts`
- `src/agents/tools/omega-work-tool.ts`

Rutas reales sobre las que conviene converger primero:

- `src/omega/executive-arbitration.ts`
- `src/omega/executive-runtime.ts`
- `src/omega/executive-state.ts`
- `src/omega/execution-controller.ts`

Solo despues, si la extraccion ya esta clara, mover hacia una subestructura dedicada como:

- `src/omega/executive/runtime-loop.ts`
- `src/omega/executive/decision-arbiter.ts`
- `src/omega/executive/action-router.ts`
- `src/omega/executive/outcome-evaluator.ts`

Regla importante:

- no crear `src/omega/executive/*` si eso solo duplica lo que ya hacen `executive-runtime.ts` o `execution-controller.ts`
- primero hay que extraer y renombrar con continuidad historica, no abrir una segunda linea arquitectonica

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
  frustration?: number;
  novelty?: number;
  viability?: number;
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

Rutas sugeridas para implementarlo:

- primero envolver los motores ya existentes:
  - `src/omega/neural-logic-engine.ts`
  - `src/omega/jepa-control.ts`
  - `src/omega/bifasic-client.ts`
  - `src/omega/continuous-thinking-engine.ts`
  - `src/omega/entropy-minimization-loop.ts`
  - `src/omega/omega-integrated-reasoning.ts`
- luego, si la interfaz ya quedo estable, consolidar en algo como:
  - `src/omega/engines/types.ts`
  - `src/omega/engines/registry.ts`
  - `src/omega/engines/score-engine-signal.ts`
  - `src/omega/engines/adapters/nle-engine.ts`
  - `src/omega/engines/adapters/jepa-engine.ts`
  - `src/omega/engines/adapters/skynet-omega-bridge.ts`

Regla importante:

- Fase 4 no es una reescritura total de engines
- es una fase de adaptacion y desacople de motores que hoy viven dispersos en root

Rutas externas que justifican esta interfaz:

- `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
- `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V4.py`
- `/home/daroch/SOLITONES/EX/SKYNET_CORE_V77_5_CHIMERA.py`

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

5.5. Incorporar la leccion de `SKYNET_X` y `SKYNET_OMEGA`:

- las dinamicas continuas tipo ODE/Holo-Koopman pueden ser utiles como sustrato
- pero deben entrar junto con memoria direccionable y arbitraje, no aisladas
- las señales internas candidatas mas prometedoras hoy son:
  - frustration predictiva
  - novelty controlada
  - viability
  - memory integrity
  - interference pressure / write locality

    5.6. Extraer patrones, no monolitos.

- No intentar portar `skynet_omega_core.py` entero al core de OpenSkyNet.
- Extraer primero modulos falsables:
  - forcing dinamico sobre estado latente
  - memoria espacial/local con control de colision
  - EFE como shaping de politica
  - telemetria interna de integridad y viabilidad

    5.7. Tratar `SKYNET_X` como suite de ablaciones:

- `V1`: EqProp / relajacion contrastiva
- `V2`: Neural ODE suave
- `V3`: dinamica Hamiltoniana
- `V4`: hibrido ODE + memoria + pondering
- `V5`: Holo-ODE minimal
  El objetivo no es elegir "el mas bonito", sino identificar que propiedad causal aporta mejora real.

Rutas externas exactas a usar como banco de ideas:

- EqProp:
  - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V1.py`
- Neural ODE:
  - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V2.py`
  - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V4.py`
- Hamilton:
  - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V3.py`
  - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V12_HAMILTON.py`
- Holo-Koopman / HoloDynamics:
  - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V5.py`
  - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V27_HOLO_KOOPMAN.py`
  - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V55_HOLODYNAMICS.py`
- Energia / manifold:
  - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V67_GENESIS.py`
  - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V67_OMEGA.py`
- Contenedor hibrido:
  - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V77_5_CHIMERA.py`
  - `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
- Memoria controlada por gates:
  - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V17_GATED.py`
- Lecciones de costo computacional:
  - `/home/daroch/SOLITONES/EX/SKYNET_V7000_HYBRID_BRAIN.py`

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
- Si una memoria experimental no puede escribir localmente sin degradar demasiado el resto del estado, no sirve como continuidad cognitiva fuerte.
- Si un engine necesita crecer como monolito para funcionar, no es una buena frontera para OpenSkyNet aunque sea potente en un sandbox.

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

Rutas sugeridas para instrumentacion y benchmark:

- `src/omega/empirical-metrics.ts`
- `src/omega/empirical-validation.ts`
- `src/omega/learning-validation.ts`
- `src/omega/evals.ts`
- `src/omega/jepa-empirical-logger.ts`
- `src/omega/study-supervisor.ts`
- `src/skynet/study-program.ts`
- `src/omega/scientific-induction.ts`
- `reports/`
- `benchmark_jepa_autonomy_improvement.json`

Si faltan suites comparables, crear:

- seguir primero la convencion actual del repo:
  - `src/omega/omega-runtime-baseline.test.ts`
  - `src/omega/omega-engine-ablation.test.ts`
  - `src/omega/omega-memory-interference.test.ts`
  - `src/omega/omega-viability-metrics.test.ts`
- solo mover a `test/` si aparece una suite transversal que ya no pertenece a un modulo concreto
- `reports/omega-engine-benchmarks/`

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

## 5.5 Protocolo de trabajo para agentes

Si un agente toma este documento como guia, debe seguir este protocolo:

1. Localizar la capa del problema.
   - `product substrate`
   - `entity runtime`
   - `experimental engine`

2. Identificar la ruta exacta en el repo.
   - Nunca trabajar desde nombres abstractos solamente.
   - Siempre anotar archivo/s concretos.

3. Expresar la hipotesis en forma falsable.
   - que variable cambia
   - que decision futura deberia cambiar
   - que benchmark deberia mejorar

4. Implementar el cambio por seam.
   - no por import informal
   - no por copy-paste de monolitos externos

5. Medir.
   - build
   - tests dirigidos
   - benchmark de capacidad
   - costo computacional

6. Clasificar el resultado.
   - `keep`
   - `experimental`
   - `remove`

## 5.6 Mapa corto de donde buscar cada cosa

- Entrada general:
  - `src/gateway/server-methods/chat.ts`
  - `src/auto-reply/dispatch.ts`
- Reply y sesion:
  - `src/auto-reply/reply/get-reply.ts`
  - `src/auto-reply/reply/get-reply-run.ts`
- Tools:
  - `src/agents/openclaw-tools.ts`
  - `src/agents/pi-tools.ts`
- Runtime ejecutivo:
  - `src/omega/heartbeat.ts`
  - `src/omega/execution-controller.ts`
  - `src/omega/executive-state.ts`
  - `src/omega/executive-arbitration.ts`
  - `src/omega/policy-engine.ts`
- Estado y memoria:
  - `src/omega/session-context.ts`
  - `src/omega/self-time-kernel.ts`
  - `src/omega/operational-memory.ts`
  - `src/omega/durable-memory.ts`
  - `src/omega/world-model.ts`
  - `src/omega/omega-wsp.ts`
  - `src/omega/holographic-memory.ts`
- Frontera experimental actual:
  - `src/omega/inbound-cognition.ts`
  - `src/omega/neural-logic-engine.ts`
  - `src/omega/jepa-control.ts`
  - `src/omega/bifasic-client.ts`
- Metricas y validacion:
  - `src/omega/empirical-metrics.ts`
  - `src/omega/empirical-validation.ts`
  - `src/omega/evals.ts`
  - `src/omega/jepa-empirical-logger.ts`

## 5.7 Mapa matematico y fuentes externas

Este bloque existe para evitar dos errores recurrentes:

- hablar de "fisica", "biologia" o "energia" sin variable ni ecuacion minima
- citar familias externas sin dejar claro que propiedad formal aporta cada una

Correspondencia recomendada:

- Relajacion / EqProp / equilibrio perturbado
  - forma minima:
    - `z* = argmin_z E(z, x)`
    - o dinamica de relajacion `dz/dt = -grad_z E(z, x) + clamp(x)`
  - buscar en:
    - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V1.py`
  - utilidad para OpenSkyNet:
    - aprendizaje local y ajuste por diferencia entre fase libre y fase clamp
  - limite:
    - si no hay forcing, memoria y decision, tiende a ser solo un buen laboratorio de dinamica

- Neural ODE / dinamica continua abierta
  - forma minima:
    - `dz/dt = F(z, u, d, m)`
    - discretizada: `z_{t+1} = z_t + dt * F(z_t, u_t, d_t, m_t)`
  - buscar en:
    - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V2.py`
    - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V4.py`
    - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V5.py`
  - utilidad para OpenSkyNet:
    - continuidad temporal, forcing perceptual y estado latente compacto

- Hamiltoniano / conservacion geometrica
  - forma minima:
    - `dq/dt = dH/dp`
    - `dp/dt = -dH/dq`
  - buscar en:
    - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V3.py`
    - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V12_HAMILTON.py`
  - utilidad para OpenSkyNet:
    - estabilidad estructural y geometria de evolucion
  - limite:
    - una dinamica demasiado conservativa no resuelve por si sola plasticidad y escritura de memoria

- Holo-Koopman / operadores complejos / lifting
  - forma minima:
    - `phi(z_{t+1}) ~= K phi(z_t)`
  - buscar en:
    - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V27_HOLO_KOOPMAN.py`
    - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V55_HOLODYNAMICS.py`
    - `/home/daroch/SOLITONES/SKYNET_X/SKYNET_CORE_X_V5.py`
  - utilidad para OpenSkyNet:
    - representar dinamicas no lineales en espacios mas tratables y medir modos de evolucion

- Free Energy / Expected Free Energy
  - forma minima:
    - `EFE(a) = base(a) + w_e * epistemic(a) + w_n * ambiguity(a) + w_p * pragmatic_risk(a)`
  - buscar en:
    - `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
  - utilidad para OpenSkyNet:
    - shaping del arbitraje ejecutivo
  - limite:
    - no debe reemplazar benchmark empirico ni volverse cosmologia textual

- Viabilidad / homeostasis compuesta
  - forma minima:
    - `viability = alpha * predictive_coherence + beta * memory_integrity + gamma * homeostatic_stability`
  - buscar en:
    - `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
  - utilidad para OpenSkyNet:
    - convertir "seguir cognitivamente vivo" en señal observable y comparable

- Integridad de memoria / interferencia local
  - forma minima:
    - `memory_integrity = protected_signal - collateral_drift - interference_pressure`
    - buena escritura local: `delta_target >> delta_collateral`
  - buscar en:
    - `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
    - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V17_GATED.py`
  - utilidad para OpenSkyNet:
    - memoria util sin destruir continuidad global

- Contenedores hibridos
  - forma minima:
    - no una ecuacion unica, sino acoplamiento entre dinamica, memoria, arbitraje y telemetria
  - buscar en:
    - `/home/daroch/SOLITONES/EX/SKYNET_CORE_V77_5_CHIMERA.py`
    - `/home/daroch/SOLITONES/SKYNET_OMEGA/skynet_omega_core.py`
  - utilidad para OpenSkyNet:
    - muestran la forma de ensamblar modulos fuertes sin confundir ensamblaje con canon arquitectonico

Regla practica:

- si una propuesta nueva no puede decir "mi formalismo minimo es este, mis archivos de referencia son estos, mi variable observable es esta", no esta lista para entrar al runtime

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
- y los ultimos experimentos externos refinan aun mas esa tesis: la frontera con mas señal hoy es dinamica continua + memoria multiescala + arbitraje + metricas internas de viabilidad

Eso es compatible con este documento. No invalida la critica estructural. La vuelve mas precisa.

Eso permite explorar IA + biologia + fisica sin volver el sistema ilegible ni romper lo que ya funciona.

NOTA:
Contraste hecho. La conclusión es: el documento no es un collage, pero sí tenía una desalineación importante entre la
dirección estratégica y la topología real del repo. Ya la corregí.

Lo que sí estaba bien alineado con el código:

- la lectura macro del proyecto y los conteos de src/\* ANALISIS_EMPIRICO_MACRO_MICRO.md:106
- el seam inbound en src/auto-reply/reply/get-reply.ts:14 vía src/omega/inbound-cognition.ts:39
- la existencia de una columna ejecutiva real en src/omega/executive-arbitration.ts:1, src/omega/executive-
- src/agents/openclaw-tools.ts:1 sigue siendo monolítico
- el estado sigue fragmentado
- Fase 3/Fase 4 hablaban demasiado como si hubiera que inventar todo desde cero, cuando ya existe una base ejecutiva
  real

Por eso actualicé el análisis con una sección explícita de alineación real ANALISIS_EMPIRICO_MACRO_MICRO.md:72,
reforcé la crítica sobre mezcla experimental en heartbeat ANALISIS_EMPIRICO_MACRO_MICRO.md:311, y reescribí Fase 3/
Fase 4 para que converjan sobre archivos existentes en vez de abrir otra arquitectura paralela
ANALISIS_EMPIRICO_MACRO_MICRO.md:772.

También creé IMPLEMENTATION_PLAN.md:1. Ahí dejé el roadmap operativo por fases, con archivos concretos, criterios de
salida y orden de ejecución realista. La parte más importante es que el plan ahora arranca por:

- refactor de tools y fronteras IMPLEMENTATION_PLAN.md:58
- estado canónico único IMPLEMENTATION_PLAN.md:95
- convergencia del loop ejecutivo sobre el stack ya existente IMPLEMENTATION_PLAN.md:148

No cambié código en esta pasada; solo documentación. No corrí tests porque el trabajo fue documental. Si quieres, el
siguiente paso ya puede ser ejecutar el Entregable A del plan: partir src/agents/openclaw-tools.ts:1 en suites sin
cambiar comportamiento.
