# MEMORY.md - Long-Term Memory (Omega)

## Estado de la Misión (Marzo 2026)

OpenSkyNet está en proceso de transición de un conjunto de módulos heterogéneos a un runtime ejecutivo único con soberanía arquitectónica.

### Hitos Alcanzados

- **Sustrato Estable:** `openclaw-tools.ts` refactorizado en suites funcionales (Core, Session, Omega, Plugin).
- **Gobernanza de Estado:** Implementación de `state-authority.ts` para clasificar stores (Authoritative, Derived, Fallback).
- **Convergencia del Loop:** `heartbeat` y `omega_work` ahora consumen `decision-context.ts`.
- **Registry de Engines:** Existe un baseline en `src/omega/engines/` para unificar señales de NLE, JEPA y otros motores.
- **Runtime Sovereignty (En progreso real):** `heartbeat`, `omega_work` y parte de la autonomía libre ya comparten una autoridad común de runtime en `src/omega/runtime-authority.ts`, reduciendo stitching manual entre `decision-context`, memoria viva y world model.

### Pendientes Críticos (Next Milestones)

- **Benchmark Hardening:** Validar si el scoring agregado mejora decisiones reales frente al kernel simple.
- **Soberanía del WSP:** Elevar el World State Processor de experimental a autoridad cuando la confianza sea suficiente.
- **Adapters Formales:** Mover motores supervivientes a `src/omega/engines/adapters/`.
- **Loop Frío/Caliente:** Separar ejecución básica de llamadas costosas al LLM.
- **Proyecto Interno Autónomo:** `OpenSkyNet` puede trabajar en un proyecto libre configurable vía `INTERNAL_PROJECT.json`. Hoy ese proyecto es `Skynet`, usado tanto como línea de investigación de IA experimental como benchmark interno de autonomía agentica. Sus artefactos actuales viven en `src/skynet/`.

### Autoridad de Estado del Proyecto Interno

- El estado presente del proyecto interno debe describirse desde `.openskynet/living-memory/state/*.json`, `.openskynet/living-memory/history.jsonl`, `INTERNAL_PROJECT.json` y los stores estructurados de `.openskynet/skynet-*`.
- Los diarios `memory/YYYY-MM-DD.md` conservan snapshots históricos y no deben citarse como estado actual si entran en conflicto con la fuente canónica.
- `OpenSkyNet` y el proyecto interno no son lo mismo: mantenimiento del sustrato, gateway o tooling no cuenta por sí solo como avance del proyecto.
- El lenguaje sobre el proyecto interno debe mantenerse empírico: presión, continuidad, compromiso, foco, artefactos y benchmarks; no afirmaciones ontológicas más fuertes sin mecanismo verificable.

### Decisiones de Diseño

- Se rechazó la creación de un "Single Store" físico masivo; se optó por una matriz de autoridad sobre stores existentes.
- El LLM debe ser un órgano periférico (engine), no el centro ontológico de la decisión.
- `OpenSkyNet` es el agente principal; `Omega` sigue siendo su línea experimental interna principal.
- El proyecto definido en `INTERNAL_PROJECT.json` es una carga de trabajo autónoma configurable. Hoy es `Skynet`, pero puede reemplazarse por otro dominio sin reescribir el spine del runtime.
- El siguiente frente serio ya no es más saneamiento lateral, sino cerrar limitaciones críticas: soberanía de decisión, metabolismo cognitivo y ciencia autónoma medible. Ver `docs/architecture/LIMITACIONES_CRITICAS_OPENSKYNET_2026-03-26.md`.
