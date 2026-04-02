# Gateway / UI Session Flow Diff - OpenSkyNet vs OpenClaw

Fecha: 2026-03-31

Objetivo: comparar el tramo compartido posterior al runtime del agente:

- `agent events`
- `gateway server-chat`
- `websocket events`
- `Web UI`
- refresco de sesiones / observabilidad

## Resumen

OpenSkyNet ya tenía bien resuelto el flujo de `chat delta/final` y `tool events` por run id.

La deriva principal frente a upstream no estaba en el chat básico, sino en la observabilidad de sesiones vivas:

- upstream soporta suscripción live de sesiones
- upstream emite `sessions.changed`
- upstream refresca la UI de sesiones sin polling ciego

OpenSkyNet no tenía ese tramo. Resultado: la vista de sesiones podía quedarse stale aunque el runtime y el chat funcionaran bien.

## Hallazgos

### 1. `server-chat.ts`

OpenSkyNet conservaba:

- `chat` delta/final
- tool recipient registry por run id
- filtrado de heartbeat y `NO_REPLY`
- flush antes de `tool-start`

Pero le faltaba:

- registro de subscribers de sesión
- emisión de `sessions.changed`

Eso no rompe la conversación, pero sí deja ciega la capa que observa el estado de sesiones.

### 2. `server-methods/sessions.ts`

OpenSkyNet tenía:

- `sessions.list`
- `sessions.preview`
- `sessions.patch`
- `sessions.reset`
- `sessions.delete`

Pero no tenía:

- `sessions.subscribe`
- `sessions.unsubscribe`

Entonces la UI no podía pedir updates live del gateway.

### 3. `server.impl.ts` y `ws-connection.ts`

OpenSkyNet tampoco tenía:

- wiring de subscribers de sesión en el request context
- cleanup de esas suscripciones al cerrar el websocket

### 4. Web UI

OpenSkyNet no tenía:

- `subscribeSessions()` en [controllers/sessions.ts](/home/daroch/openskynet/ui/src/ui/controllers/sessions.ts)
- llamada a esa suscripción en [app-gateway.ts](/home/daroch/openskynet/ui/src/ui/app-gateway.ts)
- manejo del evento `sessions.changed`

Entonces la UI dependía de refresh explícito o de side effects indirectos tras `chat final`.

## Cambios aplicados

### Gateway

- [server-chat.ts](/home/daroch/openskynet/src/gateway/server-chat.ts)
  - agregado `SessionEventSubscriberRegistry`
  - agregado `createSessionEventSubscriberRegistry()`
  - emisión de `sessions.changed` para lifecycle `start/end/error`

- [server-methods/types.ts](/home/daroch/openskynet/src/gateway/server-methods/types.ts)
  - agregado wiring de subscribe/unsubscribe session events

- [server-methods/sessions.ts](/home/daroch/openskynet/src/gateway/server-methods/sessions.ts)
  - agregados handlers `sessions.subscribe` y `sessions.unsubscribe`

- [server-methods-list.ts](/home/daroch/openskynet/src/gateway/server-methods-list.ts)
  - registrados métodos nuevos

- [method-scopes.ts](/home/daroch/openskynet/src/gateway/method-scopes.ts)
  - expuestos bajo `operator.read`

- [server.impl.ts](/home/daroch/openskynet/src/gateway/server.impl.ts)
  - creado registry
  - conectado a `createAgentEventHandler()`
  - expuesto en `GatewayRequestContext`

- [server/ws-connection.ts](/home/daroch/openskynet/src/gateway/server/ws-connection.ts)
  - cleanup de suscripciones al cerrar conexión

### UI

- [controllers/sessions.ts](/home/daroch/openskynet/ui/src/ui/controllers/sessions.ts)
  - agregado `subscribeSessions()`

- [app-gateway.ts](/home/daroch/openskynet/ui/src/ui/app-gateway.ts)
  - suscripción al conectar
  - refresh de sesiones al recibir `sessions.changed`

## Alcance del port

Este port fue deliberadamente mínimo.

No traje todavía:

- `session.tool`
- snapshot rico de lifecycle por sesión
- `sessions.messages.subscribe`
- row snapshots desde `loadGatewaySessionRow()`
- persistencia de lifecycle events

Razón:

- OpenSkyNet no tenía todavía la infraestructura local equivalente
- meter todo eso en una sola pasada abría demasiado write set
- el mayor retorno inmediato era recuperar refresh live de sesiones

## Verificación

Se verificó servidor con:

```bash
pnpm vitest src/gateway/server-chat.agent-events.test.ts --run
pnpm vitest src/gateway/server.sessions.gateway-server-sessions-a.test.ts --run
```

Ambas pasaron.

La cobertura UI añadida quedó limitada por el include actual de Vitest en este repo, que no ejecuta por defecto esos archivos nuevos bajo `ui/src/ui/`.

## Siguiente paso recomendado

Si quieres seguir por esta línea, el siguiente lote con mejor retorno es:

1. portar `sessions.messages.subscribe`
2. portar `session.tool`
3. evaluar si conviene traer el snapshot parcial de lifecycle de upstream

Eso ya permitiría que la Web UI vea sesiones y herramientas live incluso cuando se conecta tarde a una sesión en curso.
