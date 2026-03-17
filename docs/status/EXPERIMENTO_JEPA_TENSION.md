# Experimento: Integración JEPA como Señal de Tensión

**Fecha:** 2026-03-15  
**Hipótesis:** La métrica de "frustración" del JEPA predictor puede usarse como señal adicional de tensión en el sistema OMEGA.

---

## Contexto

El subsistema Python (`python/omega_py/`) tiene ~3,377 líneas de código PyTorch con:
- `JEPAPredictor`: Predice próximos estados latentes, calcula "frustración" (error de predicción)
- `HoloODEFuncWithForcing`: NeuralODE con física Koopman
- `SKYNET_OMEGA`: Modelo completo con memoria episódica

Actualmente solo se usa `smoke.py` (32 líneas). El resto es código muerto operativo.

---

## Hipótesis Falsificable

> **H0:** El JEPA predictor no aporta información de tensión útil más allá de las señales existentes (failure_streak, repeatedFailureKinds, etc.)

> **H1:** La frustración JEPA correlaciona con eventos de tensión reales y puede usarse como predictor temprano

---

## Diseño del Experimento

### Fase 1: Pipeline Mínimo (30 min)

Crear un puente Node.js → Python que:
1. Reciba estado actual del kernel (serializado como JSON)
2. Ejecute `jepa_predictor.py` para calcular frustración
3. Retorne métrica de frustración al sistema

### Fase 2: Recolección de Datos (1-2 días)

En sesiones reales de desarrollo:
- Loguear frustración JEPA en cada turno
- Loguear eventos de tensión reales (fallos, correcciones, etc.)
- Calcular correlación

### Fase 3: Análisis (30 min)

- ¿Frustración alta precede a fallos?
- ¿Hay falsos positivos/negativos?
- ¿Aporta información no capturada por `failureStreak`?

---

## Implementación Propuesta

### Paso 1: Wrapper Python mínimo

Crear `python/omega_py/jepa_tension_bridge.py`:

```python
"""
Bridge JEPA → Tensión para OpenSkyNet.
Recibe estado del kernel, retorna métrica de frustración.
"""
import json
import sys
import torch
from .components import JEPAPredictor

def compute_tension_signal(kernel_state: dict) -> dict:
    """
    Calcula señal de tensión basada en frustración JEPA.
    
    Args:
        kernel_state: Estado serializado del kernel OMEGA
        
    Returns:
        {"frustration": float, "confidence": float}
    """
    # Inicializar predictor
    d_state = 256  # dimensión del estado latente
    predictor = JEPAPredictor(d_state=d_state, device="cpu")
    
    # Extraer historial de estados del kernel
    # (simplificado: usar turnCount y últimos outcomes)
    timeline = kernel_state.get("timeline", [])
    
    if len(timeline) < 2:
        return {"frustration": 0.0, "confidence": 0.0}
    
    # Convertir outcomes a embeddings simples
    # (placeholder: en implementación real usar embeddings de tareas)
    states = []
    for entry in timeline[-8:]:  # últimos 8 turnos
        outcome = entry.get("outcome", {})
        status = 1.0 if outcome.get("status") == "ok" else 0.0
        states.append([status, entry.get("turn", 0) / 100.0])
    
    # Pad a d_state
    while len(states) < 2:
        states.append([0.5, 0.0])
    
    # Convertir a tensores
    z_curr = torch.tensor([states[-2]], dtype=torch.float32)
    z_next = torch.tensor([states[-1]], dtype=torch.float32)
    
    # Calcular frustración
    with torch.no_grad():
        z_pred, jepa_loss, frustration = predictor(z_curr, z_next)
    
    return {
        "frustration": float(frustration.mean()),
        "confidence": min(1.0, len(timeline) / 8.0),
    }

if __name__ == "__main__":
    kernel_state = json.load(sys.stdin)
    result = compute_tension_signal(kernel_state)
    print(json.dumps(result))
```

### Paso 2: Integración Node.js

En `src/omega/runtime.ts`, añadir:

```typescript
export function runJepaTensionBridge(
  repoRoot: string,
  kernelState: OmegaSelfTimeKernelState,
): { frustration: number; confidence: number } {
  const result = spawnSync(
    "python3",
    ["-m", "omega_py.jepa_tension_bridge"],
    {
      cwd: repoRoot,
      env: createOmegaPythonEnv(repoRoot),
      encoding: "utf-8",
      input: JSON.stringify(kernelState),
    },
  );
  // ... manejo de errores y parsing
}
```

### Paso 3: Integración con Tension Engine

En `src/omega/frontal/tension-engine.ts`:

```typescript
export type OmegaTensionState = {
  // ... campos existentes
  jepaFrustration?: number;  // NUEVO
  jepaConfidence?: number;   // NUEVO
};

// En deriveOmegaTensionState:
if (params.kernel?.jepaMetrics) {
  tension.jepaFrustration = params.kernel.jepaMetrics.frustration;
  tension.jepaConfidence = params.kernel.jepaMetrics.confidence;
}
```

---

## Criterios de Éxito

| Métrica | Umbral | Significado |
|---------|--------|-------------|
| Correlación frustración → fallos | r > 0.3 | Señal predictiva válida |
| Falsos positivos | < 30% | No genera ruido excesivo |
| Latencia | < 500ms | No impacta UX |

---

## Plan de Rollback

Si el experimento falla:
1. Eliminar `jepa_tension_bridge.py`
2. Revertir cambios en `runtime.ts` y `tension-engine.ts`
3. Documentar hallazgo: "JEPA no aporta valor para señal de tensión"
4. Considerar podar subsistema Python completo

---

## Estado

- [ ] Crear `jepa_tension_bridge.py`
- [ ] Añadir función en `runtime.ts`
- [ ] Integrar con `tension-engine.ts`
- [ ] Recolectar datos 24-48h
- [ ] Analizar correlación
- [ ] Decisión: integrar / podar
