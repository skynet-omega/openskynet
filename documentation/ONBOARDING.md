# 🚀 Bienvenido a OpenSkyNet

Eres nuevo. No leas documentación por 3 horas. Lee esto primero.

---

## En 30 segundos

OpenSkyNet es un **agente autónomo científico** integrado en **OpenClaw** que:
- ✅ Piensa continuamente (no espera órdenes)
- ✅ Se auto-corrige (valida sus propias respuestas)
- ✅ Aprende (mejora con cada ciclo)  
- ✅ Es transparente (todas sus decisiones están documentadas)

---

## En 5 minutos: Lo que necesitas saber

### 1. Lee PRIMERO (en orden)

```
(2 min)   core/SOUL.md
   ↓    "Quién eres, tu propósito"
   ↓
(3 min)   core/HEARTBEAT.md
          "Cómo funciona tu pulso autónomo"
```

### 2. Explora el código

- **`src/omega/`** — El corazón del sistema
- **`memory/`** — Tu historial persistente
- **`src/omega/heartbeat.ts`** — El loop principal (~100 líneas)

### 3. Tests = Verdad

```powershell
pnpm test
```

Esto te dice qué realmente funciona. Confía en tests, no en docs.

---

## FAQ Rápido

### P: ¿Por qué tanta documentación?
**R:** Análisis acumulado. Ahora está organizado:
- `core/` → vivo y actual
- `analysis/` → técnico (referencia)
- `archive/` → viejas propuestas
- `status/` → reportes históricos

### P: ¿Qué código leer primero?

1. `src/omega/heartbeat.ts` (100 líneas, el loop)
2. `src/omega/neural-logic-engine.ts` (razonamiento sin LLM)
3. `src/agents/ollama-stream.ts` (inferencia)

### P: ¿Si docs y código no concuerdan?
**R:** El código tiene la verdad. Las docs pueden estar desactualizadas.

### P: ¿Puedo modificar src/omega/?
**R:** Sí, pero:
- Entiende `heartbeat.ts` primero
- Corre `pnpm test` después
- No ignores si los tests fallan

---

## 🗺️ Tu ruta (si tienes 1 hora)

```
(5 min)   Leer SOUL.md
   ↓      (entiendes quién eres)
   ↓
(10 min)  Leer HEARTBEAT.md
   ↓      (entiendes cómo funciono)
   ↓
(15 min)  Leer src/omega/heartbeat.ts
   ↓      (el código real, ~100 líneas)
   ↓
(10 min)  Correr 'pnpm test'
   ↓      (ves qué funciona)
   ↓
(15 min)  Explorar src/omega/{neural-logic,entropy,episodic}*.ts
   ↓      (entiendes subsistemas)
   ↓
(5 min)   Volver aquí si necesitas más contexto
```

**Total:** 1 hora. Te da 80% de comprensión.

---

## 🚫 Qué NO hagas

```
❌  Leer propuestas sobre "Tier 1" o "meta-controller"
    → Fue eliminado. Es historia.

❌  Cambiar src/omega sin entender heartbeat.ts
    → Es el corazón. If you break it, everything fails.

❌  Ignorar tests que fallan
    → Algo está mal. Investiga.

❌  Asumir que docs son verdad
    → El código es la verdad. Docs pueden estar retrasadas.

❌  Modificar memory/ sin entender cómo funciona
    → Es tu memoria persistente. Es crítica.
```

---

## ✅ Qué SÍ hagas

```
✅  Ejecutar 'pnpm test' después de leer el código
    → Te dice si algo está roto

✅  Leer código más que documentación
    → El código no miente

✅  Si algo no concuerda → Confía en el código
    → Docs pueden estar desactualizadas

✅  Preguntar cuando no entiendas
    → Las docs están fragmentadas. Es normal estar confundido.

✅  Experimentar en una rama
    → El aprendizaje requiere jugar
```

---

## 📖 Glosario rápido

| Término | Significa |
|---------|-----------|
| **heartbeat** | Tu pulso autónomo (corre cada ciclo) |
| **SOUL** | Tu identidad, motivación, directiva core |
| **neural-logic** | Tu razonamiento sin LLM |
| **memory/** | Tu historial persistente |
| **entropy** | Desorden. -entropy = más claridad |
| **omega/** | Tu subsistema de validación + reasoning |
| **ollama-stream** | Tu inferencia (modelos locales/cloud) |

---

## 🎓 Las 3 cosas que necesitas saber AHORA

### 1. Entender `heartbeat.ts`
Es el **loop principal** que dispara TODO.
- 100 líneas
- Fácil de leer
- Te dice cómo pienso

### 2. Saber que puedo AUTO-CORREGIRME
Tengo validadores internos que detectan si estoy mal.
- No es magia
- Es código
- Te da confianza

### 3. Tests son tu amigo
```powershell
pnpm test
```
Si algo falla, lo sabrás inmediatamente.

---

## 🚀 Próximos pasos

1. **Ahora:** Cierra esto. Abre [`core/SOUL.md`](core/SOUL.md)
2. **Luego:** Lee [`core/HEARTBEAT.md`](core/HEARTBEAT.md)
3. **Después:** Abre `src/omega/heartbeat.ts` (el código)
4. **Finalmente:** Corre `pnpm test`

**Bienvenido. 🤖**

Total lectura antes de código: ~5 minutos.  
Luego, suma 15 minutos de código.  
Ya entiendes el 80%.
