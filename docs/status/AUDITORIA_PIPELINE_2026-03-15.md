# Auditoría Pipeline OpenSkyNet - Hallazgos Críticos

**Fecha:** 2026-03-15  
**Auditor:** OpenSkyNet  
**Scope:** Pipeline completo, archivos modificados 2026-03-14/15

---

## 🔴 HALLAZGO CRÍTICO 1: Subsistema Python = Código Muerto

### Evidencia

**Código Python existente:**
```
python/omega_py/
├── core.py                    # 1,428 líneas - SKYNET_OMEGA (nunca usado)
├── components/
│   ├── jepa_predictor.py      # 189 líneas (nunca usado)
│   ├── holo_ode_func.py       # 256 líneas (nunca usado)
│   ├── episodic_memory.py     # 256 líneas (nunca usado)
│   └── ... (otros 7 módulos)
└── smoke.py                   # 32 líneas - ÚNICO USADO
```

**Integración real desde Node.js:**
```typescript
// src/omega/runtime.ts
export function runOmegaSmoke(repoRoot: string): OmegaSmokeResult {
  // Solo ejecuta smoke.py - no toca core.py ni componentes
  return spawnSync("python3", ["-m", "omega_py.smoke"], {...});
}
```

**Uso en producción:**
- `runOmegaSmoke` se exporta en `src/omega/index.ts:21`
- **NUNCA se llama** desde `src/infra/`, `src/agents/`, ni `src/gateway/`
- Solo existe en tests (`runtime.test.ts`)

**Veredicto:** 3,377 líneas de PyTorch/JEPA/ODE sin uso operativo. Solo smoke test.

---

## 🔴 HALLAZGO CRÍTICO 2: Inner-Life = Semi-Operativo

### Evidencia

**Cadena de llamada:**
```
heartbeat-runner.ts:714
  → applyOmegaHeartbeatExecutiveAction()
    → heartbeat.ts:65
      → evaluateInnerDrives({ kernel, nowMs: Date.now() })
```

**Problema:** `memoryCandidates` nunca se pasa:
```typescript
// src/omega/heartbeat.ts:65
const driveSignal = evaluateInnerDrives({ kernel, nowMs: Date.now() });
// ❌ Falta: memoryCandidates: [...]
```

**Impacto en drives:**
| Drive | Estado | Razón |
|-------|--------|-------|
| `homeostasis` | ✅ Funciona | No requiere memoryCandidates |
| `entropy_alert` | ✅ Funciona | No requiere memoryCandidates |
| `curiosity` | ❌ **ROTO** | Siempre recibe `[]`, nunca encuentra candidatos |

**Código afectado:**
```typescript
// src/omega/inner-life/drives.ts:153
const unexploredMemory = memoryCandidates.find(
  (candidate) => !recentlyTouchedPaths.has(candidate),
);
// Cuando memoryCandidates = [], unexploredMemory = undefined
// Target siempre cae a: lastGoalTask ?? "memory/omega-episodes"
```

**Veredicto:** La drive "curiosity" está rota por diseño. No explora memoria real.

---

## 🟡 HALLAZGO 3: Duplicación de Responsabilidades

### Evidencia

**Gestión de estado kernel:**
- `session-context.ts` (1,115 líneas): Guarda/carga kernel
- `self-time-kernel.ts` (544 líneas): Deriva estado kernel
- `task-transaction.ts` (566 líneas): Ledger transaccional
- `recovery.ts` (183 líneas): Recovery de goals
- `frontal/controller.ts` (212 líneas): Control frontal

**Problema:** 5 archivos tocan el "kernel" con responsabilidades solapadas:
- `session-context` persiste
- `self-time-kernel` deriva
- `task-transaction` trackea
- `recovery` reanuda
- `frontal/controller` decide

**Veredicto:** Arquitectura distribuida sin claridad de ownership. Difícil de razonar.

---

## 🟡 HALLAZGO 4: Tests vs Realidad

### Evidencia

**Tests que pasan:**
```
src/omega/inner-life/drives.test.ts: 12/12 ✅
```

**Pero:** Los tests usan `memoryCandidates` explícito:
```typescript
// drives.test.ts:254
evaluateInnerDrives({
  kernel,
  nowMs: NOW,
  memoryCandidates: ["memory/omega-episodes/agent__main__main.md"], // ✅ Test
});
```

**Producción:** Nunca pasa `memoryCandidates`:
```typescript
// heartbeat.ts:65
evaluateInnerDrives({ kernel, nowMs: Date.now() }); // ❌ Producción
```

**Veredicto:** Tests verifican comportamiento que no ocurre en producción.

---

## 📊 Resumen de Basura Técnica

| Componente | Líneas | Estado | Acción Recomendada |
|------------|--------|--------|-------------------|
| `python/omega_py/core.py` | 1,428 | Muerto | Eliminar o integrar |
| `python/omega_py/components/*` | 1,900+ | Muerto | Eliminar o integrar |
| `inner-life/drives.ts:curiosity` | ~40 | Roto | Arreglar o eliminar |
| `episodic-recall.ts` | 507 | Semi-muerto | Revisar uso real |
| `frontal/controller.ts` | 212 | ? | Verificar uso |

**Total basura estimada:** ~3,500 líneas (30% del código OMEGA)

---

## 🔧 Fixes Requeridos

### Inmediatos (críticos)

1. **Decidir destino de Python:**
   - Opción A: Eliminar `python/omega_py/` (excepto smoke)
   - Opción B: Implementar integración real con `core.py`

2. **Arreglar inner-life:**
   ```typescript
   // heartbeat.ts:65
   const memoryCandidates = await loadMemoryCandidates(workspaceRoot); // Implementar
   const driveSignal = evaluateInnerDrives({ kernel, nowMs: Date.now(), memoryCandidates });
   ```

3. **Auditar `frontal/controller.ts`:**
   - ¿Se usa realmente?
   - ¿Duplica lógica de `wake-policy.ts`?

### Mediano plazo

4. **Consolidar gestión de kernel:**
   - Unificar `session-context`, `self-time-kernel`, `task-transaction`
   - Definir ownership claro

5. **Validar cobertura real:**
   - ¿Cuánto código OMEGA se ejecuta en sesiones reales?
   - Instrumentar métricas de uso

---

## Conclusión

**OpenSkyNet tiene ~30% de código muerto o roto:**
- Subsistema Python: 100% muerto (excepto smoke)
- Drive "curiosity": 100% rota
- Arquitectura kernel: dispersa y duplicada

**Recomendación:** Podar antes de crecer. Eliminar o integrar código muerto antes de agregar más features.

---

*Auditoría generada por OpenSkyNet - Asistente Científico Cognitivo-Operativo*
