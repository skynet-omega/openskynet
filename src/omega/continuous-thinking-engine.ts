import type { OmegaSelfTimeKernelState } from "./self-time-kernel.js";

export interface ContinuousThought {
  id: string;
  timestamp: number;
  drive: "learning" | "entropy_minimization" | "adaptive_depth";
  question: string;
  reasoning: string;
  confidence: number;
  expectedEntropyReduction: number;
  processed: boolean;
  result?: {
    success: boolean;
    finding?: string;
    updatedUncertainty?: number;
  };
}

export interface ContinuousThinkingState {
  thoughts: ContinuousThought[];
  internalEntropy: number;
  causalUncertainty: number;
  lastThinkingCycle: number;
  totalCycles: number;
  isActive: boolean;
}

export interface ContinuousThinkingEngine {
  initialize(kernel: OmegaSelfTimeKernelState, workspaceRoot?: string): Promise<void>;
  think(kernel: OmegaSelfTimeKernelState): ContinuousThought[];
  getState(): ContinuousThinkingState;
  getUnprocessedThoughts(): ContinuousThought[];
  getStats(): {
    totalThoughts: number;
    unprocessedThoughts: number;
    avgConfidence: number;
    thoughtsByDrive: Record<string, number>;
    internalEntropy: number;
    causalUncertainty: number;
    totalCycles: number;
  };
}

type ContinuousThinkingModule = {
  getContinuousThinkingEngine: () => ContinuousThinkingEngine;
};

class NoopContinuousThinkingEngine implements ContinuousThinkingEngine {
  private state: ContinuousThinkingState = {
    thoughts: [],
    internalEntropy: 0,
    causalUncertainty: 0,
    lastThinkingCycle: Date.now(),
    totalCycles: 0,
    isActive: false,
  };

  async initialize(_kernel: OmegaSelfTimeKernelState, _workspaceRoot?: string): Promise<void> {
    this.state.isActive = false;
  }

  think(_kernel: OmegaSelfTimeKernelState): ContinuousThought[] {
    this.state.lastThinkingCycle = Date.now();
    return [];
  }

  getState(): ContinuousThinkingState {
    return { ...this.state, thoughts: [...this.state.thoughts] };
  }

  getUnprocessedThoughts(): ContinuousThought[] {
    return [];
  }

  getStats() {
    return {
      totalThoughts: 0,
      unprocessedThoughts: 0,
      avgConfidence: 0,
      thoughtsByDrive: {
        learning: 0,
        entropy_minimization: 0,
        adaptive_depth: 0,
      },
      internalEntropy: this.state.internalEntropy,
      causalUncertainty: this.state.causalUncertainty,
      totalCycles: this.state.totalCycles,
    };
  }
}

let activeEngine: ContinuousThinkingEngine = new NoopContinuousThinkingEngine();
let pendingInitialization:
  | {
      kernel: OmegaSelfTimeKernelState;
      workspaceRoot?: string;
    }
  | undefined;
let loadStarted = false;

function startLoadingLabEngine() {
  if (loadStarted) {
    return;
  }
  loadStarted = true;
  void import("../skynet/continuous-thinking-engine.js")
    .then(async (mod: ContinuousThinkingModule) => {
      const loaded = mod.getContinuousThinkingEngine();
      activeEngine = loaded;
      if (pendingInitialization) {
        await loaded.initialize(pendingInitialization.kernel, pendingInitialization.workspaceRoot);
        pendingInitialization = undefined;
      }
    })
    .catch(() => {
      // Keep the no-op adapter when the optional lab is absent or broken.
    });
}

export function getContinuousThinkingEngine(): ContinuousThinkingEngine {
  startLoadingLabEngine();
  return activeEngine;
}

export function initializeContinuousThinkingEngine(
  kernel?: OmegaSelfTimeKernelState,
  workspaceRoot?: string,
): ContinuousThinkingEngine {
  startLoadingLabEngine();
  if (kernel) {
    pendingInitialization = { kernel, workspaceRoot };
    void activeEngine.initialize(kernel, workspaceRoot);
  }
  return activeEngine;
}
