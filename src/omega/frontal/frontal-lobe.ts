import fs from "node:fs/promises";
import path from "node:path";
import { resolveOmegaLegacyStateFile, resolveOmegaStateFile } from "../paths.js";

export interface FrontalLobeState {
  macroIntent: string;
  currentFocus: string;
  lastDiscovery: string;
  cognitiveResidue: string;
  updatedAt: number;
}

export class FrontalLobeManager {
  private stateFilePath: string;
  private legacyStateFilePath: string;
  private state: FrontalLobeState;

  constructor(workspacePath: string) {
    this.stateFilePath = resolveOmegaStateFile(workspacePath, "frontal-lobe.json");
    this.legacyStateFilePath = resolveOmegaLegacyStateFile(workspacePath, "frontal-lobe.json");
    this.state = this.getDefaultState();
  }

  private getDefaultState(): FrontalLobeState {
    return {
      macroIntent: "Awaiting autonomous directive or user input.",
      currentFocus: "System initialization and self-diagnostic.",
      lastDiscovery: "None.",
      cognitiveResidue: "I need to establish my continuous train of thought.",
      updatedAt: Date.now(),
    };
  }

  async load(): Promise<FrontalLobeState> {
    try {
      const data = await fs.readFile(this.stateFilePath, "utf-8");
      this.state = JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[FrontalLobe] Failed to load state:", error);
      }
      try {
        const legacyData = await fs.readFile(this.legacyStateFilePath, "utf-8");
        this.state = JSON.parse(legacyData);
        await this.save(this.state);
      } catch (legacyError) {
        if ((legacyError as NodeJS.ErrnoException).code === "ENOENT") {
          await this.save(this.getDefaultState());
        } else {
          console.warn("[FrontalLobe] Failed to load legacy state:", legacyError);
        }
      }
    }
    return this.state;
  }

  async save(newState: Partial<FrontalLobeState>): Promise<void> {
    this.state = {
      ...this.state,
      ...newState,
      updatedAt: Date.now(),
    };
    try {
      await fs.mkdir(path.dirname(this.stateFilePath), { recursive: true });
      await fs.writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), "utf-8");
    } catch (error) {
      console.error(`[FrontalLobe] Failed to save state to ${this.stateFilePath}:`, error);
    }
  }

  getState(): FrontalLobeState {
    return { ...this.state };
  }
}
