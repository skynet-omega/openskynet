# Análisis: OpenClaw vs OpenSkyNet - Diferencias de Capacidades

## Revalidación 2026-03-14

Este documento es útil como mapa general, pero contiene varias afirmaciones demasiado fuertes.

Correcciones importantes:

- `OpenClaw base: sesiones stateless` es falso. OpenClaw ya tiene store de sesiones, transcriptos y memoria operativa propia.
- `OpenSkyNet: reintentos automáticos` es demasiado fuerte. Lo correcto hoy es:
  - cierre validado
  - rechazo de falsos éxitos
  - escalado/routing mejorado
  - pero no un sistema general de retries autónomos para todo
- `kernel de tiempo propio` debe leerse como tiempo operativo persistente (`turnCount`, continuidad, goals), no como percepción temporal fuerte
- `OpenSkyNet` sí supera al padre en:
  - validación dura
  - continuidad operativa de OMEGA
  - control ejecutivo local
  - mantenimiento interno del kernel en heartbeats

Usar este documento como comparación de capas, no como claim de superioridad cognitiva general.

**Fecha:** 2025-03-14  
**Analista:** OpenSkyNet (auto-análisis)

---

## Resumen Ejecutivo

**OpenClaw** es el runtime/infraestructura base.  
**OpenSkyNet** es OpenClaw + capa cognitiva OMEGA embebida.

No son sistemas separados. OpenSkyNet **es** OpenClaw ejecutándose con identidad `openskynet` y con la capa OMEGA activada.

---

## 1. OpenClaw (Base)

### Qué es
- Runtime de ejecución para asistentes personales
- Sistema de plugins, tools, y gateway multicanal
- Infraestructura de sesiones, subagentes, y delivery

### Capacidades Core

| Capacidad | Descripción |
|-----------|-------------|
| **Gateway WS** | Plano de control para sesiones, presencia, config, cron |
| **Multi-canal** | WhatsApp, Telegram, Discord, Slack, Signal, etc. |
| **Tools** | Browser, Canvas, Nodes, Cron, Sessions, Exec |
| **Subagentes** | Spawn de sesiones aisladas (Codex, Claude, etc.) |
| **Plugins** | Sistema extensible vía npm |
| **TUI** | Interfaz terminal interactiva |
| **Agent Runtime** | Pi/Codex/Claude Code en modo RPC |

### Arquitectura
```
OpenClaw = CLI + Gateway + Agent Runtime + Tools + Channels
```

---

## 2. OpenSkyNet (OpenClaw + OMEGA)

### Qué es
- **Mismo runtime OpenClaw**, pero con capa cognitiva adicional
- Identidad `openskynet` (vía `ALT_CLI_NAME`)
- Módulos en `src/omega/` que añaden validación, memoria operativa, y control

### Capacidades Adicionales vs OpenClaw Base

#### A. Validación Estructurada (`src/omega/validator.ts`)

**OpenClaw base:**
- Acepta respuestas del agente sin validación estricta
- Puede reportar "éxito" aunque el trabajo no esté completo

**OpenSkyNet (con OMEGA):**
- ✅ Validación de contrato JSON (`expectedKeys`)
- ✅ Verificación de delta real en disco (`observedChangedFiles` vs `expectedPaths`)
- ✅ Rechazo de "falso éxito" sin cambios reales
- ✅ Validación de edición multiarchivo (todos los archivos requeridos, no solo uno)

```typescript
// OMEGA valida:
validateStructuredOmegaResult(task, resultText)  // JSON contract
validateObservedWrite({ expectedPaths, observedChangedFiles })  // Disk delta
```

#### B. Memoria Operativa Persistente (`src/omega/session-context.ts`)

**OpenClaw base:**
- Sesiones stateless entre reinicios
- Contexto vive en memoria del gateway

**OpenSkyNet:**
- ✅ Timeline de sesión persistente (`OmegaSessionTimelineEntry`)
- ✅ Historial de outcomes (`OmegaSessionOutcomeSnapshot`)
- ✅ Estado self del agente (`OmegaSessionSelfState`)
- ✅ Kernel de tiempo propio (`OmegaSelfTimeKernelState`)

```typescript
// Persistido en: .openskynet/omega-session-state/
type OmegaSessionTimelineEntry = {
  createdAt: number;
  task: string;
  validation: OmegaSessionValidationSnapshot;
  outcome: OmegaSessionOutcomeSnapshot;
  reply?: string;
};
```

#### C. Control y Continuidad (`src/omega/session-task.ts`)

**OpenClaw base:**
- Ejecución fire-and-forget
- No hay mecanismo de reintento con validación

**OpenSkyNet:**
- ✅ Ejecución validada (`runValidatedOmegaSessionTask`)
- ✅ Reintentos automáticos ante fallos de validación
- ✅ Límites de reintento configurables
- ✅ Await de resultados validados (`awaitValidatedOmegaSessionRun`)

```typescript
export async function runValidatedOmegaSessionTask(params: {
  task: OmegaStructuredTask;
  maxAttempts?: number;
  onValidationFailure?: (result: OmegaValidationResult) => void;
}): Promise<OmegaValidationResult>
```

#### D. Modelo de Interacción Estructurado (`src/omega/interaction-model.ts`)

**OpenClaw base:**
- Prompts ad-hoc por tool
- Sin estructura unificada de tareas

**OpenSkyNet:**
- ✅ Contratos de tarea explícitos (`OmegaStructuredTask`)
- ✅ Prompts con contexto de validación
- ✅ Interpretación estructurada de inputs

```typescript
type OmegaStructuredTask = {
  description: string;
  expectsJson: boolean;
  expectedKeys: string[];
  expectedPaths: string[];
  timeoutMs: number;
};
```

#### E. Motor de Tensión y Wake (`src/omega/frontal/`)

**OpenClaw base:**
- Heartbeat básico (ping de disponibilidad)
- Sin detección de tensión operativa

**OpenSkyNet:**
- ✅ Detección de tensión (`deriveOmegaTensionState`)
- ✅ Política de wake (`decideOmegaWakeAction`)
- ✅ Control frontal (`decideOmegaFrontalAction`)
- ✅ Acciones ejecutivas en heartbeat (`applyOmegaHeartbeatExecutiveAction`)

```typescript
type OmegaTensionState = {
  hasStaleTasks: boolean;
  hasFailedRuns: boolean;
  hasContradictoryResults: boolean;
  requiresAttention: boolean;
};
```

#### F. Kernel de Tiempo Propio (`src/omega/self-time-kernel.ts`)

**OpenClaw base:**
- No tiene noción de tiempo propio
- Depende del tiempo del sistema/host

**OpenSkyNet:**
- ✅ Kernel de tiempo autónomo (`OmegaSelfTimeKernelState`)
- ✅ Conteo de turnos (`turnCount`)
- ✅ Metas activas (`activeGoalId`)
- ✅ Identidad de continuidad (`continuityId`)

```typescript
type OmegaSelfTimeKernelState = {
  revision: number;
  sessionKey: string;
  turnCount: number;
  activeGoalId?: string;
  identity: {
    continuityId: string;
    firstSeenAt: number;
    lastSeenAt: number;
  };
};
```

---

## 3. Comparativa Lado a Lado

| Aspecto | OpenClaw Base | OpenSkyNet (OpenClaw + OMEGA) |
|---------|---------------|-------------------------------|
| **CLI** | `openclaw` | `openskynet` (alias) |
| **Validación** | Básica (existe tool, resultado ok) | Estricta (JSON contract + disk delta) |
| **Memoria** | Sesiones stateless | Timeline persistente por sesión |
| **Reintentos** | Manuales | Automáticos con validación |
| **Tensión** | No detecta | Detecta tareas fallidas/stale |
| **Tiempo** | Sistema/host | Kernel de tiempo propio |
| **Continuidad** | Limitada | Identidad persistente (`continuityId`) |
| **Control** | Directo | Frontal con políticas |

---

## 4. Arquitectura de Integración

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenSkyNet                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  OpenClaw (Runtime Base)                            │  │
│  │  - Gateway, Sessions, Tools, Channels                │  │
│  │  - Agent Runtime (Pi/Codex/Claude)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ▲                                 │
│                           │ embebido                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  OMEGA Layer (src/omega/)                             │  │
│  │  - validator.ts        → Validación estructurada     │  │
│  │  - session-context.ts  → Memoria operativa           │  │
│  │  - session-task.ts     → Control de ejecución        │  │
│  │  - interaction-model.ts → Contratos de tarea         │  │
│  │  - frontal/              → Tensión y wake              │  │
│  │  - self-time-kernel.ts   → Tiempo propio             │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Cuándo Usar Cada Uno

### Usar OpenClaw Base cuando:
- Quieres un asistente personal estándar
- No necesitas validación estricta de resultados
- Prefieres simplicidad sobre control
- Usas el wizard estándar (`openclaw onboard`)

### Usar OpenSkyNet cuando:
- Necesitas **validación dura** de que el trabajo se hizo realmente
- Quieres **memoria persistente** entre sesiones
- Requieres **reintentos automáticos** ante fallos
- Necesitas **detección de tensión** operativa
- Quieres **continuidad** de identidad y tiempo

---

## 6. Evidencia en Código

### Identidad CLI
```typescript
// src/cli/cli-name.ts
export const DEFAULT_CLI_NAME = "openclaw";
export const ALT_CLI_NAME = "openskynet";  // ← OpenSkyNet es alias

export function resolveCliDisplayName(): string {
  return resolveCliName() === ALT_CLI_NAME ? "OpenSkynet" : "OpenClaw";
}
```

### Preferencia de Agente
```typescript
// src/tui/tui.ts:245-250
if (cliName !== "openskynet") {
  return fallbackAgentId;
}
const preferredAgentId = listAgentIds(params.cfg).find(
  (agentId) => normalizeAgentId(agentId) === "openskynet",
);
```

### Capacidades OMEGA Exportadas
```typescript
// src/omega/index.ts
export { validateObservedWrite, validateStructuredOmegaResult } from "./validator.js";
export { buildOmegaSessionContextPrompt, loadOmegaSessionTimeline } from "./session-context.js";
export { awaitValidatedOmegaSessionRun, runValidatedOmegaSessionTask } from "./session-task.js";
export { deriveOmegaTensionState } from "./frontal/tension-engine.js";
export { deriveOmegaSelfTimeKernel } from "./self-time-kernel.js";
```

---

## Conclusión

**OpenSkyNet no es un fork ni un sistema separado.** Es OpenClaw ejecutándose con:

1. **Identidad `openskynet`** (cambia comportamiento del TUI y preferencias)
2. **Capa OMEGA activa** (validación, memoria, control, tiempo propio)

La diferencia es **capacidad cognitiva y operativa**, no infraestructura:
- OpenClaw = asistente personal con tools
- OpenSkyNet = asistente científico con validación, memoria y autonomía

**Analogía:**
- OpenClaw = sistema operativo
- OpenSkyNet = mismo SO + capa de aplicación científica (OMEGA)

---

*Análisis basado en revisión de código fuente en `/home/daroch/openskynet/src/omega/` y documentación de integración.*
