/**
 * OPENSKYNET DAEMON CLI
 * Commands para instalar/iniciar/detener el daemon autónomo
 *
 * Usage:
 *   pnpm tsx src/omega/daemon-cli.ts install [--interval=5]
 *   pnpm tsx src/omega/daemon-cli.ts start
 *   pnpm tsx src/omega/daemon-cli.ts stop
 *   pnpm tsx src/omega/daemon-cli.ts status
 */

import fs from "node:fs/promises";
import path from "node:path";
import { buildNodeInstallPlan } from "../commands/node-daemon-install-helpers.js";
import { resolveOpenSkyNetService } from "../daemon/openskynet-service.js";
import {
  OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
  OMEGA_DEFAULT_SESSION_KEY,
  resolveOmegaAutonomousIntervalMinutes,
  resolveOmegaWorkspaceRoot,
} from "./autonomous-runtime.js";

type DaemonCommand = "install" | "start" | "stop" | "status" | "uninstall";

async function parseDaemonArgs(): Promise<{
  command: DaemonCommand;
  interval?: number;
  force?: boolean;
}> {
  const args = process.argv.slice(2);
  const command = (args[0] ?? "status") as DaemonCommand;

  const intervalArg = args.find((arg) => arg.startsWith("--interval="));
  const interval = resolveOmegaAutonomousIntervalMinutes(
    intervalArg ? intervalArg.split("=")[1] : undefined,
    OMEGA_DEFAULT_AUTONOMOUS_INTERVAL_MINUTES,
  );

  const force = args.includes("--force");

  return { command, interval, force };
}

async function runInstall(intervalMinutes: number) {
  const workspaceRoot = resolveOmegaWorkspaceRoot({ cwd: process.cwd() });
  const service = resolveOpenSkyNetService();

  console.log("[DAEMON] 📦 Instalando OpenSkyNet Autonomous Daemon...");
  console.log(`[DAEMON]    Intervalo: ${intervalMinutes} minutos`);
  console.log(`[DAEMON]    Servicio: ${service.label}`);

  const isLoaded = await service.isLoaded({ env: process.env }).catch(() => false);
  if (isLoaded) {
    console.log("[DAEMON] ⚠️  Daemon ya instalado");
    console.log("[DAEMON]    usa --force para reinstalar");
    return;
  }

  try {
    const programArguments = [path.join(workspaceRoot, "src/omega/daemon-entry.ts")];
    const workingDirectory = workspaceRoot;
    const environment = {
      ...process.env,
      WORKSPACE_ROOT: workspaceRoot,
      SESSION_KEY: OMEGA_DEFAULT_SESSION_KEY,
      OPENSKYNET_INTERVAL_MINUTES: String(intervalMinutes),
    };

    // Install the service
    console.log("[DAEMON] 🔧 Configurando servicio...");
    await service.install({
      env: process.env,
      stdout: process.stdout,
      programArguments,
      workingDirectory,
      environment,
      description: "OpenSkyNet Autonomous Thinking Daemon",
    });

    console.log("[DAEMON] ✅ Daemon instalado exitosamente");
    console.log("[DAEMON]    Inicia con: pnpm tsx src/omega/daemon-cli.ts start");
  } catch (error) {
    console.error("[DAEMON] ❌ Error instalando daemon:", error);
    process.exit(1);
  }
}

async function runStart() {
  const service = resolveOpenSkyNetService();

  console.log("[DAEMON] 🚀 Iniciando OpenSkyNet Autonomous Daemon...");

  try {
    const result = await service.restart({ env: process.env, stdout: process.stdout });

    if (result.outcome === "completed") {
      console.log("[DAEMON] ✅ Daemon iniciado");
    } else if (result.outcome === "scheduled") {
      console.log("[DAEMON] ⏰ Daemon restart programado");
    }
  } catch (error) {
    console.error("[DAEMON] ❌ Error iniciando daemon:", error);
    process.exit(1);
  }
}

async function runStop() {
  const service = resolveOpenSkyNetService();

  console.log("[DAEMON] ⏹️  Deteniendo OpenSkyNet Autonomous Daemon...");

  try {
    await service.stop({ env: process.env, stdout: process.stdout });
    console.log("[DAEMON] ✅ Daemon detenido");
  } catch (error) {
    console.error("[DAEMON] ❌ Error deteniendo daemon:", error);
    process.exit(1);
  }
}

async function runStatus() {
  const service = resolveOpenSkyNetService();

  try {
    const isLoaded = await service.isLoaded({ env: process.env });
    const command = await service.readCommand(process.env).catch(() => null);
    const runtime = await service.readRuntime(process.env).catch(() => null);

    console.log("[DAEMON] 📊 Estado del Daemon OpenSkyNet");
    console.log(`[DAEMON]    Servicio: ${service.label}`);
    console.log(`[DAEMON]    Estado: ${isLoaded ? "✅ Activo" : "❌ Inactivo"}`);

    if (command?.programArguments) {
      console.log(`[DAEMON]    Comando: ${command.programArguments.join(" ")}`);
    }

    if (runtime?.status) {
      console.log(`[DAEMON]    Runtime: ${runtime.status}`);
    }

    if (!isLoaded) {
      console.log("");
      console.log("[DAEMON] 💡 Para instalar:");
      console.log(`[DAEMON]    pnpm tsx src/omega/daemon-cli.ts install`);
    }
  } catch (error) {
    console.error("[DAEMON] ❌ Error leyendo estado:", error);
    process.exit(1);
  }
}

async function runUninstall() {
  const service = resolveOpenSkyNetService();

  console.log("[DAEMON] 🗑️  Desinstalando OpenSkyNet Autonomous Daemon...");

  try {
    await service.stop({ env: process.env, stdout: process.stdout }).catch(() => {});
    await service.uninstall({ env: process.env, stdout: process.stdout });
    console.log("[DAEMON] ✅ Daemon desinstalado");
  } catch (error) {
    console.error("[DAEMON] ❌ Error desinstalando daemon:", error);
    process.exit(1);
  }
}

async function main() {
  const { command, interval } = await parseDaemonArgs();

  switch (command) {
    case "install":
      await runInstall(interval ?? 5);
      break;
    case "start":
      await runStart();
      break;
    case "stop":
      await runStop();
      break;
    case "status":
      await runStatus();
      break;
    case "uninstall":
      await runUninstall();
      break;
    default:
      console.log(`Comando desconocido: ${command}`);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("[DAEMON] Fatal error:", error);
  process.exit(1);
});
