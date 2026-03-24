import { resolveCliDisplayName, resolveCliName } from "../cli/cli-name.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { PairingChannel } from "./pairing-store.js";

export function buildPairingReply(params: {
  channel: PairingChannel;
  idLine: string;
  code: string;
}): string {
  const { channel, idLine, code } = params;
  const displayName = resolveCliDisplayName();
  const cliName = resolveCliName();
  return [
    `${displayName}: access not configured.`,
    "",
    idLine,
    "",
    `Pairing code: ${code}`,
    "",
    "Ask the bot owner to approve with:",
    formatCliCommand(`${cliName} pairing approve ${channel} ${code}`),
  ].join("\n");
}
