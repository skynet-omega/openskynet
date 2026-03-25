import { recordOmegaAgendaContractOutcome } from "./src/omega/problem-agenda.js";

await recordOmegaAgendaContractOutcome({
  workspaceRoot: process.cwd(),
  sessionKey: "agent:openskynet:main",
  classKey: "failure:low_value_result",
  outcome: { fulfilled: true, reason: "mitigated_in_code", utilityDelta: 0.5 },
});
console.log("Done");
