const RESUME_HEADER_LINES = [
  "Resume the user request that was interrupted by a gateway restart.",
  "Use the existing session context, continue from where you left off, and do not restart the task from scratch.",
  "Do not repeat any already-sent assistant text unless needed to finish coherently.",
] as const;

const INTERRUPTED_USER_REQUEST_MARKER = "Interrupted user request:";

function stripSingleResumeEnvelope(message: string): string | undefined {
  const trimmed = message.trim();
  const header = RESUME_HEADER_LINES.join("\n");
  if (!trimmed.startsWith(header)) {
    return undefined;
  }
  const remainder = trimmed.slice(header.length).trimStart();
  if (!remainder.startsWith(INTERRUPTED_USER_REQUEST_MARKER)) {
    return undefined;
  }
  const original = remainder.slice(INTERRUPTED_USER_REQUEST_MARKER.length).trimStart();
  return original || undefined;
}

export function normalizeInterruptedTurnMessage(message: string): string {
  let current = message.trim();
  while (true) {
    const stripped = stripSingleResumeEnvelope(current);
    if (!stripped || stripped === current) {
      return current;
    }
    current = stripped;
  }
}

export function buildInterruptedResumeMessage(message: string): string {
  const original = normalizeInterruptedTurnMessage(message);
  return [...RESUME_HEADER_LINES, "", INTERRUPTED_USER_REQUEST_MARKER, original].join("\n");
}
