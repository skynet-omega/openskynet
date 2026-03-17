import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export type DriveKind = "homeostasis" | "curiosity" | "entropy_alert" | "idle";

export interface DriveSignal {
  kind: DriveKind;
  urgency: number; // 0.0 to 1.0
  reason: string;
}

export type AutonomousActionResult = 
  | { kind: "none"; reason: string }
  | { kind: "memory_explored"; target: string; findings: string[] }
  | { kind: "sessions_cleaned"; count: number }
  | { kind: "status_check"; status: "healthy" | "degraded"; issues: string[] }
  | { kind: "experiment_proposed"; hypothesis: string; testable: boolean }
  | { kind: "error"; error: string };

export async function runHomeostasisDaemon(workspaceRoot: string): Promise<void> {
  const now = Date.now();
  
  // 1. Load autonomous state
  const state = await loadAutonomousState(workspaceRoot);
  
  // 2. Evaluate "Drives" (Internal tensions)
  const drive = evaluateIntrinsicDrives(state, now);
  
  if (drive.kind === "idle" || drive.urgency < 0.3) {
    return;
  }
  
  // 3. Execute homeostasis/curiosity action
  let action: AutonomousActionResult;
  try {
    action = await executeIntrinsicAction(drive, workspaceRoot);
    
    // Update state post-action
    state.lastActivity = now;
    if (action.kind === "error") {
      state.failureStreak += 1;
    } else if (action.kind !== "none") {
      state.failureStreak = 0;
      if (action.kind === "memory_explored") state.lastMemoryExplored = now;
    }
  } catch (error) {
    action = { kind: "error", error: String(error) };
    state.failureStreak += 1;
  }
  
  // 4. Save state
  await saveAutonomousState(workspaceRoot, state);
  
  // 5. Log to deep journal
  await logAutonomousExecution(workspaceRoot, {
    executedAt: now,
    driveKind: drive.kind,
    urgency: drive.urgency,
    action,
  });
  
  // Note: Unlike the inline version, we do not emit heartbeat events directly here
  // because this process might run entirely disconnected from the main gateway runtime,
  // or it might record into the system event log for the agent to read later.
  // For now, the execution facts are recorded in autonomous-executions.jsonl.
}

async function loadAutonomousState(workspaceRoot: string): Promise<{
  lastRun: number;
  lastActivity: number;
  failureStreak: number;
  goalsCompleted: number;
  lastMemoryExplored: number | null;
}> {
  const stateFile = path.join(workspaceRoot, ".openskynet", "self-state.json");
  try {
    const content = await fs.readFile(stateFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      lastRun: 0,
      lastActivity: Date.now(),
      failureStreak: 0,
      goalsCompleted: 0,
      lastMemoryExplored: null,
    };
  }
}

async function saveAutonomousState(
  workspaceRoot: string,
  state: Awaited<ReturnType<typeof loadAutonomousState>>
): Promise<void> {
  const stateFile = path.join(workspaceRoot, ".openskynet", "self-state.json");
  try {
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
  } catch {
    // Ignore
  }
}

async function logAutonomousExecution(
  workspaceRoot: string,
  execution: {
    executedAt: number;
    driveKind: string;
    urgency: number;
    action: AutonomousActionResult;
  },
): Promise<void> {
  const logFile = path.join(workspaceRoot, ".openskynet", "autonomous-executions.jsonl");
  try {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, JSON.stringify(execution) + "\n");
  } catch {
    // Ignore
  }
}

function evaluateIntrinsicDrives(
  state: Awaited<ReturnType<typeof loadAutonomousState>>,
  now: number,
): DriveSignal {
  const silenceMs = now - state.lastActivity;
  
  // Drive 1: Homeostasis (if things are failing repeatedly)
  if (state.failureStreak >= 3) {
    return {
      kind: "homeostasis",
      urgency: 0.8,
      reason: `${state.failureStreak} consecutive failures`,
    };
  }
  
  // Drive 2: Curiosity (trigger after ~8 minutes of silence)
  if (silenceMs > 8 * 60 * 1000) {
    return {
      kind: "curiosity",
      urgency: 0.4,
      reason: `${Math.floor(silenceMs / 60000)} minutes of inactivity`,
    };
  }
  
  // Drive 3: Entropy Alert (trigger if VERY silent, ~60 min)
  if (silenceMs > 60 * 60 * 1000) {
    return {
      kind: "entropy_alert",
      urgency: 0.6,
      reason: "Prolonged silence detected",
    };
  }
  
  return { kind: "idle", urgency: 0, reason: "System stable" };
}

async function executeIntrinsicAction(
  drive: DriveSignal,
  workspaceRoot: string,
): Promise<AutonomousActionResult> {
  switch (drive.kind) {
    case "homeostasis":
      return await executeHomeostasisAction(workspaceRoot);
    case "curiosity":
      return await executeCuriosityAction(workspaceRoot);
    case "entropy_alert":
      return await executeEntropyAction(workspaceRoot);
    default:
      return { kind: "none", reason: "unknown_drive" };
  }
}

async function executeHomeostasisAction(workspaceRoot: string): Promise<AutonomousActionResult> {
  const issues: string[] = [];
  try {
    const { stdout } = await execAsync(
      "openclaw sessions list 2>&1 | wc -l || openskynet sessions list 2>&1 | wc -l || echo 0",
      { cwd: workspaceRoot, timeout: 10000 },
    );
    const sessionCount = parseInt(stdout.trim(), 10) || 0;
    
    if (sessionCount > 50) {
      issues.push(`Too many sessions: ${sessionCount}`);
      try {
        await execAsync(
          "openclaw sessions cleanup 2>&1 || openskynet sessions cleanup 2>&1 || true",
          { cwd: workspaceRoot, timeout: 30000 },
        );
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    // Ignore
  }
  
  return {
    kind: "status_check",
    status: issues.length === 0 ? "healthy" : "degraded",
    issues,
  };
}

async function executeCuriosityAction(workspaceRoot: string): Promise<AutonomousActionResult> {
  const findings: string[] = [];
  const memoryPath = path.join(workspaceRoot, "MEMORY.md");
  
  try {
    const content = await fs.readFile(memoryPath, "utf-8");
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.match(/^[-*]\s+.*\w+.*$/)) {
        findings.push(line.trim().slice(2));
      }
      if (findings.length >= 5) break;
    }
  } catch {
    // Ignore
  }
  return { kind: "memory_explored", target: "MEMORY.md", findings };
}

async function executeEntropyAction(workspaceRoot: string): Promise<AutonomousActionResult> {
  try {
    const memoryPath = path.join(workspaceRoot, "MEMORY.md");
    const content = await fs.readFile(memoryPath, "utf-8");
    const match = content.match(/##\s*Current Strategic Direction[\s\S]*?(?=##|$)/i);
    if (match) {
      const lines = match[0].split("\n").filter(l => l.trim().startsWith("- ") || l.trim().startsWith("* "));
      if (lines.length > 0) {
        const item = lines[0].replace(/^[-*]\s+/, "").trim();
        return { kind: "experiment_proposed", hypothesis: item, testable: true };
      }
    }
  } catch {
    // Ignore
  }
  return { kind: "experiment_proposed", hypothesis: "Continue autonomy improvements", testable: true };
}
