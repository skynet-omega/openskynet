# Auditoría: Puertos de OpenSkyNet vs OpenClaw

**Fecha:** 2025-03-14  
**Problema:** Los puertos de OpenSkyNet no funcionan / están ocupados por OpenClaw

---

## Diagnóstico del Problema

### 1. No existe separación de estado

**Código actual (`src/config/paths.ts`):**
```typescript
const NEW_STATE_DIRNAME = ".openclaw";  // ← Solo existe .openclaw

export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  // NO hay OPENSKYNET_STATE_DIR
  if (override) {
    return resolveUserPath(override, env, effectiveHomedir);
  }
  return newStateDir(effectiveHomedir);  // Siempre ~/.openclaw
}
```

**Resultado:** OpenSkyNet y OpenClaw comparten:
- Mismo directorio de estado (`~/.openclaw`)
- Mismo archivo de configuración (`~/.openclaw/openclaw.json`)
- Mismos puertos (derivados del gateway port)

### 2. Los puertos se derivan del gateway port

**Código actual (`src/config/port-defaults.ts`):**
```typescript
export function deriveDefaultBrowserControlPort(gatewayPort: number): number {
  return derivePort(gatewayPort, 2, DEFAULT_BROWSER_CONTROL_PORT);  // gateway + 2
}

export function deriveDefaultCanvasHostPort(gatewayPort: number): number {
  return derivePort(gatewayPort, 4, DEFAULT_CANVAS_HOST_PORT);  // gateway + 4
}
```

**Si gateway = 18789:**
- Browser Control = 18791
- Canvas Host = 18793

**No hay lógica para puertos diferentes basada en `cliName`.**

### 3. El `cliName` solo afecta display, no configuración

**Código (`src/cli/cli-name.ts`):**
```typescript
export function resolveCliDisplayName(argv: string[] = process.argv): string {
  return resolveCliName(argv) === ALT_CLI_NAME ? "OpenSkynet" : "OpenClaw";
}
```

Solo cambia el nombre mostrado. No afecta puertos, estado, ni configuración.

---

## Por qué "no funcionan los puertos de OpenSkyNet"

Cuando ejecutas `openskynet`:
1. Lee la misma config que `openclaw`
2. Usa los mismos puertos (18789, 18791, 18793)
3. Si OpenClaw ya está corriendo → puertos ocupados → error
4. Si intentas cambiar puertos manualmente → afecta a ambos

**No hay mecanismo para tener instancias separadas.**

---

## Soluciones Propuestas

### Opción 1: Variable de entorno OPENSKYNET_STATE_DIR (Rápida)

**Cambio en `src/config/paths.ts`:**
```typescript
export function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  // Añadir soporte para OPENSKYNET_STATE_DIR
  const override = 
    env.OPENSKYNET_STATE_DIR?.trim() ||
    env.OPENCLAW_STATE_DIR?.trim() || 
    env.CLAWDBOT_STATE_DIR?.trim();
  
  if (override) {
    return resolveUserPath(override, env, effectiveHomedir);
  }
  
  // Si cliName es openskynet, usar directorio diferente
  const cliName = resolveCliName();
  if (cliName === ALT_CLI_NAME) {
    return path.join(effectiveHomedir(), ".openskynet");
  }
  
  return newStateDir(effectiveHomedir);
}
```

**Uso:**
```bash
export OPENSKYNET_STATE_DIR=~/.openskynet
export OPENSKYNET_GATEWAY_PORT=19789
openskynet gateway start
```

**Pros:**
- Simple, no rompe compatibilidad
- Permite instancias completamente separadas

**Contras:**
- Requiere setear variables de entorno
- No es automático

---

### Opción 2: Offset de puertos basado en cliName (Recomendada)

**Cambio en `src/config/port-defaults.ts`:**
```typescript
import { resolveCliName, ALT_CLI_NAME } from "../cli/cli-name.js";

const PORT_OFFSET_OPENCLAW = 0;
const PORT_OFFSET_OPENSKYNET = 1000;  // Offset de 1000 para OpenSkyNet

function getPortOffset(): number {
  return resolveCliName() === ALT_CLI_NAME ? PORT_OFFSET_OPENSKYNET : PORT_OFFSET_OPENCLAW;
}

export function deriveDefaultGatewayPort(): number {
  return DEFAULT_GATEWAY_PORT + getPortOffset();  // 18789 + 1000 = 19789
}

export function deriveDefaultBrowserControlPort(gatewayPort?: number): number {
  const base = gatewayPort ?? deriveDefaultGatewayPort();
  return derivePort(base, 2, DEFAULT_BROWSER_CONTROL_PORT + getPortOffset());
}

export function deriveDefaultCanvasHostPort(gatewayPort?: number): number {
  const base = gatewayPort ?? deriveDefaultGatewayPort();
  return derivePort(base, 4, DEFAULT_CANVAS_HOST_PORT + getPortOffset());
}
```

**Resultado:**
| Servicio | OpenClaw | OpenSkyNet |
|----------|----------|------------|
| Gateway | 18789 | 19789 |
| Browser Control | 18791 | 19791 |
| Canvas Host | 18793 | 19793 |

**Pros:**
- Automático, sin variables de entorno
- Predictible
- No rompe compatibilidad

**Contras:**
- Cambio más invasivo
- Requiere modificar lógica de derivación

---

### Opción 3: Configuración por agente en openclaw.json (Flexible)

**Estructura de config:**
```json
{
  "gateway": {
    "port": 18789,
    "agents": {
      "openskynet": {
        "port": 19789,
        "browserControlPort": 19791,
        "canvasHostPort": 19793
      }
    }
  }
}
```

**Cambio en código:**
```typescript
export function resolveAgentSpecificPort(
  basePort: number, 
  agentId: string,
  config: OpenClawConfig
): number {
  return config.gateway?.agents?.[agentId]?.port ?? basePort;
}
```

**Pros:**
- Máxima flexibilidad
- Configurable por usuario

**Contras:**
- Complejidad alta
- Cambios en schema de config

---

## Recomendación

**Implementar Opción 2** (offset basado en cliName) como solución principal, con **Opción 1** (variable de entorno) como override.

Esto permite:
1. Ejecutar `openskynet` automáticamente en puertos 19789+
2. Override manual vía `OPENSKYNET_STATE_DIR` si es necesario
3. Compatibilidad backward con OpenClaw existente

---

## Implementación Propuesta

### Paso 1: Modificar `src/config/port-defaults.ts`

```typescript
import { resolveCliName, ALT_CLI_NAME } from "../cli/cli-name.js";

const OPENSKYNET_PORT_OFFSET = 1000;

function getPortOffset(): number {
  try {
    return resolveCliName() === ALT_CLI_NAME ? OPENSKYNET_PORT_OFFSET : 0;
  } catch {
    return 0;
  }
}

export const DEFAULT_GATEWAY_PORT = 18789 + getPortOffset();
export const DEFAULT_BRIDGE_PORT = 18790 + getPortOffset();
export const DEFAULT_BROWSER_CONTROL_PORT = 18791 + getPortOffset();
export const DEFAULT_CANVAS_HOST_PORT = 18793 + getPortOffset();
export const DEFAULT_BROWSER_CDP_PORT_RANGE_START = 18800 + getPortOffset();
export const DEFAULT_BROWSER_CDP_PORT_RANGE_END = 18899 + getPortOffset();
```

### Paso 2: Modificar `src/config/paths.ts`

```typescript
export function resolveStateDir(
  env: NodeJS.ProcessEnv = process.env,
  homedir: () => string = envHomedir(env),
): string {
  const effectiveHomedir = () => resolveRequiredHomeDir(env, homedir);
  
  // Prioridad: OPENSKYNET > OPENCLAW > default
  const override = 
    env.OPENSKYNET_STATE_DIR?.trim() ||
    env.OPENCLAW_STATE_DIR?.trim() || 
    env.CLAWDBOT_STATE_DIR?.trim();
  
  if (override) {
    return resolveUserPath(override, env, effectiveHomedir);
  }
  
  // Auto-detectar basado en cliName
  try {
    const { resolveCliName, ALT_CLI_NAME } = require("../cli/cli-name.js");
    if (resolveCliName() === ALT_CLI_NAME) {
      return path.join(effectiveHomedir(), ".openskynet");
    }
  } catch {
    // Fallback a default
  }
  
  return newStateDir(effectiveHomedir);
}
```

### Paso 3: Tests

```typescript
// src/config/port-defaults.test.ts
it("uses offset ports when cliName is openskynet", () => {
  jest.mock("../cli/cli-name.js", () => ({
    resolveCliName: () => "openskynet",
    ALT_CLI_NAME: "openskynet",
  }));
  
  const { DEFAULT_GATEWAY_PORT } = require("./port-defaults.js");
  expect(DEFAULT_GATEWAY_PORT).toBe(19789);
});
```

---

## Conclusión

**El problema es real:** OpenSkyNet no tiene mecanismo para puertos/estado separados.

**La causa:** `cliName` solo afecta display, no configuración.

**La solución:** Implementar offset de puertos y directorio de estado basado en `cliName`.

**Impacto:** Cambio moderado en `port-defaults.ts` y `paths.ts`, con alta compatibilidad backward.

---

*Auditoría generada automáticamente por análisis de código.*
