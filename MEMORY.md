# MEMORY.md - Long-Term Memory (Omega)

## Estado de la Misión (Marzo 2026)

OpenSkyNet está en proceso de transición de un conjunto de módulos heterogéneos a un runtime ejecutivo único con soberanía arquitectónica.

### Hitos Alcanzados

- **Sustrato Estable:** `openclaw-tools.ts` refactorizado en suites funcionales (Core, Session, Omega, Plugin).
- **Gobernanza de Estado:** Implementación de `state-authority.ts` para clasificar stores (Authoritative, Derived, Fallback).
- **Convergencia del Loop:** `heartbeat` y `omega_work` ahora consumen `decision-context.ts`.
- **Registry de Engines:** Existe un baseline en `src/omega/engines/` para unificar señales de NLE, JEPA y otros motores.

### Pendientes Críticos (Next Milestones)

- **Benchmark Hardening:** Validar si el scoring agregado mejora decisiones reales frente al kernel simple.
- **Soberanía del WSP:** Elevar el World State Processor de experimental a autoridad cuando la confianza sea suficiente.
- **Adapters Formales:** Mover motores supervivientes a `src/omega/engines/adapters/`.
- **Loop Frío/Caliente:** Separar ejecución básica de llamadas costosas al LLM.
- **Skynet:** Consolidar el nuevo núcleo experimental como agenda autónoma persistente con estado, programa de estudio y validación empírica propia. Se inició el primer experimento de autonomía endógena (`src/skynet/experiments/autonomy_pulse_01.ts`) para medir señales de entropía y ajustar el foco de estudio. Se agregaron los primeros artefactos de estudio: `decision-bifurcation-probe.ts` y `benchmark-hardening-probe.ts` para medir presión de bifurcación y convergencia de scoring respectivamente.

### Autoridad de Estado de Skynet

- El estado presente de `Skynet` debe describirse desde `.openskynet/living-memory/state/*.json`, `.openskynet/living-memory/history.jsonl` y los stores estructurados de `.openskynet/skynet-*`.
- Los diarios `memory/YYYY-MM-DD.md` conservan snapshots históricos y no deben citarse como estado actual si entran en conflicto con la fuente canónica.

### Decisiones de Diseño

- Se rechazó la creación de un "Single Store" físico masivo; se optó por una matriz de autoridad sobre stores existentes.
- El LLM debe ser un órgano periférico (engine), no el centro ontológico de la decisión.
- `OpenSkyNet` actual pasa a ser plataforma de supervisión e instrumentación; `Skynet` es el nombre oficial del nuevo núcleo experimental.
