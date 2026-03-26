# Consolidacion Macro Micro - 2026-03-26

Este documento fija una lectura arquitectonica con criterio de consolidacion real:

- no simplificar por estetica
- no podar capacidades utiles
- no multiplicar piezas si una sola bien hecha puede absorber varias
- no llamar "elegancia" a una lobotomia

La analogia correcta no es "menos botones".
Es pasar de un sistema funcional pero heterogeneo a uno mas cohesivo, eficiente, auditable y mantenible.

## Regla de decision

Un cambio de consolidacion solo vale si cumple al menos una de estas condiciones:

1. reduce autoridad borrosa entre dos o mas piezas
2. elimina una duplicacion real de estado, comportamiento o surface area
3. mejora trazabilidad y mantenimiento sin degradar capacidad
4. mejora el path principal del runtime y deja lo experimental mas claramente aislado

Si no cumple eso, es solo limpieza cosmetica.

## 1. Estado general

Hoy el repo sigue teniendo demasiadas superficies para una misma familia de problemas.

La zona mas cargada es:

- `src/omega`
- `src/skynet`
- `ui/src/ui`

Eso no es automaticamente malo.
Lo malo es cuando varias piezas compiten por la misma autoridad o describen el mismo comportamiento con capas distintas.

## 2. Lo que ya conviene considerar consolidado

Estas piezas hoy si parecen parte del path principal y no conviene podarlas:

- `decision-context`
- `state-authority`
- `world-model`
- `omega-wsp`
- `problem-agenda`
- `study-supervisor`
- `skynet/nucleus`
- `skynet/study-program`
- `skynet/continuity-tracker`
- `skynet/experiment-cycle`
- `skynet/commitment-engine`
- `skynet/pulse`
- `living-memory`

Motivo:

- forman una cadena reconocible
- ya tienen persistencia real
- se integran con heartbeat/world-model
- ya producen observabilidad util

## 3. Consolidacion ya hecha en esta pasada

### 3.1 Autoridad de memoria de Skynet

Se elimino una duplicacion real:

- `skynet-runtime` como store separado, luego absorbido por `living-memory`

La autoridad viva ahora esta en:

- `.openskynet/living-memory/state/*.json`
- `.openskynet/living-memory/history.jsonl`

Y los `memory/SKYNET_*.md` quedan como vistas derivadas para humanos.

Esto si mejora el sistema porque:

- reduce writers paralelos
- reduce riesgo de contradiccion entre estado vivo y resumen
- facilita reset y auditoria

### 3.2 Visibilidad por Web UI

La memoria viva ya no queda escondida.
`Overview` y `Debug` pueden leer primero la capa estructurada.

Eso tambien es consolidacion real porque la autoridad operativa y la autoridad visible empiezan a converger.

### 3.3 Homeostasis daemon: correccion funcional

`homeostasis-daemon.ts` estaba leyendo un log local inexistente:

- `.openskynet/gateway.log`

Se corrigio para usar el path canonico de logging resuelto por el sistema.

Esto no es refactor cosmetico.
Era una falla real de observabilidad operativa.

## 4. Zonas que hoy siguen demasiado dispersas

### 4.1 Familia runtime / daemon / autonomous

Las superficies actuales son demasiadas para el mismo dominio:

- `heartbeat.ts`
- `autonomous-executor.ts`
- `run-autonomous.ts`
- `daemon-entry.ts`
- `daemon-cooperative.ts`
- `autonomous-runtime.ts`
- `executive-runtime.ts`
- `experimental-runtime.ts`
- `experimental.ts`
- `homeostasis-daemon.ts`

Diagnostico:

- no todas son duplicadas, pero el mapa mental cuesta demasiado
- hay wrappers, entrypoints, policy, scheduler y experimentos conviviendo sin una jerarquia suficientemente obvia

Revision de referencias reales:

- `heartbeat.ts` si es spine principal
- `autonomous-executor.ts` si esta activo via `heartbeat.ts`
- `daemon-cooperative.ts` si esta activo via `daemon-entry.ts`
- `run-autonomous.ts` hoy es wrapper CLI sobre `heartbeat.ts`
- `homeostasis-daemon.ts` si esta activo via `infra/heartbeat-runner.ts`
- `autonomous-runtime.ts` es configuracion acotada, no spine completo
- `experimental-runtime.ts` hoy es solo gating por env

Conclusion:

- aqui no corresponde amputar
- si corresponde ordenar y documentar jerarquia

### 4.2 Familia experimental heredada

Estas piezas no parecen parte del path principal actual:

- `init-all-jewels.ts`
- `omega-integrated-reasoning.ts`
- parte del barrel `experimental.ts`

Revision de referencias reales:

- `init-all-jewels.ts` hoy solo vive detras de `experimental.ts`
- `omega-integrated-reasoning.ts` sigue vivo por `integrated-brain.ts`
- `integrated-brain.ts` esta exportado pero no aparece en el path principal del runtime actual
- `interactive-prompt.runtime.ts` ya importa `integrated-brain.ts` de forma directa, sin pasar por el barrel principal
- `integrated-brain.ts` fue removido del barrel canonico `omega/index.ts` y queda expuesto solo por `omega/experimental.ts`

Conclusion:

- no hay evidencia suficiente para borrarlas
- si hay evidencia suficiente para tratarlas como superficie experimental no canónica

No necesariamente hay que borrarlas.
Pero si hoy no gobiernan el runtime principal, deben quedar marcadas como:

- experimental legacy
- optional bootstrap
- no authoritative path

### 4.3 UI centralizada en pocos monolitos

Los mas notorios:

- `ui/src/ui/app-render.ts`
- `ui/src/ui/views/cron.ts`
- `ui/src/ui/views/chat.ts`
- `ui/src/ui/views/config.ts`

Esto no significa que haya que fragmentar todo.
Significa que la UI sigue teniendo centros demasiado gordos, con alto costo de cambio.

## 5. Recomendacion de consolidacion, no destructiva

### 5.1 Mantener

Mantener como spine principal:

- `heartbeat`
- `decision-context`
- `world-model`
- `living-memory`
- `study-supervisor`
- pipeline `Skynet`

### 5.2 Congelar y etiquetar

Congelar como experimental/legacy hasta nueva evidencia:

- `init-all-jewels`
- `omega-integrated-reasoning`
- `experimental.ts`
- partes de `homeostasis-daemon` no integradas al path principal

Objetivo:

- que sigan existiendo sin contaminar lectura arquitectonica

### 5.3 Consolidar despues

Los siguientes merges o aclaraciones si tienen buena relacion valor/riesgo:

1. definir una sola jerarquia explicita para:
   - runtime principal
   - loop autonomo
   - daemon cooperativo
   - wrappers CLI

2. mover la familia experimental fuera del spine principal de `omega`
   parte de esto ya se hizo al sacar `integrated-brain` del barrel principal

3. reducir writers humanos siempre activos cuando ya existe store estructurado

4. seguir llevando la Web UI a leer primero estado estructurado

5. unificar la seleccion de memoria candidata alrededor de `living-memory`
   esto ya se corrigio en `heartbeat`, `heartbeat-idle` y `autonomous-executor`

## 6. Hipotesis falsables

Estas son las hipotesis que justifican consolidar mas adelante:

### H1

Si la familia `runtime/autonomous/daemon` se ordena en una jerarquia explicita, entonces:

- bajara el costo de mantenimiento
- bajara el riesgo de entrypoints confusos
- no deberia caer la cobertura funcional

### H2

Si la UI lee primero estado estructurado en lugar de summaries derivados, entonces:

- bajaran contradicciones visibles
- sera mas facil auditar comportamiento real
- el sistema sera mas reseteable

### H3

Si las superficies legacy/experimental quedan etiquetadas y separadas del path principal, entonces:

- la arquitectura sera mas legible
- sera mas facil detectar que piezas realmente gobiernan conducta

## 7. Conclusion

El camino correcto no es "menos archivos".
Es:

- menos centros de autoridad
- menos duplicacion de comportamiento
- menos rutas paralelas para el mismo problema
- mas visibilidad de la verdad operativa
- mejor separacion entre spine principal y experimentacion

Eso se parece mas a una arquitectura tipo "macOS":

- no por minimalismo vacio
- sino por cohesión, eficiencia, mantenimiento y menor tasa de falla.
