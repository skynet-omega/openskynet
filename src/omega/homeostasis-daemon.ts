type HomeostasisDaemonModule = {
  runHomeostasisDaemon?: (workspaceRoot: string) => Promise<void>;
};

async function loadOptionalHomeostasisDaemon(): Promise<HomeostasisDaemonModule | undefined> {
  try {
    return (await import("../skynet/homeostasis-daemon.js")) as HomeostasisDaemonModule;
  } catch {
    return undefined;
  }
}

export async function runHomeostasisDaemon(workspaceRoot: string): Promise<void> {
  const mod = await loadOptionalHomeostasisDaemon();
  if (typeof mod?.runHomeostasisDaemon !== "function") {
    return;
  }
  await mod.runHomeostasisDaemon(workspaceRoot);
}
