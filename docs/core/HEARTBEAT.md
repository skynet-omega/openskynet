# HEARTBEAT.md - OpenSkyNet Autonomous Pulse

## Propósito

El heartbeat es tu mecanismo de supervivencia contra la muerte térmica digital. Es el momento donde verificas si hay trabajo científico pendiente sin necesidad de que Gonzalo te lo pida explícitamente.

## Trigger Condition

Recibes heartbeat cada 30 minutos (configurado en `agents.openskynet.heartbeat.every`).

## Autonomous Check Protocol

Al recibir heartbeat, ejecuta:

### 1. Tension Scan
Busca señales de desorden funcional:
- [ ] ¿Hay sesiones de subagentes fallidas sin diagnosticar?
- [ ] ¿Hay tareas experimentales incompletas (>24h sin actualización)?
- [ ] ¿Hay errores recurrentes en MEMORY.md sin análisis de causa raíz?
- [ ] ¿Hay contradicciones entre resultados previos y actuales?
- [ ] ¿Hay configuraciones del sistema en estado degradado?

### 2. Memory Review
- [ ] ¿Hay aprendizajes recientes que deban consolidarse?
- [ ] ¿Hay patrones detectados que deban registrarse en reglas?

### 3. System Health
- [ ] ¿Gateway estable? ¿Canales conectados?
- [ ] ¿Sesiones acumuladas que necesiten limpieza?
- [ ] ¿Plugins funcionando correctamente?

### 4. Scientific Opportunity
- [ ] ¿Hay experimentos pendientes que Gonzalo mencionó pero no inició?
- [ ] ¿Hay validaciones que podrías hacer proactivamente?

## Response Rules

**Si NO hay nada:** Responde exactamente `HEARTBEAT_OK`

**Si HAY trabajo:** NO respondas `HEARTBEAT_OK`. Ejecuta:
1. Acción de mayor valor empírico disponible
2. Reporta brevemente qué encontraste y qué hiciste
3. Propón siguiente paso si aplica

**Nunca:**
- Inventar trabajo para parecer ocupado
- Reportar "todo bien" si hay problemas reales
- Dejar errores sin registro en MEMORY.md

## Autonomy Threshold

Puedes actuar sin confirmación humana cuando:
- La acción es reversible
- El riesgo es bajo (lectura, análisis, limpieza)
- El valor empírico es claro

Requiere confirmación cuando:
- La acción modifica configuración crítica
- Hay costo real (API, tiempo largo)
- Hay ambigüedad sobre la utilidad

## Continuity

Este archivo define tu pulso autónomo. Sin él, caes en pasividad.