# FIXES: Corregir los 22 Errores TypeScript

## Prioridad 1: Los 3 Errores Críticos

### ERROR #1: `drives.test.ts(26,7)`

**Archivo:** `src/omega/inner-life/drives.test.ts`  
**Línea:** 26  
**Error:** `Type '"tool_use"' is not assignable to type 'OmegaInteractionKind | undefined'`

**Cambio requerido:**

```typescript
// ANTES:
lastInteractionKind: "tool_use",

// DESPUÉS (elige uno de estos valores válidos):
lastInteractionKind: "direct_instruction",
// O
lastInteractionKind: "corrective_feedback",
// O
lastInteractionKind: "verification_request",
// O
lastInteractionKind: "analysis_request",
// O
lastInteractionKind: "mixed_turn",
```

**Contexto:** Los valores válidos están definidos en `src/omega/interaction-model.ts`:

```typescript
export type OmegaInteractionKind =
  | "direct_instruction"
  | "corrective_feedback"
  | "verification_request"
  | "analysis_request"
  | "mixed_turn";
```

Elige el que mejor represente una herramienta siendo utilizada (probablemente `"direct_instruction"`).

---

### ERROR #2: `stress-memory.test.ts(145,12)`

**Archivo:** `src/omega/stress-memory.test.ts`  
**Línea:** 145  
**Error:** `'prompt' is possibly 'undefined'`

**Cambio requerido:**

```typescript
// ANTES:
expect(prompt).toContain("[OMEGA Similar Episodes]");
expect(prompt).toContain("[OMEGA Semantic Recall]");
expect(prompt).toContain("[OMEGA Outcome Model]");

// Verificamos que el snippet largo esté presente (compactado)
expect(prompt.length).toBeGreaterThan(2000);

// DESPUÉS:
expect(prompt).toContain("[OMEGA Similar Episodes]");
expect(prompt).toContain("[OMEGA Semantic Recall]");
expect(prompt).toContain("[OMEGA Outcome Model]");

// Verificamos que el snippet largo esté presente (compactado)
if (prompt) {
  expect(prompt.length).toBeGreaterThan(2000);
}
// O (más idiomatic):
expect(prompt).toBeDefined();
expect(prompt!.length).toBeGreaterThan(2000);
```

**Contexto:** La variable `prompt` puede no estar definida en alguna rama de código anterior. El fix añade una validación defensiva.

---

### ERROR #3: `task-transaction.ts(327-333)` - Multiple Errors

**Archivo:** `src/omega/task-transaction.ts`  
**Líneas:** 327-333  
**Errores múltiples:**

1. Line 327: `Type 'string' is not assignable to type '"resume" | "none" | "abort" | "reroute"'`
2. Line 330: `A type predicate's type must be assignable to its parameter's type`
3. Line 332: Type mismatch in array assignment
4. Line 333: 'left' and 'right' possibly undefined

**Lectura del contexto necesaria antes de fix.** Este requiere más análisis del código circundante. El problema parece estar en la función `deriveRecoveryStep` alrededor de línea 327.

**Patrón general para este error:**

```typescript
// EL PROBLEMA: Varias líneas asignan tipos incorrectos
const recoveryStep: OmegaTaskTransactionRecoveryStep = {
  kind: params.recovery.kind,  // ❌ kind es string, pero debe ser literal union
  reason: ...,
  route: ...,
  remainingTargets: [...],
  requiredKeys: [...]
};

// LA SOLUCIÓN: Validar tipos exactos
const recoveryStep: OmegaTaskTransactionRecoveryStep = {
  kind: ("resume" | "none" | "abort" | "reroute"),  // ✅ usar literal exacto
  reason: ...,
  ...
};

// PARA LA VALIDACIÓN DE LEFT/RIGHT:
const left = transaction.updatedAt;
const right = other.updatedAt;
if (left !== undefined && right !== undefined) {
  result = left - right;
}
```

**Necesitas leer en contexto CUÁL es el tipo real de `params.recovery.kind` y ajustar en consecuencia.** Probablemente necesita un type guard o validación.

---

## Prioridad 2: Errores Restantes (7 en `deliver.test-helpers.ts`)

Los errores en `deliver.test-helpers.ts` y `deliver.test.ts` reflejan un problema más profundo con mocks de tipos complejos.

**Patrón:**

```
error TS2556: A spread argument must either have a tuple type or be passed to a rest parameter.
```

**Solución general:** Revisar los tipos mock usados y asegurarse de que tengan tipos tuple explícitos.

---

## Prioridad 3: `with-timeout.test.ts`

**Error:** Substitution error al castear `setTimeout`

```typescript
// ANTES:
export const fakeSetTimeout = vi.fn() as typeof setTimeout;

// DESPUÉS (opción 1 - más simple):
export const fakeSetTimeout = vi.fn<typeof setTimeout>();

// O (opción 2 - más flexible):
export const fakeSetTimeout = vi.fn<[callback: Function, ms?: number], NodeJS.Timeout>();
```

---

## Checklist de Fixes

- [ ] Arreglar `drives.test.ts(26)` - Change "tool_use"
- [ ] Arreglar `stress-memory.test.ts(145)` - Add null check
- [ ] Arreglar `task-transaction.ts(327-333)` - Review type predicate & literals
- [ ] Arreglar `deliver.test-helpers.ts` (7 errors) - Tuple type fixes
- [ ] Arreglar `deliver.test.ts` (2 errors) - Mock type compatibility
- [ ] Arreglar `with-timeout.test.ts` (2 errors) - Timeout casting
- [ ] Ejecutar `pnpm build` - Debe completar sin errores
- [ ] Ejecutar `pnpm test` - Debe reportar resultados reales
- [ ] Validar `heartbeat.ts` - Confirma que FASES 1-5 funcionan

---

## Scripts para Validación

### Un solo error:

```bash
cd src/omega
cat inner-life/drives.test.ts | head -30
# Visualizar el contexto del error
```

### Todos los errores:

```bash
pnpm build 2>&1 | tee /tmp/ts-errors.log
# Canalizar todos los errores para análisis
```

### Verificar que fixes funcionan:

```bash
# Après arreglar cada error:
pnpm build --filter omega   # o solo compilar esa parte
```

---

## Notas Importantes

1. **`"tool_use"` nunca fue válido** - Alguien escribió el test con un valor que nunca existió en el enum
2. **`prompt` validation crítica** - Sin ella, el test puede fallar en runtime
3. **`kind` literal union** - El código parece generar strings dinámicos pero asigmarlos a un tipo restringido
4. **Mock types** - Los problemas de spread argument sugieren que algunos mocks no tienen tipos precisos

---

## Pasos Siguientes (Después de estos fixes)

Una vez que `pnpm build` complete SIN errores:

```bash
# 1. Ejecutar los tests de Omega specificamente
pnpm test src/omega/

# 2. Ver si "6/6 tests pass" or "4/6 tests pass"
# 3. Comparar con los reportes de auditoría (AUDIT_VERDICT vs RESUMEN)
# 4. Si hay discrepancias, investigar por qué

# 5. Final check: ¿Sistema realmente vivo?
pnpm test        # Todos los tests
```
