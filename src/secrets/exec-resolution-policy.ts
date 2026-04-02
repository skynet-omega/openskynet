import type { OpenSkynetConfig } from "../config/config.js";
import type { SecretRef } from "../config/types.secrets.js";

export function selectRefsForExecPolicy(params: { refs: SecretRef[]; allowExec: boolean }): {
  refsToResolve: SecretRef[];
  skippedExecRefs: SecretRef[];
} {
  const refsToResolve: SecretRef[] = [];
  const skippedExecRefs: SecretRef[] = [];
  for (const ref of params.refs) {
    if (ref.source === "exec" && !params.allowExec) {
      skippedExecRefs.push(ref);
      continue;
    }
    refsToResolve.push(ref);
  }
  return { refsToResolve, skippedExecRefs };
}

export function getSkippedExecRefStaticError(params: {
  ref: SecretRef;
  config: OpenSkynetConfig;
}): string | null {
  void params.config;
  if (params.ref.source !== "exec") {
    return null;
  }
  return `Exec SecretRef ${params.ref.provider}/${params.ref.id} was skipped because exec-backed secret resolution is disabled for this audit run.`;
}
