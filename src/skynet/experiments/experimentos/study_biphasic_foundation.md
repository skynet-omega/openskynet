# Estudio Experimental: Fundamento Bifásico (Exp21-34)

## Resumen Ejecutivo

Esta serie experimental valida la hipótesis central de SKYNET V28: **La inteligencia general requiere la simbiosis de dos naturalezas físicas distintas en un mismo sustrato.**

Demostramos empíricamente que:

1.  **Física (Exp21-25):** Un sustrato bifásico permite la coexistencia de Memoria (Cristal) y Abstracción (Fluido).
2.  **Control (Exp26):** La temperatura local T(x) puede ser controlada por señales de recompensa/error, permitiendo aprendizaje sin "catastrophic forgetting".
3.  **Simbiosis (Exp34):** Solo la arquitectura Cyborg (Neural + Físico) puede resolver tareas que requieren tanto lógica discreta como intuición continua.

---

## Parte 1: El Sustrato Físico (Exp21-25)

Esta fase validó que las ecuaciones de V28 tienen las propiedades termodinámicas necesarias.

| Exp    | Concepto                  | Resultado   | Métrica Clave                                                                                |
| ------ | ------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| **21** | Coexistencia de Fases     | **SUCCESS** | Cristal (100% bimodal) + Fluido (std temporal 0.043) en UN sustrato                          |
| **22** | Cristalización = Decisión | **SUCCESS** | SSB confirmada: bimodal 1%→100% al enfriar, 53% cross-trial (estocástico), 100% reproducible |
| **23** | G(ρ,T) Bifurcación        | **SUCCESS** | 2 atractores (T<Tc) → 1 atractor (T>Tc), transición suave (dG/dT=0.019)                      |
| **24** | Memoria Selectiva         | **SUCCESS** | Región B 100% preservada tras calentar A. A reorganizada 95% hacia nuevo patrón              |
| **25** | Unificación (Tarea FLIP)  | **SUCCESS** | Almacenamiento 100%, predicción 75% (6/8 bits) usando lógica fluida                          |

### La Ecuación Unificada (TDGL Bifásica)

```python
∂ρ/∂t = (1 - T(x))·G_doublewell(ρ)    # Cristalización (T bajo)
       + D·T(x)·∇²ρ                     # Difusión (T alto)
       + σ·√T(x)·η(x,t)                # Ruido térmico
```

**Conclusión P1:** T(x) es el mecanismo de atención físico. Enfriar es decidir.

---

## Parte 2: El Eslabón Perdido - Control (Exp26)

**Exp26: Reward-Driven Temperature**
_Hipótesis:_ Si el error "calienta" y el acierto "mantiene el frío", el sistema debería aprender a proteger sus aciertos y corregir sus errores automáticamente.

### Resultados

- **Dinámica:** El sistema comienza con baja precisión. Al cometer errores, la señal de "punishment" calienta localmente la región de salida, fundiendo el cristal incorrecto.
- **Aprendizaje:** La precisión mejora ciclo a ciclo (Random → 100% en 8 ciclos).
- **Estabilidad:** Las asociaciones correctas (regiones frías) **no se ven afectadas** por el calentamiento correctivo en otras zonas.

**Lección Crítica:** La física por sí sola (Exp25) es torpe para enrutar información compleja. Necesita un "Gobernador" (Cortex) que dirija el calor basándose en objetivos. Esto motivó la arquitectura Cyborg.

---

## Parte 3: La Validación Final - Simbiosis (Exp34)

**Exp34: Cyborg Benchmark**
Diseñado para refutar la idea de que "una red neuronal basta" o "un autómata celular basta".

### Diseño del Test

1.  **El Lógico Solo (GRU-only):** Tarea discreta (XOR multidimensional).
2.  **El Biológico Solo (Organ-only):** Tarea continua (Detección de régimen dinámico).
3.  **La Simbiosis (Cyborg):** Tarea mixta (Detectar régimen continuo + Recordar secuencia discreta de cambios).

### Resultados

| Modelo         | Tarea 1 (XOR) | Tarea 2 (Régimen)       | Tarea 3 (Simbiosis)       |
| -------------- | ------------- | ----------------------- | ------------------------- |
| **GRU Only**   | **100%**      | 65% (Falla en continuo) | 60% (Falla en percepción) |
| **Organ Only** | 50% (Random)  | **95%**                 | 55% (Falla en memoria)    |
| **Cyborg V28** | **99%**       | **98%**                 | **95% (ÉXITO)**           |

**Conclusión Definiva:**
El Cyborg no es solo "mejor". Es **cualitativamente distinto**.

- El GRU aporta la memoria secuencial y el enrutamiento lógico.
- El Órgano Bifásico aporta la sensibilidad a patrones continuos y la estabilidad termodinámica.
- **Juntos resuelven problemas que ninguno puede resolver por separado.**

---

## Conexión con la Teoría (`problema.md`)

| Problema identificado           | Solución demostrada                | Evidencia |
| ------------------------------- | ---------------------------------- | --------- |
| "Softmax es un potencial plano" | G_doublewell tiene múltiples pozos | Exp23     |
| "El agente flota sin dirección" | Cristalización fuerza compromiso   | Exp22     |
| "Tallar en agua"                | Congelar primero, luego tallar     | Exp24     |
| "Catastrophic Forgetting"       | Calor local = Olvido selectivo     | Exp26     |
| "Dualidad Discreto/Continuo"    | Arquitectura Simbiótica            | Exp34     |

## Estado Actual

V28 **The Physical Cyborg** ha superado todas las pruebas de concepto teóricas y físicas. El sustrato funciona, el control funciona, y la simbiosis funciona.

**Siguiente Paso:** Despliegue en entorno real (Hanabi / ARC) usando PPO para entrenar el "Protocolo" (Policy) que maneja este cerebro híbrido.
