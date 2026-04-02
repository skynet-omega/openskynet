import { deriveOpenSkynetLivingMemoryEvents } from "./src/omega/living-memory-events.js";

const sessionKey = "agent:main:main";
const now = Date.now();

const priorState: any = {
  updatedAt: now - 1000,
  identity: { activeGoalTask: "Old Task" },
  internalProjectState: {
    focusKey: "old-focus",
    mode: "idle",
    commitment: null,
  },
};

const nextState: any = {
  updatedAt: now,
  identity: { activeGoalTask: "New Task" },
  internalProjectState: {
    focusKey: "new-focus",
    mode: "active",
    commitment: {
      kind: "artifact",
      artifactKind: "code",
      confidence: 0.9,
      executableTask: "Fix Omega",
    },
  },
};

console.log("--- PROBANDO DERIVACIÓN DE EVENTOS DE MEMORIA ---");
const events = deriveOpenSkynetLivingMemoryEvents({
  sessionKey,
  prior: priorState,
  next: nextState,
});

console.log(JSON.stringify(events, null, 2));
