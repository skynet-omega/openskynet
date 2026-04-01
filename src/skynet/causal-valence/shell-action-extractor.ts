export type SkynetShellActionKind = "discover" | "read" | "create" | "delete" | "rename" | "opaque";

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

  return {
    kind: "opaque",
    referencedPaths: [],
    commandHead: head,
    extractable: false,
  };
}
