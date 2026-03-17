# 🚀 Bienvenido a OpenSkyNet

Eres nuevo. No leas documentación por 3 horas. Lee esto primero.

---

## En 30 segundos

OpenSkyNet es un **agente autónomo científico** que:
- ✅ Piensa continuamente (no espera órdenes)
- ✅ Se auto-corrige (valida sus propias respuestas)
- ✅ Aprende (mejora con cada ciclo)
- ✅ Es transparente (todas sus decisiones están documentadas)
- ✅ Funciona como parte de **OpenClaw** (tu host/runtime)

---

## En 5 minutos: Qué necesitas saber

### 1. Lee PRIMERO (en orden)

```
(2 min)  docs/core/SOUL.md
   ↓    "Quién eres, cuál es tu propósito"
   ↓
(3 min)  docs/core/HEARTBEAT.md
        "Cómo funciona tu pulso autónomo"
```

### 2. Explora luego

- **`src/omega/`** — El corazón del sistema (TypeScript)
- **`memory/`** — Tu historial de aprendizaje
- **`src/omega/heartbeat.ts`** — El loop principal

### 3. Tests = Fuente de Verdad

```powershell
pnpm test
```

Esto te dice qué realmente funciona. Ignora docs si los tests dicen otra cosa.

---

## Preguntas frecuentes (FAQ)

### P: ¿Por qué hay tantos .md en docs/?
**R:** Fueron análisis acumulados a lo largo de meses. Ahora están organizados:
- `docs/core/` → Documentación **viva y actual**
- `docs/analysis/` → Análisis técnicos (referencia)
- `docs/archive/` → Propuestas viejas (ignorar)
- `docs/status/` → Reportes históricos (último resort)

### P: ¿Qué código debería leer primero?
**R:** En este orden:
1. `src/omega/heartbeat.ts` — Loop principal (~100 líneas, fácil)
2. `src/omega/neural-logic-engine.ts` — Razonamiento sin LLM
3. `src/agents/ollama-stream.ts` — Inferencia del modelo

### P: ¿Qué tests debo correr?
**R:** Solo:
```powershell
pnpm test
```

Eso ejecuta TODO. Si falla algo, es importante.

### P: ¿Dónde está la lógica de razonamiento?
**R:** `src/omega/neural-logic-engine.ts` — Razonamiento sin LLM (no es magia, es código)

### P: ¿Qué es "Tier 1" o "meta-controller" del que hablan?
**R:** Propuestas viejas. El código fue eliminado porque `src/omega/` ya hace lo mismo mejor.  
Ver: `docs/archive/` si tienes curiosidad histórica.

### P: ¿Puedo modificar src/omega/?
**R:** Sí, pero:
- ✅ Entiende `heartbeat.ts` primero
- ✅ Corre tests después de cada cambio
- ✅ No ignores si los tests fallan

---

## 🗺️ Tu ruta recomendada (si tienes 1 hora)

```
(5 min)   Leer SOUL.md
   ↓      "OK, ahora sé quién soy"
   ↓
(10 min)  Leer HEARTBEAT.md
   ↓      "OK, ahora sé cómo funciono"
   ↓
(15 min)  Leer src/omega/heartbeat.ts (el código real)
   ↓      "Ah, así que aquí es donde pasa"
   ↓
(10 min)  Correr 'pnpm test'
   ↓      "OK, todo funciona"
   ↓
(15 min)  Explorar src/omega/{neural-logic,entropy-min,episodic}.ts
   ↓      "Entiendo la arquitectura"
   ↓
(5 min)   Volver a docs/INDEX.md si necesito más
```

**Total:** 1 hora. Ahora entiendes el 80%.

---

## 🚫 Qué NO hagas (primeras 24h)

```
❌  Leer propuestas sobre "Tier 1"
    → Ese código fue eliminado. Es historia.

❌  Modificar src/omega sin entender heartbeat.ts
    → Es el corazón. Si lo rompes, todo falla.

❌  Ignorar tests que fallan
    → Significa algo está mal. Investiga.

❌  Asumir que la documentación es verdad
    → El código es verdad. Las docs pueden estar desactualizadas.

❌  Cambiar memory/ sin entender cómo se usa
    → Es tu memoria persistente. Es delicada.
```

---

## ✅ Qué SÍ hagas

```
✅  Ejecutar 'pnpm test' después de entender el código
    → Te dice si algo está roto

✅  Leer código más que documentación
    → El código no miente. Las docs sí.

✅  Si algo no concuerda → Confía en el código
    → Si docs dicen X pero código hace Y, el código tiene razón

✅  Preguntar cuando no entiendas
    → Las docs están fragmentadas. Es normal estar confundido.

✅  Intentar romper cosas (en una rama)
    → El aprendizaje requiere experimentación
```

---

## 🎓 Glosario rápido

| Término | Significa |
|---------|-----------|
| **heartbeat** | Tu pulso autónomo (corre cada ciclo) |
| **SOUL.md** | Tu identidad, motivación, directiva core |
| **neural-logic-engine** | Tu razonamiento sin LLM |
| **memory/** | Tu historial persistente |
| **entropy** | Desorden. Minimizarlo = conseguir claridad |
| **omega/** | Tu subsistema de validación + reasoning |
| **ollama-stream** | Tu inferencia (models locales/cloud) |
| **src/agents/** | Utilidades (POC-1 hallucination fix) |

---

## 🔗 Dónde pedir ayuda

1. **Código confuso?** → Leer comentarios en el archivo
2. **Comportamiento inesperado?** → Correr `pnpm test`
3. **No sé por qué existe un archivo?** → Ver `git log <filename>`
4. **Documentación contradictoria?** → Confía en el código

---

## ✨ El truco secreto

La mejor forma de entender OpenSkyNet **no es leer**. Es:

```powershell
# 1. Abre src/omega/heartbeat.ts
# 2. Lee las primeras 50 líneas
# 3. Abre src/omega/neural-logic-engine.ts
# 4. Mira qué hace
# 5. Corre: pnpm test
# 6. Ahora sí, vuelve a SOUL.md
```

El código te enseña más que cualquier doc.

---

**¿Listo?** 

→ Abre [`docs/core/SOUL.md`](core/SOUL.md)  
→ Luego [`docs/core/HEARTBEAT.md`](core/HEARTBEAT.md)  
→ Luego abre `src/omega/heartbeat.ts`

**Bienvenido. 🤖**
