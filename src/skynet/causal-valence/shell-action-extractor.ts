export type SkynetShellActionKind =
  | "discover"
  | "read"
  | "create"
  | "delete"
  | "rename"
  | "validate"
  | "opaque";

export type SkynetShellActionExtraction = {
  kind: SkynetShellActionKind;
  referencedPaths: string[];
  commandHead: string;
  extractable: boolean;
};

function tokenizeShellCommand(command: string): string[] {
  return command
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function stripQuotes(token: string): string {
  return token.replace(/^['"]|['"]$/g, "");
}

function isOption(token: string): boolean {
  return token.startsWith("-");
}

function isShellSeparator(token: string): boolean {
  return token === "&&" || token === "||" || token === ";" || token === "|";
}

function isRedirection(token: string): boolean {
  return token === ">" || token === ">>" || token === "1>" || token === "1>>";
}

function collectPlainPaths(tokens: string[]): string[] {
  return tokens
    .filter((token) => !isOption(token) && !isShellSeparator(token))
    .map(stripQuotes)
    .filter((token) => token.length > 0);
}

function extractGrepPaths(tokens: string[]): string[] {
  const paths: string[] = [];
  for (const token of tokens) {
    if (isOption(token) || isShellSeparator(token)) {
      continue;
    }
    const value = stripQuotes(token);
    if (value.length === 0) {
      continue;
    }
    if (value.startsWith("/") || value.startsWith(".") || value.startsWith("~")) {
      paths.push(value);
    }
  }
  return paths;
}

function extractFindPaths(tokens: string[]): string[] {
  const paths: string[] = [];
  for (const token of tokens) {
    if (isOption(token) || isShellSeparator(token)) {
      continue;
    }
    const value = stripQuotes(token);
    if (value === "find" || value.startsWith("-")) {
      continue;
    }
    paths.push(value);
    break;
  }
  return paths;
}

function extractRedirectionPaths(tokens: string[]): string[] {
  const paths: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!isRedirection(tokens[index])) {
      continue;
    }
    const nextToken = stripQuotes(tokens[index + 1] ?? "");
    if (nextToken && !isOption(nextToken) && !isShellSeparator(nextToken)) {
      paths.push(nextToken);
    }
  }
  return paths;
}

function extractFlagValue(tokens: string[], ...flags: string[]): string[] {
  const paths: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!flags.includes(tokens[index] ?? "")) {
      continue;
    }
    const nextToken = stripQuotes(tokens[index + 1] ?? "");
    if (nextToken && !isOption(nextToken) && !isShellSeparator(nextToken)) {
      paths.push(nextToken);
    }
  }
  return paths;
}

function startsWithAny(value: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function extractSkynetShellAction(command: string): SkynetShellActionExtraction {
  const tokens = tokenizeShellCommand(command);
  const head = tokens[0] ?? "";
  const rest = tokens.slice(1);

  if (head === "ls") {
    return {
      kind: "discover",
      referencedPaths: collectPlainPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "cat") {
    const redirected = extractRedirectionPaths(rest);
    if (redirected.length > 0) {
      return {
        kind: "create",
        referencedPaths: redirected,
        commandHead: head,
        extractable: true,
      };
    }
    return {
      kind: "read",
      referencedPaths: collectPlainPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "grep") {
    return {
      kind: "discover",
      referencedPaths: extractGrepPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "find") {
    return {
      kind: "discover",
      referencedPaths: extractFindPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "rm") {
    return {
      kind: "delete",
      referencedPaths: collectPlainPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "mv") {
    return {
      kind: "rename",
      referencedPaths: collectPlainPaths(rest).slice(0, 2),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "mkdir") {
    return {
      kind: "create",
      referencedPaths: collectPlainPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "touch" || head === "cp") {
    return {
      kind: "create",
      referencedPaths: collectPlainPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "tail" || head === "journalctl" || head === "pm2") {
    return {
      kind: "read",
      referencedPaths: collectPlainPaths(rest),
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "openclaw" && tokens[1] === "status") {
    return {
      kind: "validate",
      referencedPaths: [],
      commandHead: head,
      extractable: true,
    };
  }
  if (head === "bash" || head === "sh") {
    const outputPaths = extractFlagValue(rest, "--out", "-o");
    if (outputPaths.length > 0) {
      return {
        kind: "create",
        referencedPaths: outputPaths,
        commandHead: head,
        extractable: true,
      };
    }
  }
  if (
    head === "npx" ||
    head === "pnpm" ||
    head === "npm" ||
    head === "pytest" ||
    head === "vitest" ||
    head === "tsc"
  ) {
    const joined = tokens.join(" ");
    if (
      joined.includes("vitest") ||
      joined.includes("pytest") ||
      joined.includes(" test") ||
      joined.includes("tsc") ||
      joined.includes("eslint") ||
      joined.includes("oxlint")
    ) {
      return {
        kind: "validate",
        referencedPaths: collectPlainPaths(rest).filter((token) =>
          startsWithAny(token, ["/", ".", "~"]),
        ),
        commandHead: head,
        extractable: true,
      };
    }
  }
  if (extractRedirectionPaths(tokens).length > 0) {
    return {
      kind: "create",
      referencedPaths: extractRedirectionPaths(tokens),
      commandHead: head,
      extractable: true,
    };
  }

  return {
    kind: "opaque",
    referencedPaths: [],
    commandHead: head,
    extractable: false,
  };
}
