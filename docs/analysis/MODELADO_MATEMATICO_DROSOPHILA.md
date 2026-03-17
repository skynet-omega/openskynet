# Diseño Arquitectónico: De Drosophila a OpenSkyNet
## Nota de diseño empírico, no validación cerrada

**Ubicación:** `~/openskynet/MODELADO_MATEMATICO_DROSOPHILA.md`

**Propósito:** Este documento ya no debe leerse como "ground truth final" ni como manifiesto cerrado. Debe leerse como una **nota de diseño empírico**: resume qué parte de la evidencia biológica y matemática sí es útil para OpenSkyNet, qué parte es extrapolación razonable, y qué parte todavía no está validada ni implementada.

## Veredicto general

La hipótesis central:

`estado causal persistente + topología esparza y dirigida + mantenimiento local`

está **parcialmente respaldada** por la literatura y **sí** es una buena directiva de diseño.

Lo que **no** está respaldado hoy:

- que el artículo de Drosophila valide directamente `Mamba-3`
- que valide `Nested Learning` como solución general de entrenamiento
- que invalide por sí solo a los Transformers
- que autorice hablar de "yo", "voluntad" o "vida" como propiedades ya demostradas

La regla correcta es:

- usar la biología como restricción y fuente de hipótesis
- no usarla como licencia para vender más de lo que la evidencia permite

---

## PARTE I: Qué valida realmente Drosophila

### 1. Topología esparza y dirigida

El conectoma de Drosophila muestra que un sistema cognitivo corporizado real puede operar sobre una red:

- fuertemente esparza
- dirigida
- modular
- causal en el tiempo

La lección útil no es "copiar la mosca", sino esta:

- no toda inteligencia requiere conectividad densa global
- la estructura del grafo importa
- el ruteo causal local puede ser suficiente para tareas sensorimotoras complejas

### 2. Dinámica continua con estado interno

El modelo `Leaky Integrate-and-Fire` usa un estado que evoluciona en el tiempo:

`tau_m dV/dt = -(V - E_L) + R_m I`

Eso sí respalda una idea importante:

- la computación puede vivir en la evolución causal de un estado interno
- no hace falta reconstruir todo el pasado como contexto textual en cada paso

### 3. Suficiencia de un pase causal hacia adelante

El artículo apoya una arquitectura donde la actividad se propaga sobre el grafo desde el pasado hacia el futuro. Eso es relevante para OpenSkyNet porque fortalece esta directiva:

- mover más mantenimiento interno a reglas locales verificables
- depender menos de reconsultar al LLM para cada decisión administrativa

### 4. Qué no valida

El artículo **no** demuestra directamente:

- aprendizaje hebbiano online en ejecución
- `Nested Learning` como algoritmo general listo para producción
- `Mamba-3` como reemplazo de un LLM deliberativo
- una teoría completa del `self`
- una teoría completa de causalidad semántica o social

La traducción correcta es:

- **sí** respalda una familia de diseños
- **no** cierra el problema arquitectónico completo

---

## PARTE II: Qué significa esto para OpenSkyNet

### 1. Qué ya existe en OpenSkyNet

Hoy OpenSkyNet ya tiene piezas compatibles con esa dirección:

- estado persistente de sesión
- kernel causal con goals, outcomes y tensión
- grafo causal mínimo entre goals y archivos
- mantenimiento ejecutivo local sin llamada al LLM en varios casos verificables

Eso significa que OpenSkyNet ya está recorriendo la parte defendible del camino:

- menos recálculo textual
- más continuidad operativa
- más causalidad local
- más mantenimiento determinista

### 2. Qué no existe todavía

OpenSkyNet **todavía no** tiene:

- un motor `LIF` o `SSM` real en la ruta crítica
- aprendizaje local online sobre pesos
- una topología block-sparse de cómputo neuronal viva
- un world model predictivo serio sobre el entorno

Por tanto, no es correcto decir que OpenSkyNet ya implementa un "cerebro reptiliano" o una "vida matemática".

### 3. Arquitectura híbrida correcta

La formulación operativa correcta hoy es esta:

- el LLM sigue siendo el subsistema deliberativo de alto nivel
- el kernel causal de OpenSkyNet actúa como capa ejecutiva persistente
- el objetivo no es matar al LLM de inmediato
- el objetivo es reducir progresivamente su papel en tareas que puedan resolverse con estado local, memoria exacta y reglas verificables

En otras palabras:

`OpenSkyNet no debe saltar directo a un cerebro biológico sintético; debe convertirse primero en un sistema ejecutivo causal más fuerte.`

---

## PARTE III: Extrapolaciones permitidas y extrapolaciones peligrosas

### Extrapolaciones permitidas

Estas sí son razonables como hipótesis de trabajo:

- usar grafos esparzos de dependencias en vez de contexto plano
- mantener estado persistente explícito
- usar actualizaciones locales event-driven
- separar memoria episódica exacta de la inferencia deliberativa
- investigar un pequeño controlador dinámico encima del LLM

### Extrapolaciones peligrosas

Estas deben evitarse por ahora:

- declarar que `x(t)` "es" el yo
- declarar que un umbral de activación equivale a voluntad
- presentar `Mamba/LIF` como validación cerrada por analogía
- exigir una matriz conectómica biológica completa como siguiente paso inmediato
- introducir optimizadores locales o plasticidad online sin una métrica viva y una ruta de rollback clara

---

## PARTE IV: Directiva ingenieril correcta

### 1. Siguiente pieza defendible

La siguiente pieza defendible para OpenSkyNet **no** es una "mosca digital".

La siguiente pieza defendible es:

- un ejecutivo causal más fuerte
- con estado persistente
- con grafo esparzo de dependencias
- con acciones de mantenimiento local verificables
- y con menos llamadas al LLM cuando no hacen falta

### 2. Orden correcto de construcción

#### Etapa A: Consolidar el ejecutivo causal

Prioridad:

- goals persistentes
- tensiones verificadas
- dependencias explícitas
- mantenimiento local determinista

#### Etapa B: Memoria episódica exacta

Prioridad:

- episodios direccionables
- relación entre goal, acción, evidencia y resultado
- recuperación exacta, no solo semántica

#### Etapa C: Controlador dinámico pequeño

Solo después:

- un pequeño modelo de estado sobre eventos
- no sobre texto crudo
- con métricas claras de continuidad, causalidad y ahorro de llamadas

#### Etapa D: Investigación de cómputo esparzo real

Recién ahí tiene sentido explorar:

- block-sparse compute
- SSM/LIF pequeño
- plasticidad local acotada

### 3. Restricción metodológica

Toda pieza nueva debe cumplir esto:

- hipótesis falsable
- métrica antes/después
- rollback simple
- utilidad operativa demostrable

Si no cumple eso, no entra al runtime principal.

---

## PARTE V: Métricas correctas para OpenSkyNet

Las métricas relevantes no son "parece más vivo", sino estas:

- `false_success_rate`
- `goal_recovery_after_restart`
- `causal_consistency_after_failure`
- `mean_llm_calls_per_task`
- `useful_background_actions`
- `spurious_action_rate`

Si una propuesta inspirada en Drosophila no mejora al menos una de estas sin degradar el resto, entonces sigue siendo una analogía elegante, no una mejora real.

---

## PARTE VI: Conclusión práctica

El artículo de Drosophila sí importa. Pero su aporte correcto para OpenSkyNet es este:

- validar la importancia de topologías esparzas y causales
- reforzar la idea de estado persistente
- justificar más mantenimiento local y menos dependencia de contexto textual global

No autoriza todavía:

- declarar que ya entendimos el self
- prometer conciencia digital
- ni saltar directo a una arquitectura conectómica completa

La conclusión operativa correcta es:

`usar Drosophila como ancla para construir un mejor ejecutivo causal, no como excusa para sobrediseñar una mente biológica ficticia dentro del runtime.`
