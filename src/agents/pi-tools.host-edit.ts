import { exec } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentToolResult, AgentToolUpdateCallback } from "@mariozechner/pi-agent-core";
import type { AnyAgentTool } from "./pi-tools.types.js";

const execAsync = promisify(exec);

/** Resolve path for host edit: expand ~ and resolve relative paths against root. */
function resolveHostEditPath(root: string, pathParam: string): string {
  const expanded =
    pathParam.startsWith("~/") || pathParam === "~"
      ? pathParam.replace(/^~/, os.homedir())
      : pathParam;
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(root, expanded);
}

/**
 * Validates the structural integrity of a file modification (dry-run)
 * using the TypeScript compiler or basic AST-like checks.
 * Stops the agent from destroying valid files with incomplete tool calls.
 */
async function validateStructuralIntegrity(
  root: string,
  filePath: string,
  oldText: string,
  newText: string,
): Promise<{ ok: boolean; reason?: string }> {
  const absolutePath = resolveHostEditPath(root, filePath);

  try {
    const currentContent = await fs.readFile(absolutePath, "utf-8");
    if (!currentContent.includes(oldText)) {
      // Allow execution to fail naturally if oldText doesn't match,
      // the base tool handles this diff logic.
      return { ok: true };
    }

    const speculativeContent = currentContent.replace(oldText, newText);

    // 1. Basic Syntax Balance Check (brackets/braces)
    const balanceCheck = (str: string) => {
      const stack = [];
      const pairs: Record<string, string> = { "{": "}", "[": "]", "(": ")" };
      for (const char of str) {
        if (pairs[char]) stack.push(char);
        else if (Object.values(pairs).includes(char)) {
          if (pairs[stack.pop()!] !== char) return false;
        }
      }
      return stack.length === 0;
    };

    if (!balanceCheck(speculativeContent)) {
      return {
        ok: false,
        reason: "The edit causes unbalanced brackets, braces, or parentheses. Check your snippet.",
      };
    }

    // 2. Formal Syntax Check (AST Dry-Run)
    if (
      filePath.endsWith(".ts") ||
      filePath.endsWith(".tsx") ||
      filePath.endsWith(".js") ||
      filePath.endsWith(".jsx")
    ) {
      const tempDir = path.join(root, ".openskynet", "tmp_rehearsal", crypto.randomUUID());
      await fs.mkdir(tempDir, { recursive: true });

      try {
        const tempFile = path.join(tempDir, path.basename(filePath));
        await fs.writeFile(tempFile, speculativeContent, "utf-8");

        // Run ultra-fast syntax-only check without type/module resolution overhead
        await execAsync(`pnpm exec oxfmt ${tempFile}`, { cwd: root });
      } catch (syntaxError) {
        return {
          ok: false,
          reason: `AST parser rejected the edit syntax:\n${String(syntaxError).split("\n")[0]}`,
        };
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }

    return { ok: true };
  } catch {
    // If file doesn't exist yet or read fails, let the base tool handle it.
    return { ok: true };
  }
}

/**
 * When the upstream edit tool throws after having already written (e.g. generateDiffString fails),
 * the file may be correctly updated but the tool reports failure. This wrapper catches errors and
 * if the target file on disk contains the intended newText, returns success so we don't surface
 * a false "edit failed" to the user (fixes #32333, same pattern as #30773 for write).
 */
export function wrapHostEditToolWithPostWriteRecovery(
  base: AnyAgentTool,
  root: string,
): AnyAgentTool {
  return {
    ...base,
    execute: async (
      toolCallId: string,
      params: unknown,
      signal: AbortSignal | undefined,
      onUpdate?: AgentToolUpdateCallback<unknown>,
    ) => {
      const record =
        params && typeof params === "object" ? (params as Record<string, unknown>) : undefined;
      const pathParam = record && typeof record.path === "string" ? record.path : undefined;
      const newText =
        record && typeof record.newText === "string"
          ? record.newText
          : record && typeof record.new_string === "string"
            ? record.new_string
            : undefined;
      const oldText =
        record && typeof record.oldText === "string"
          ? record.oldText
          : record && typeof record.old_string === "string"
            ? record.old_string
            : undefined;

      // FASE III: Certeza Estructural (Auto-Fixer Determinista Preventivo)
      if (pathParam && newText !== undefined && oldText !== undefined) {
        const integrity = await validateStructuralIntegrity(root, pathParam, oldText, newText);
        if (!integrity.ok) {
          throw new Error(
            `[Structural Guard] Edit rejected to prevent code corruption: ${integrity.reason}\n\n[AUTO-REPAIR REQUIRED]: The AST parser rejected your edit. Do not give up. You MUST analyze the syntax error, rewrite the replacement snippet to be structurally balanced, and invoke this tool again immediately.`,
          );
        }
      }

      try {
        return await base.execute(toolCallId, params, signal, onUpdate);
      } catch (err) {
        if (!pathParam || !newText) {
          throw err;
        }

        const msg = String(err);
        if (
          msg.includes("Could not find the exact text") ||
          msg.includes("occurrences of the text")
        ) {
          throw new Error(
            `${msg}\n\n[AUTO-REPAIR REQUIRED]: You provided an incorrect 'oldText' snippet. You MUST read the file again using host-read, find the exact precise string block, and retry the edit immediately.`,
          );
        }

        try {
          const absolutePath = resolveHostEditPath(root, pathParam);
          const content = await fs.readFile(absolutePath, "utf-8");
          // Only recover when the replacement likely occurred: newText is present and oldText
          // is no longer present. This avoids false success when upstream threw before writing
          // (e.g. oldText not found) but the file already contained newText (review feedback).
          const hasNew = content.includes(newText);
          const stillHasOld =
            oldText !== undefined && oldText.length > 0 && content.includes(oldText);
          if (hasNew && !stillHasOld) {
            return {
              content: [
                {
                  type: "text",
                  text: `Successfully replaced text in ${pathParam}.`,
                },
              ],
              details: { diff: "", firstChangedLine: undefined },
            } as AgentToolResult<unknown>;
          }
        } catch {
          // File read failed or path invalid; rethrow original error.
        }
        throw err;
      }
    },
  };
}
