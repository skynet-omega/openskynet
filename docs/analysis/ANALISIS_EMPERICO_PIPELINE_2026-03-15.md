# Análisis Empírico del Pipeline OpenSkyNet

**Fecha:** 2026-03-15  
**Auditor:** OpenSkyNet  
**Metodología:** Análisis estático + trazado de flujo, sin modificaciones

---

## 1. Contexto Macro: ¿Qué se está construyendo?

### Trabajo Reciente (2026-03-14/15)

**Scripts de validación empírica:**
- `scripts/live-omega-empirical-probe.ts` - Probe end-to-end comparando parent vs omega
- `scripts/live-omega-frontal-cache-probe.ts` - Validación de caché frontal

**Tests exhaustivos (15+ archivos nuevos):**
- `omega-work.test.ts`, `omega-delegate.test.ts`, `omega-vs-parent.test.ts`
- `omega-empirical-benchmark.test.ts`, `omega-fault-injection.test.ts`
- `sessions-send-validation.test.ts`, `subagents.sessions-spawn-validation.test.ts`

**Integración operativa:**
- `omega-work-tool.ts` (439 líneas) - Tool principal de orquestación
- `omega-delegate-tool.ts` - Wrapper de sessions_send para omega
- `heartbeat-runner.ts` - Integración con heartbeat del gateway

**Conclusión macro:** Se está validando empíricamente que OMEGA supera a OpenClaw base en validación, recovery y continuidad.

---

## 2. Análisis de Inner-Life: ¿Adorno o Utilidad?

### Arquitectura de Activación

```
heartbeat-runner.ts:588
  → buildOmegaHeartbeatPrompt()
    → heartbeat.ts:59
      → decideOmegaWakeAction()
        → Si "heartbeat_ok": evaluateInnerDrives()
          → Si no "idle": buildAutonomousDirectivePrompt()
```

**Flujo real:**
1. Heartbeat ejecuta cada N minutos (configurable)
2. Si hay goals activos/fallidos → wake action tradicional (resume/abort/prune)
3. Si NO hay tensión (`heartbeat_ok`) → evaluar drives internas
4. Si drive activa → generar prompt autónomo

**Inner-life es el "fallback creativo"** cuando no hay trabajo humano pendiente.

### Estado de Drives

| Drive | Estado | Evidencia |
|-------|--------|-----------|
| `homeostasis` | ✅ Funcional | Se activa con `failureStreak > 0` sin goal activo |
| `entropy_alert` | ✅ Funcional | Se activa con silencio > 1 minuto |
| `curiosity` | ⚠️ Limitado | Funciona, pero sin `memoryCandidates` reales |

**Problema confirmado:** En `heartbeat.ts:65`:
```typescript
const driveSignal = evaluateInnerDrives({ kernel, nowMs: Date.now() });
// Falta: memoryCandidates
```

**Impacto:** `curiosity` siempre usa fallback `"memory/omega-episodes"` en lugar de explorar archivos reales.

**Veredicto:** Inner-life es **funcional pero subutilizado**. No es adorno, pero la drive `curiosity` está limitada por falta de integración con el filesystem.

---

## 3. Análisis de frontal/controller.ts: ¿Se usa?

### Trazado de llamadas

```
omega-work-tool.ts:270
  → decideOmegaFrontalAction()
    → controller.ts:149
```

**Contexto de uso:**
- Llamado en `omega-work-tool.ts` para decidir acción frontal
- Implementa:
  1. **Cache de resultados verificados** (`reuse_verified_result`)
  2. **Escalamiento a reparación aislada** (`escalate_isolated_repair`)

**Lógica de cache:**
- Busca en timeline entradas con misma tarea + validación
- Reusa reply si no hay cambios en archivos objetivo
- Evita LLM calls redundantes

**Veredicto:** `controller.ts` es **operativo y útil**. Implementa optimización de cache frontal.

---

## 4. Análisis del Subsistema Python

### Estado de Código

| Archivo | Líneas | Uso Real |
|---------|--------|----------|
| `core.py` | 1,428 | ❌ Nunca llamado desde Node.js |
| `components/jepa_predictor.py` | 189 | ❌ Nunca llamado |
| `components/holo_ode_func.py` | 256 | ❌ Nunca llamado |
| `components/episodic_memory.py` | 256 | ❌ Nunca llamado |
| `smoke.py` | 32 | ✅ Llamado por `runtime.ts` |

**Integración real:**
```typescript
// runtime.ts:26
export function runOmegaSmoke(repoRoot: string): OmegaSmokeResult {
  return spawnSync("python3", ["-m", "omega_py.smoke"], {...});
}
```

**Búsqueda de llamadas:**
- `runOmegaSmoke` se exporta en `index.ts:21`
- **Nunca importado** desde `infra/`, `agents/`, `gateway/`
- Solo usado en `runtime.test.ts`

**Veredicto:** 3,377 líneas de PyTorch/JEPA/ODE son **código muerto**. Solo smoke test funciona.

---

## 5. Deuda Técnica y Redundancias

### Duplicación de Gestión de Estado

**5 archivos tocan "kernel":**
1. `session-context.ts` (1,115 líneas) - Persistencia/loading
2. `self-time-kernel.ts` (544 líneas) - Derivación de estado
3. `task-transaction.ts` (566 líneas) - Ledger transaccional
4. `recovery.ts` (183 líneas) - Lógica de reanudación
5. `frontal/controller.ts` (212 líneas) - Decisiones de cache

**Problema:** Responsabilidades solapadas. El "kernel" se construye en múltiples lugares.

### Redundancia: wake-policy vs controller

| Aspecto | `wake-policy.ts` | `controller.ts` |
|---------|------------------|-----------------|
| Momento | Heartbeat | Ejecución de tool |
| Decisión | ¿Qué hacer con goals? | ¿Caché o ejecutar? |
| Acciones | resume/abort/prune/focus | reuse/escalate/none |

**Veredicto:** No es redundancia real. Son decisiones en momentos diferentes del ciclo de vida.

### Código Potencialmente Muerto

| Archivo | Estado | Razón |
|---------|--------|-------|
| `python/omega_py/core.py` | Muerto | Nunca llamado |
| `python/omega_py/components/*` | Muertos | Nunca llamados |
| `inner-life/drives.ts:curiosity` | Limitado | Sin integración filesystem |

---

## 6. Bugs Confirmados (Sin Modificación)

### Bug 1: Curiosity sin memoryCandidates
**Ubicación:** `heartbeat.ts:65`
**Impacto:** Drive `curiosity` siempre usa fallback hardcodeado
**Severidad:** Media (funciona pero subóptimo)

### Bug 2: Python muerto
**Ubicación:** `python/omega_py/` (3,377 líneas)
**Impacto:** Código que parece funcional pero no se ejecuta
**Severidad:** Alta (confusión, mantenimiento innecesario)

---

## 7. Conclusiones

### Inner-Life: ¿Adorno?
**NO.** Es funcional pero subutilizado:
- `homeostasis` y `entropy_alert` operan correctamente
- `curiosity` está limitada por falta de integración con filesystem
- Se activa realmente en heartbeats cuando no hay tensión

### Módulos Muertos
- **Python:** 3,377 líneas de PyTorch sin uso
- **Curiosity:** Funciona pero sin acceso a memoria real

### Deuda Técnica Real
1. **Dispersión del kernel:** 5 archivos gestionan el mismo concepto
2. **Código Python muerto:** Mantiene dependencias PyTorch innecesarias
3. **Tests vs Producción:** Tests de `curiosity` pasan con datos que producción no provee

### Recomendaciones (Sin Ejecutar)
1. **Decidir:** ¿Integrar Python realmente o eliminar?
2. **Arreglar:** Pasar `memoryCandidates` a `evaluateInnerDrives`
3. **Considerar:** Consolidar gestión de kernel en menos archivos

---

*Análisis generado por OpenSkyNet - Asistente Científico Cognitivo-Operativo*
*Método: Análisis estático + trazado de flujo, sin modificaciones*
