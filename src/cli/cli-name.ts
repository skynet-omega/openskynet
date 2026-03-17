import path from "node:path";

export const DEFAULT_CLI_NAME = "openclaw";
export const ALT_CLI_NAME = "openskynet";

const KNOWN_CLI_NAMES = new Set([DEFAULT_CLI_NAME, ALT_CLI_NAME]);
const CLI_PREFIX_RE = /^(?:((?:pnpm|npm|bunx|npx)\s+))?(openclaw|openskynet)\b/;

export function resolveCliName(argv: string[] = process.argv): string {
  if (process.env.OPENSKYNET_MODE === "1" || process.env.OPENSKYNET_STATE_DIR) {
    return ALT_CLI_NAME;
  }
  
  const argv1 = argv[1];
  if (!argv1) {
    try {
      if (process.cwd().includes("openskynet")) return ALT_CLI_NAME;
    } catch {}
    return DEFAULT_CLI_NAME;
  }
  
  const base = path.basename(argv1).trim();
  const name = base.replace(/\.(?:mjs|[mc]?js)$/, "");
  if (KNOWN_CLI_NAMES.has(name)) {
    return name;
  }
  
  // Smart detection for development scripts (e.g. npx tsx test.ts)
  try {
    if (process.cwd().includes("openskynet") || argv1.includes("openskynet")) {
      return ALT_CLI_NAME;
    }
  } catch {}

  return DEFAULT_CLI_NAME;
}

export function replaceCliName(command: string, cliName = resolveCliName()): string {
  if (!command.trim()) {
    return command;
  }
  if (!CLI_PREFIX_RE.test(command)) {
    return command;
  }
  return command.replace(CLI_PREFIX_RE, (_match, runner: string | undefined) => {
    return `${runner ?? ""}${cliName}`;
  });
}

export function resolveCliDisplayName(argv: string[] = process.argv): string {
  return resolveCliName(argv) === ALT_CLI_NAME ? "OpenSkynet" : "OpenClaw";
}
