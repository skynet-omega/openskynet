# 📍 TRUTH_SOURCE.md — Hierarquía de Verdad

**Propósito:** Si hay conflicto entre fuentes de información, this es el orden de confianza.

---

## 🏆 HIERARQUÍA DE VERDAD (de más a menos confiable)

### 1️⃣ CÓDIGO QUE SE EJECUTA AHORA
**Confianza:** 100%

```typescript
// Si heartbeat.ts hace X, entonces X está PASANDO
// No importa lo que digan los docs
```

**Cómo verificar:**
```bash
$ pnpm test               # Ejecuta código actual
$ git diff HEAD~1         # Ve qué cambió
$ cat src/omega/*.ts      # Lee el código fuente
```

**Ejemplos:**
- "¿Funciona meta-controller?" → Busca en código. No está. No funciona.
- "¿Heartbeat ejecuta cada 1s?" → Lee heartbeat.ts línea X. Sí.
- "¿POC-1 está integrado?" → Busca en ollama-stream.ts. Sí.

---

### 2️⃣ TEST RESULTS (pnpm test)
**Confianza:** 95%

```bash
$ pnpm test
✅ 12/13 tests passing
❌ 1 failing (runtime.test.ts - Python error)
```

**Qué significa:**
- ✅ Test passing = Ese code path funciona
- ❌ Test failing = Ese code path no funciona
- ⏭️ Test skipped = Ignorado (probablemente conocido)

**Cómo confiar:**
- Lee el test: `src/omega/heartbeat.test.ts`
- ¿El test ejecuta el code path? Sí → Confía
- ¿El test es frágil/mock? Verificar, pero probablemente sí funciona

---

### 3️⃣ CURRENT_STATE.md (este repo)
**Confianza:** 90%

Snapshot actual de qué funciona y qué está roto.

**Cuándo leer:**
- Entrar nuevo al proyecto
- Decidir qué hacer a continuación
- Entender estado actual

**Cuándo ignorar:**
- Si dice algo que contradice el código → El código tiene razón
- Si tiene fecha vieja → Puede estar desactualizado

---

### 4️⃣ ARCHITECTURE_DECISIONS.md
**Confianza:** 85%

Explica POR QUÉ se tomaron decisiones (ADR format).

**Cuándo leer:**
- Entender QUÉ pasó (no QUÉ hay ahora)
- Aprendes por qué Tier 1 fue eliminado
- Entiendes trade-offs

**Limitación:**
- Explica el pasado, no el presente
- Si decisión cambió, PDR podría estar desactualizado

---

### 5️⃣ API_REFERENCE.md
**Confianza:** 80%

Lista funciones públicas y cómo usarlas.

**Cuándo leer:**
- Sabes que quieres llamar función X
- Necesitas signature + ejemplo

**Limitación:**
- Puede haber funciones nuevas no documentadas
- Ejemplos podrían ser idealizados

**Verificar:**
```bash
$ grep -n "export function xyz" src/omega/x.ts
# Ve el código real
```

---

### 6️⃣ CODEBASE_MAP.json
**Confianza:** 75%

Mapa de estructura (machine-readable).

**Cuándo leer:**
- Necesitas ubicación de archivo X
- Quieres entender dependencias

**Limitación:**
- Puede estar desactualizado después de refactor
- Verificar con `git ls-files`

---

### 7️⃣ Comentarios en el código
**Confianza:** 70%

```typescript
// Comentarios en el source code
```

**Por qué baja confianza?**
- A veces los comentarios no se actualizan
- Pero son útiles para entender intención

**Usar para:**
- Entender POR QUÉ una línea existe
- Entender trade-offs

---

### 🚫 NUNCA CONFÍES EN (Baja Confianza)

| Fuente | Confianza | Razón |
|--------|-----------|-------|
| Docs viejas | 20% | Rápido desactualizadas |
| README (root) | 40% | Puede referir a OpenClaw, no OpenSkyNet |
| Propuestas/IDEAS | 10% | Planeado pero no implementado |
| Slack/Discord | 5% | Conversación, no histórico |
| Memory files | 60% | Notas de trabajo, pueden ser incompletas |

---

## 🔍 CÓMO RESOLVER CONFLICTOS

### Escenario 1: Docs dice A, Código dice B

```
Docs: "Meta-Controller elige qué motor"
Código: No hay meta-controller.ts

→ CONFIANZA: Código. Es 100% truthy.
→ ACCIÓN: Actualiza docs o ignóralas.
```

### Escenario 2: API_REFERENCE dice signature X, código dice Y

```
API_REFERENCE: async function reason(context, state)
Código: async function reason(context, state, options)

→ CONFIANZA: Código. Tiene el parámetro 'options' extra.
→ ACCIÓN: Usa el código. API_REFERENCE está desactualizado.
```

### Escenario 3: Test failing vs CURRENT_STATE says "passing"

```
Test result: ❌ runtime.test.ts fails
CURRENT_STATE: says "runtime failing (known)"

→ CONFIANZA: Ambas concuerdan. Es conocido.
→ ACCIÓN: No es problema. Ignorar.
```

### Escenario 4: ARCHITECTURE_DECISIONS dice algo eliminado, pero código dice existe

```
ADR-001: "meta-controller.ts fue eliminado"
Código: src/agents/meta-controller.ts existe

→ CONFIANZA: El que sea más reciente. Ver git log.
→ ACCIÓN: Verificar: git log --oneline -- src/agents/meta-controller.ts
```

---

## 🎯 ALGORITMO DE VERIFICACIÓN

Cuando un agente llega y está confundido:

```
1. ¿El código existe? (src/omega/heartbeat.ts)
   → Sí: Confía en el código
   → No: Continúa

2. ¿El test falla? (pnpm test)
   → Sí: El código está roto
   → No: Continúa

3. ¿CURRENT_STATE.md lo menciona?
   → Sí: Cree eso
   → No: Continúa

4. ¿ARCHITECTURE_DECISIONS.md lo explica?
   → Sí: Entiende POR QUÉ
   → No: Continúa

5. ¿API_REFERENCE tiene el signature?
   → Sí: Úsalo
   → No: Lee el código directamente

6. ¿El código tiene comentarios?
   → Sí: Lee comentarios
   → No: Copia/adapta de tests
```

---

## 🔑 REGLAS DE ORO

| Regla | Explicación |
|-------|------------|
| **Código expira, documentación expira más rápido** | Docs son notas. Código es ejecución. |
| **Tests nunca mienten** | Si pasa un test, funciona. Si falla, está roto. |
| **Git history es la verdad final** | ¿Qué pasó? `git log`. ¿Cuándo cambió? `git blame`. |
| **Cuando hay duda, ejecuta** | `pnpm test`, `pnpm build`, `pnpm dev --verbose`. |
| **CURRENT_STATE.md es snapshot, no sistema operativo** | Es una foto del presente. Pero puede estar 1 hora atrás. |

---

## 📋 TEMPLATE: "Mi info conflictúa, ¿qué hago?"

```
Encontré conflicto entre:
- [FUENTE 1]: [Lo que dice]
- [FUENTE 2]: [Lo que dice]

Según TRUTH_SOURCE.md, confío más en [FUENTE 1] porque [JERARQUÍA].

Acción que tomaré: [Creer FUENTE 1, ignorar FUENTE 2]

Si me equivoco, próxima vez verificaré con: [pnpm test / git log / etc]
```

---

## ✨ LA VERDAD MÁS PROFUNDA

```
"El código es el acuerdo final entre el intento y la realidad"
- Alguien sabio
```

Si todo conflictúa, **ejecuta el código**.

```bash
$ pnpm test
```

Ahí está la verdad. Punto final.

---

**RECUERDA:**
- ✅ Confía en el código que se ejecuta
- ✅ Confía en los tests que pasan
- ✅ Cuestiona todo lo demás agradablemente
- ❌ No ignores cuando algo no concuerda
- ❌ No asumas que las docs están actualizadas
