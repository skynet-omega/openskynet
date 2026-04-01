# Telegram Flow Diff - OpenSkyNet vs OpenClaw

Fecha: 2026-03-31

Objetivo: seguir el flujo interno de un mensaje Telegram y comparar `OpenSkyNet` (`/home/daroch/openskynet`) contra `OpenClaw upstream` (`/home/daroch/openclaw_upstream`) sin asumir que upstream siempre es mejor.

## Resumen ejecutivo

El flujo real de Telegram no pasa por el gateway para generar respuestas. Telegram entra por `src/telegram/*`, cae en `auto-reply`, produce `agent events`, y recién ahí el gateway retransmite a la Web UI y a otros consumidores.

OpenSkyNet tiene una base funcional fuerte, pero diverge de upstream en tres tipos de puntos:

- mejoras reales propias que conviene conservar
- simplificaciones válidas pero con menos observabilidad
- pérdidas objetivas de robustez o trazabilidad que sí conviene recuperar

En esta revisión, los problemas reales detectados y ya corregidos fueron:

- preservación de `topicAgentId` en [conversation-route.ts](/home/daroch/openskynet/src/telegram/conversation-route.ts)
- fallback de `is_forum` vía `getChat()` en [bot-message-context.ts](/home/daroch/openskynet/src/telegram/bot-message-context.ts)
- emisión de `message:sent` al finalizar previews en [bot-message-dispatch.ts](/home/daroch/openskynet/src/telegram/bot-message-dispatch.ts)
- fallback correcto para General topic en [bot-message.ts](/home/daroch/openskynet/src/telegram/bot-message.ts)
- restauración de telemetría básica de ingress en [bot-message.ts](/home/daroch/openskynet/src/telegram/bot-message.ts) y [bot-handlers.ts](/home/daroch/openskynet/src/telegram/bot-handlers.ts)

## Flujo real

### 1. Ingreso Telegram

OpenSkyNet:

- [bot.ts](/home/daroch/openskynet/src/telegram/bot.ts) crea `processMessage` con `createTelegramMessageProcessor()`
- [bot-handlers.ts](/home/daroch/openskynet/src/telegram/bot-handlers.ts) agrupa updates, media groups, text fragments, callbacks y resuelve debounce
- [bot-message.ts](/home/daroch/openskynet/src/telegram/bot-message.ts) construye contexto y despacha la respuesta

OpenClaw upstream:

- equivalente en `extensions/telegram/src/bot.ts`
- handlers separados en `extensions/telegram/src/bot-handlers.runtime.ts` y `bot-handlers.buffers.ts`
- processor en `extensions/telegram/src/bot-message.ts`

Observación:

- OpenSkyNet sigue más acoplado y monolítico.
- Upstream tiene seams mejores para test y pluginización.
- Eso es deuda estructural, no automáticamente un bug.

### 2. Construcción de contexto y routing

OpenSkyNet:

- [bot-message-context.ts](/home/daroch/openskynet/src/telegram/bot-message-context.ts)
- [conversation-route.ts](/home/daroch/openskynet/src/telegram/conversation-route.ts)
- [bot-message-context.session.ts](/home/daroch/openskynet/src/telegram/bot-message-context.session.ts)

Upstream:

- `extensions/telegram/src/bot-message-context.ts`
- `extensions/telegram/src/conversation-route.ts`

Hallazgos:

- OpenSkyNet había perdido el fallback de `forum` por `getChat()` y dependía sólo de `msg.chat.is_forum`.
  Resultado: un foro podía verse como supergroup normal y romper el session key `:topic:`.
- OpenSkyNet también había cambiado la semántica de `topicAgentId` para caer al default agent cuando el id configurado no existía en el snapshot actual.
  Resultado: riesgo de reroute silencioso de una conversación a otro agente.

Estado:

- ambos puntos ya quedaron corregidos

### 3. Ejecución de respuesta

OpenSkyNet:

- [bot-message-dispatch.ts](/home/daroch/openskynet/src/telegram/bot-message-dispatch.ts)
- [provider-dispatcher.ts](/home/daroch/openskynet/src/auto-reply/reply/provider-dispatcher.ts)
- [dispatch.ts](/home/daroch/openskynet/src/auto-reply/dispatch.ts)

Ruta:

1. `dispatchTelegramMessage()`
2. `dispatchReplyWithBufferedBlockDispatcher()`
3. `dispatchInboundMessageWithBufferedDispatcher()`
4. `dispatchReplyFromConfig()`
5. emisión de texto, tools, reasoning y mensajes finales

Conclusión:

- el runtime real está en `auto-reply`, no en gateway
- el gateway observa y retransmite; no genera esta respuesta

### 4. Entrega Telegram

OpenSkyNet:

- [bot-message-dispatch.ts](/home/daroch/openskynet/src/telegram/bot-message-dispatch.ts)
- [lane-delivery-text-deliverer.ts](/home/daroch/openskynet/src/telegram/lane-delivery-text-deliverer.ts)
- [delivery.replies.ts](/home/daroch/openskynet/src/telegram/bot/delivery.replies.ts)
- [send.ts](/home/daroch/openskynet/src/telegram/send.ts)

Upstream:

- mismas responsabilidades, pero con más seams por `telegramDeps`

Hallazgos:

- OpenSkyNet conservó una lógica fuerte de preview lanes, reasoning lane y finalización.
- Pero había perdido la emisión del hook interno `message:sent` cuando el preview finalizaba por edición in-place.
  Eso no rompía Telegram visible, pero sí trazabilidad para hooks y automatizaciones.
- También faltaba el manejo correcto del General topic (`id=1`) en el fallback de error de `bot-message.ts`.

Estado:

- ambos puntos ya quedaron corregidos

### 5. Agent events, gateway y Web UI

OpenSkyNet:

- [server-chat.ts](/home/daroch/openskynet/src/gateway/server-chat.ts)
- [app-gateway.ts](/home/daroch/openskynet/ui/src/ui/app-gateway.ts)
- [controllers/chat.ts](/home/daroch/openskynet/ui/src/ui/controllers/chat.ts)
- [app-tool-stream.ts](/home/daroch/openskynet/ui/src/ui/app-tool-stream.ts)

Ruta:

1. el runtime emite `agent events`
2. [server-chat.ts](/home/daroch/openskynet/src/gateway/server-chat.ts) transforma eso en:
   - stream `agent`
   - stream `chat` con `delta/final/error`
3. la Web UI consume esos eventos y reconstruye:
   - texto incremental
   - cards de tools
   - refresh de historial al terminar

Conclusión:

- Telegram y Web UI no comparten el mismo camino de generación
- comparten observación posterior de eventos del agente
- si falta un hook o una señal en Telegram, la UI puede seguir viéndose bien mientras automatizaciones o telemetría quedan ciegas

## Qué está mejor en OpenSkyNet

- integración más directa con ACP y bindings locales
- lógica propia de auto-approve/hardening en ACP que en algunas zonas supera upstream
- pipeline Telegram todavía potente en draft streaming y reasoning lane
- session/routing model más integrado con el resto del runtime propio

## Qué está peor en OpenSkyNet

- mayor acoplamiento en `src/telegram/*`
- menos seams de inyección que upstream
- telemetría de ingress reducida respecto a upstream
- pérdida histórica de algunos hooks y señales internas
- más riesgo de drift silencioso porque el código local ya no sigue la misma partición modular de OpenClaw

## Qué fue simplificación válida vs pérdida real

Simplificación válida:

- no adoptar toda la abstracción `telegramDeps` de upstream
- mantener delivery directo con tipos/runtime locales
- no portar toda la pluginización del canal

Pérdida real:

- perder fallback `is_forum`
- perder preservación de `topicAgentId`
- perder `message:sent` sobre preview finalized
- enviar `message_thread_id=1` en fallbacks al General topic
- perder telemetría de ingreso cuando el dato `receivedAtMs` ya estaba disponible en handlers

## Cambios aplicados en esta revisión

- [conversation-route.ts](/home/daroch/openskynet/src/telegram/conversation-route.ts)
  - preserva `topicAgentId` configurado
- [bot/helpers.ts](/home/daroch/openskynet/src/telegram/bot/helpers.ts)
  - agrega `extractTelegramForumFlag()` y `resolveTelegramForumFlag()`
- [bot-message-context.ts](/home/daroch/openskynet/src/telegram/bot-message-context.ts)
  - recupera forum fallback vía `getChat()`
- [bot-message.ts](/home/daroch/openskynet/src/telegram/bot-message.ts)
  - recupera logs de ingress
  - usa `buildTelegramThreadParams()` en fallback de error
- [bot-handlers.ts](/home/daroch/openskynet/src/telegram/bot-handlers.ts)
  - vuelve a pasar `receivedAtMs` e `ingressBuffer`
- [bot-message-dispatch.ts](/home/daroch/openskynet/src/telegram/bot-message-dispatch.ts)
  - emite hook interno al finalizar previews
- [bot/delivery.ts](/home/daroch/openskynet/src/telegram/bot/delivery.ts)
  - reexporta `emitInternalMessageSentHook`

## Próximos frentes recomendados

1. revisar `bot-message-dispatch.ts` contra upstream sólo en observabilidad:
   - `silentErrorReplies`
   - preview finalization
   - hooks internos

2. revisar `bot-message-context.ts` contra upstream en pairing y acceso DM:
   - `upsertPairingRequest`
   - políticas de named accounts

3. revisar si alguna automatización interna consume `message:sent` o `recordChannelActivity` y estaba ciega por el drift local

4. recién después evaluar si conviene partir `src/telegram/*` en módulos más parecidos a upstream

No recomiendo intentar una repluginización completa del canal Telegram ahora. El mejor retorno sigue siendo portar hardening y observabilidad puntuales, no un trasplante estructural masivo.
