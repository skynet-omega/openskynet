# End-to-End Flow Audit - OpenSkyNet vs OpenClaw

Fecha: 2026-03-31

Objetivo: revisar el flujo completo de una solicitud real desde canal hasta observabilidad final, comparando `OpenSkyNet` (`/home/daroch/openskynet`) contra `OpenClaw upstream` (`/home/daroch/openclaw_upstream`), distinguiendo:

- mejoras reales de OpenSkyNet
- simplificaciones válidas
- pérdidas objetivas de robustez, causalidad u observabilidad

## Alcance del flujo

Este audit sigue este recorrido:

1. canal de entrada
2. construcción de contexto/routing
3. runtime de respuesta
4. `agent events` y `tool events`
5. gateway
6. Web UI
7. hooks internos y logs/eventos de sistema

## Resumen ejecutivo

OpenSkyNet no está “mal en general”. Lo que tiene es drift acumulado de varios tipos:

- mejoras reales propias que sí superan a upstream
- piezas equivalentes que sólo difieren en estructura
- partes donde perdió hardening
- partes donde perdió contratos live y observabilidad

La revisión de hoy confirma esto:

- Telegram y ACP tenían pérdidas concretas respecto a upstream
- gateway/UI también tenía pérdidas concretas en live session flow
- el runtime central y varias piezas locales siguen siendo competitivos o mejores

Lo importante no es “alinear todo a upstream”, sino podar drift malo y conservar drift útil.

## Estado actual por tramo

### 1. Canal de entrada

#### Telegram

Ruta real:

- [bot.ts](/home/daroch/openskynet/src/telegram/bot.ts)
- [bot-handlers.ts](/home/daroch/openskynet/src/telegram/bot-handlers.ts)
- [bot-message.ts](/home/daroch/openskynet/src/telegram/bot-message.ts)
- [bot-message-context.ts](/home/daroch/openskynet/src/telegram/bot-message-context.ts)
- [conversation-route.ts](/home/daroch/openskynet/src/telegram/conversation-route.ts)

Hallazgos ya corregidos:

- `topicAgentId` ya no cae silenciosamente al agent default
- `is_forum` vuelve a resolverse con fallback vía `getChat()`
- el fallback de error ya no manda `message_thread_id=1` al General topic
- volvió la telemetría básica de ingress (`receivedAtMs`, `contextReadyMs`, `preDispatchMs`, `dispatchCompleteMs`)
- `message:sent` vuelve a emitirse al finalizar previews por edición in-place

Conclusión:

- el flujo Telegram ya no tiene los bugs más peligrosos de routing
- sigue más acoplado que upstream, pero ya no quedó ciego en los puntos críticos revisados

### 2. Runtime de respuesta

Ruta real:

- [dispatch.ts](/home/daroch/openskynet/src/auto-reply/dispatch.ts)
- [dispatch-from-config.ts](/home/daroch/openskynet/src/auto-reply/reply/dispatch-from-config.ts)
- [provider-dispatcher.ts](/home/daroch/openskynet/src/auto-reply/reply/provider-dispatcher.ts)

Conclusión:

- el runtime real sigue estando en `auto-reply`, no en gateway
- gateway y UI observan este runtime; no generan la respuesta
- eso importa porque varios bugs de “la UI se ve bien” no significan que hooks/logs/runtime estén consistentes

### 3. Transcript y sesiones

Pérdidas recuperadas:

- [transcript-events.ts](/home/daroch/openskynet/src/sessions/transcript-events.ts) ya soporta payload rico (`sessionKey`, `message`, `messageId`)
- [transcript.ts](/home/daroch/openskynet/src/config/sessions/transcript.ts) ya emite ese payload al append de transcript
- [session-tool-result-guard.ts](/home/daroch/openskynet/src/agents/session-tool-result-guard.ts) también lo emite al escribir resultados de tool

Eso habilitó:

- `sessions.messages.subscribe`
- `session.message`
- `sessions.changed` por eventos de transcript

Conclusión:

- OpenSkyNet ya no depende sólo de leer transcript desde disco para enterarse de cambios
- el contrato live de sesiones quedó más cerca de upstream

### 4. Gateway

Pérdidas recuperadas:

- [server-chat.ts](/home/daroch/openskynet/src/gateway/server-chat.ts)
  - `sessions.changed`
  - `session.message`
  - `session.tool`
- [server-methods/sessions.ts](/home/daroch/openskynet/src/gateway/server-methods/sessions.ts)
  - `sessions.subscribe`
  - `sessions.unsubscribe`
  - `sessions.messages.subscribe`
  - `sessions.messages.unsubscribe`
- [server.impl.ts](/home/daroch/openskynet/src/gateway/server.impl.ts)
  - wiring de subscribers de sesión/transcript
- [server/ws-connection.ts](/home/daroch/openskynet/src/gateway/server/ws-connection.ts)
  - cleanup de suscripciones al cerrar WS
- [server-broadcast.ts](/home/daroch/openskynet/src/gateway/server-broadcast.ts)
  - scopes de lectura para `sessions.changed`, `session.message`, `session.tool`

Conclusión:

- el gateway ya expone un contrato live bastante más sólido
- antes había demasiado refresh indirecto y poca suscripción explícita
- todavía no porta todo el snapshot rico de upstream, pero lo crítico ya quedó

### 5. Web UI

Pérdidas recuperadas:

- [controllers/sessions.ts](/home/daroch/openskynet/ui/src/ui/controllers/sessions.ts)
  - ya suscribe sesiones live
- [controllers/chat.ts](/home/daroch/openskynet/ui/src/ui/controllers/chat.ts)
  - ya sincroniza suscripción de `sessions.messages`
  - ya consume `session.message` con append selectivo o fallback a reload
- [app-gateway.ts](/home/daroch/openskynet/ui/src/ui/app-gateway.ts)
  - maneja `sessions.changed`
  - maneja `session.message`
- [app-render.helpers.ts](/home/daroch/openskynet/ui/src/ui/app-render.helpers.ts)
  - resincroniza suscripción al cambiar de sesión

Conclusión:

- la UI ya no está obligada a vivir sólo de `chat.history` y recargas completas
- para transcript live, OpenSkyNet ya quedó mejor que antes
- `session.tool` todavía no se consume en UI; por ahora eso es una mejora de contrato del gateway más que de presentación

### 6. Hooks y logs

Piezas relevantes:

- [internal-hooks.ts](/home/daroch/openskynet/src/hooks/internal-hooks.ts)
- [delivery.replies.ts](/home/daroch/openskynet/src/telegram/bot/delivery.replies.ts)
- [bot-message-dispatch.ts](/home/daroch/openskynet/src/telegram/bot-message-dispatch.ts)
- [system-events.ts](/home/daroch/openskynet/src/infra/system-events.ts)
- [server-node-events.ts](/home/daroch/openskynet/src/gateway/server-node-events.ts)
- [server-restart-sentinel.ts](/home/daroch/openskynet/src/gateway/server-restart-sentinel.ts)
- [server-cron.ts](/home/daroch/openskynet/src/gateway/server-cron.ts)

Estado actual:

- `message:sent` volvió a emitirse en Telegram donde estaba faltando
- `system events` siguen siendo efímeros y session-scoped; esto es deliberado
- `recordChannelActivity` sigue registrando actividad de canal en los puntos de send/context relevantes
- gateway y cron siguen pudiendo inyectar system events hacia sesiones

Conclusión:

- la causalidad de hooks/logs ya no tiene el hueco más obvio que había en Telegram
- todavía no hay una sola vista integrada que una canal, tool, transcript, hook y UI en un timeline único
- eso no es un bug funcional inmediato, pero sí un límite de observabilidad

## Qué está claramente mejor en OpenSkyNet

- ACP local y varias decisiones de integración propias
- parte del runtime y del trabajo alrededor de `src/omega`
- varias rutas de configuración y compatibilidad local
- ahora también la capa live de transcript en UI quedó mejor integrada que antes

## Qué estaba claramente peor y ya se corrigió

- parsing/hardening de `gateway port`
- parte de la lógica de configured bindings ACP
- fallback ACP de provenance sin admin scope
- saneamiento de títulos ACP
- spoofing/riesgo de auto-approve en ACP client
- replay de `thinking`
- routing Telegram por `topicAgentId`
- fallback de `forum` en Telegram
- hook `message:sent` al finalizar previews
- fallback de error en General topic
- telemetría de ingress Telegram
- `sessions.changed`
- `sessions.messages.subscribe`
- `session.message`
- `session.tool`

## Qué sigue abierto

### 1. `session.tool` todavía no alimenta una ruta separada en UI

Hoy la UI sigue consumiendo tools principalmente desde `agent` en [app-tool-stream.ts](/home/daroch/openskynet/ui/src/ui/app-tool-stream.ts).

Eso no es incorrecto, pero deja pendiente decidir si:

- se mantiene así por simplicidad
- o se consume `session.tool` para adjuntarse mejor a sesiones ya vivas sin depender del run-scoped stream

### 2. La UI de gateway no tiene toda la cobertura ejecutable deseable

Hay pruebas nuevas/actualizadas bajo `ui/src/ui/`, pero el `include` actual de Vitest no toma todas por defecto.

Eso significa:

- la lógica está cubierta parcialmente
- pero no toda la superficie UI nueva quedó en el path estándar de ejecución

### 3. Falta una auditoría cruzada de timeline de observabilidad

No existe todavía un test o vista que demuestre en una sola secuencia:

1. llega mensaje Telegram
2. se enruta a sesión
3. se dispara runtime
4. salen `agent/tool events`
5. se refleja en gateway
6. se actualiza UI
7. se emite hook/log correspondiente

Ese sería el siguiente nivel de confianza real.

## Nivel de confianza actual

No diría “100% seguro” en sentido absoluto.

Sí diría esto:

- los bugs concretos más peligrosos que aparecieron en el diff ya quedaron corregidos
- gateway/UI/logs/hooks tienen ahora una causalidad bastante mejor
- el riesgo restante ya no está en bugs obvios del flujo básico, sino en observabilidad fina y cobertura cruzada

## Siguiente paso recomendado

Si el objetivo es estar lo más cerca posible de “100% seguros”, el siguiente frente correcto no es seguir parchando a ciegas, sino una de estas dos rutas:

1. construir una prueba/audit de flujo integrado `Telegram -> runtime -> gateway -> UI -> hook/log`
2. revisar si `session.tool` debe consumirse explícitamente en UI para sesiones adjuntas tarde

La opción 1 da más confianza empírica.
