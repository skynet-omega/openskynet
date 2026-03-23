/**
 * Exit code used by supervised gateway processes when startup is blocked by an
 * already-active listener. systemd units can treat this as a terminal
 * misconfiguration instead of entering a restart loop.
 */
export const SUPERVISED_PORT_CONFLICT_EXIT_CODE = 75;
