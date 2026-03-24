const fs = require("fs");

let content = fs.readFileSync("src/auto-reply/reply/get-reply.ts", "utf-8");

const imports = `
import { getNeuralLogicEngine } from "../../omega/neural-logic-engine.js";
import { HolographicMemoryManager } from "../../omega/holographic-memory.js";
`;

content = content.replace(
  'import { runPreparedReply } from "./get-reply-run.js";',
  'import { runPreparedReply } from "./get-reply-run.js";' + imports,
);

const logic = `
  const finalized = finalizeInboundContext(ctx);

  // --- OMEGA NEURAL LOGIC INJECTION ---
  if (!isFastTestEnv) {
    try {
      const nle = getNeuralLogicEngine();
      const hmem = new HolographicMemoryManager(workspaceDir);
      await hmem.initialize();
      
      const bodyText = finalized.Body ?? "";
      if (bodyText.trim().length > 0) {
        // Record into holographic memory
        const fossilId = await hmem.fossilize(bodyText, { 
          source: "user_input", 
          sessionKey: agentSessionKey 
        });
        
        // Basic feature extraction for latent state (dummy features for now, to be replaced by true embedding)
        const latentState = [
          Math.min(1, bodyText.length / 500),
          bodyText.includes("?") ? 0.8 : 0.2,
          bodyText.match(/error|fail|bug|wrong|bad/i) ? 0.9 : 0.1,
        ];
        
        const nleState = nle.infer(latentState);
        
        // Inject NLE context into the system prompt implicitly
        if (nleState.activeRules.length > 0) {
          const nleContext = \`[Omega NLE Active: \${nleState.activeRules.join(",")} | Confidence: \${nleState.inferenceConfidence.toFixed(2)} | Delta: \${nleState.logicalDelta[0].toFixed(2)}]\`;
          finalized.UntrustedContext = finalized.UntrustedContext ? finalized.UntrustedContext + "\\n" + nleContext : nleContext;
        }
      }
    } catch (e) {
      console.warn("[Omega] Failed to run Neural Logic Engine on inbound message:", e);
    }
  }
  // ------------------------------------
`;

content = content.replace("  const finalized = finalizeInboundContext(ctx);", logic);

fs.writeFileSync("src/auto-reply/reply/get-reply.ts", content, "utf-8");
console.log("Patched get-reply.ts");
