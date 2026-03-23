import type {
  OmegaExecutiveDecision,
  OmegaExecutiveObserverSnapshot,
} from "./executive-arbitration.js";
import type { OmegaBudgetUsage, OmegaUtilityBreakdown } from "./executive-utility.js";

export type OmegaExecutiveQueueKind = "goal" | "maintenance" | "anomaly" | "none";

export type OmegaExecutiveDeferReason =
  | "no_action"
  | "maintenance_only"
  | "budget_backoff"
  | "low_expected_utility"
  | "repeat_low_yield";

export type OmegaExecutiveDispatchPlan = {
  shouldDispatchLlmTurn: boolean;
  selectedAction: OmegaExecutiveDecision["selectedAction"];
  queueKind: OmegaExecutiveQueueKind;
  selectedWorkItemId?: string;
  dispatchedWorkItemId?: string;
  expectedUtility: number;
  utilityBreakdown: OmegaUtilityBreakdown;
  budgetUsage: OmegaBudgetUsage;
  estimatedDispatchCostMs: number;
  queueDepths: {
    goals: number;
    anomalies: number;
    maintenance: number;
  };
  scheduledItems: OmegaExecutiveScheduledItem[];
  nextWakeDelayMs: number;
  deferReason?: OmegaExecutiveDeferReason;
  rationale: string[];
};

export type OmegaExecutiveScheduledItem = {
  id: string;
  queueKind: "goal" | "maintenance" | "anomaly";
  action: OmegaExecutiveDecision["selectedAction"];
  priority: number;
  detail: string;
};

export type OmegaExecutiveDispatchAccounting = {
  totalCycles: number;
  llmDispatches: number;
  deferredCycles: number;
  queueDispatchCounts: {
    goal: number;
    maintenance: number;
    anomaly: number;
  };
  recentSelectedWorkItemIds: string[];
  recentDispatchedWorkItemIds: string[];
  workItemLedger: OmegaExecutiveWorkItemLedgerEntry[];
};

export type OmegaExecutiveWorkItemState =
  | "queued"
  | "selected"
  | "dispatched"
  | "deferred"
  | "completed"
  | "aborted";

export type OmegaExecutiveWorkItemLedgerEntry = {
  itemId: string;
  queueKind: OmegaExecutiveScheduledItem["queueKind"];
  state: OmegaExecutiveWorkItemState;
  selectedCount: number;
  dispatchCount: number;
  deferCount: number;
  llmCalls: number;
  observedWallTimeMs: number;
  cumulativeExpectedUtility: number;
  cumulativeRealizedUtility: number;
  averageBudgetPressure: number;
  firstSeenAtCycle: number;
  lastSelectedAtCycle: number;
  lastDispatchedAtCycle?: number;
  lastDeferredAtCycle?: number;
  lastCompletedAtCycle?: number;
};

const OMEGA_EXECUTIVE_RECOVERY_WAKE_DELAY_MS = 1_000;
const OMEGA_EXECUTIVE_ACTIVE_WAKE_DELAY_MS = 5_000;
const OMEGA_EXECUTIVE_BACKOFF_WAKE_DELAY_MS = 30_000;
const OMEGA_EXECUTIVE_IDLE_WAKE_DELAY_MS = 60_000;
const OMEGA_EXECUTIVE_HISTORY_LIMIT = 8;

function buildQueueDepths(observer: OmegaExecutiveObserverSnapshot) {
  return {
    goals: observer.queue.length,
    anomalies: observer.anomalies.length,
    maintenance: observer.maintenanceQueue.length,
  };
}

function buildScheduledItems(
  observer: OmegaExecutiveObserverSnapshot,
): OmegaExecutiveScheduledItem[] {
  const anomalyItems: OmegaExecutiveScheduledItem[] = observer.anomalies.map((anomaly) => ({
    id: `anomaly:${anomaly.kind}`,
    queueKind: "anomaly",
    action: anomaly.kind === "memory_revalidation" ? "maintain" : "recover",
    priority: anomaly.severity,
    detail: anomaly.detail,
  }));
  const goalItems: OmegaExecutiveScheduledItem[] = observer.queue.map((goal) => ({
    id: `goal:${goal.goalId}`,
    queueKind: "goal",
    action: observer.decision.selectedAction === "recover" ? "recover" : "direct_execute",
    priority: goal.priority + goal.expectedUtility * 0.2 - goal.estimatedCost * 0.1,
    detail: goal.task,
  }));
  const maintenanceItems: OmegaExecutiveScheduledItem[] = observer.maintenanceQueue.map((goal) => ({
    id: `maintenance:${goal.goalId}`,
    queueKind: "maintenance",
    action: "maintain",
    priority: goal.priority + goal.expectedUtility * 0.15,
    detail: goal.task,
  }));

  return [...anomalyItems, ...goalItems, ...maintenanceItems].sort(
    (left, right) => right.priority - left.priority,
  );
}

function createDefaultDispatchAccounting(): OmegaExecutiveDispatchAccounting {
  return {
    totalCycles: 0,
    llmDispatches: 0,
    deferredCycles: 0,
    queueDispatchCounts: {
      goal: 0,
      maintenance: 0,
      anomaly: 0,
    },
    recentSelectedWorkItemIds: [],
    recentDispatchedWorkItemIds: [],
    workItemLedger: [],
  };
}

function shouldPromoteMaintenanceWork(params: {
  observer: OmegaExecutiveObserverSnapshot;
  previousAccounting: OmegaExecutiveDispatchAccounting;
}): boolean {
  if (params.observer.maintenanceQueue.length === 0) {
    return false;
  }
  const recentlyIgnoredMaintenance = recentSelectedIds(params.previousAccounting).filter((itemId) =>
    itemId.startsWith("maintenance:"),
  ).length;
  return params.observer.decision.selectedAction === "idle" && recentlyIgnoredMaintenance === 0;
}

function isDispatchableMaintenanceItem(itemId: string | undefined): boolean {
  if (!itemId) {
    return false;
  }
  return itemId.startsWith("maintenance:agenda:failure:");
}

function recentSelectedIds(previousAccounting: OmegaExecutiveDispatchAccounting): string[] {
  return previousAccounting.recentSelectedWorkItemIds;
}

function findRepeatedLowYieldGoalId(params: {
  selectedWorkItemId?: string;
  previousAccounting: OmegaExecutiveDispatchAccounting;
}): string | undefined {
  const candidateGoalIds = new Set<string>();
  if (params.selectedWorkItemId?.startsWith("goal:")) {
    candidateGoalIds.add(params.selectedWorkItemId);
  }
  for (const itemId of recentSelectedIds(params.previousAccounting)) {
    if (itemId.startsWith("goal:")) {
      candidateGoalIds.add(itemId);
    }
  }
  for (const goalId of candidateGoalIds) {
    const ledger = params.previousAccounting.workItemLedger.find(
      (entry) => entry.itemId === goalId,
    );
    if (!ledger || ledger.dispatchCount < 2) {
      continue;
    }
    const realizedUtilityPerDispatch =
      ledger.dispatchCount > 0 ? ledger.cumulativeRealizedUtility / ledger.dispatchCount : 0;
    const expectedUtilityPerDispatch =
      ledger.dispatchCount > 0 ? ledger.cumulativeExpectedUtility / ledger.dispatchCount : 0;
    const recentlyRepeated =
      recentSelectedIds(params.previousAccounting)
        .slice(0, 4)
        .filter((itemId) => itemId === goalId).length >= 2;
    if (
      recentlyRepeated &&
      realizedUtilityPerDispatch < 0.35 &&
      expectedUtilityPerDispatch >= realizedUtilityPerDispatch
    ) {
      return goalId;
    }
  }
  return undefined;
}

function shouldBackoffRepeatedLowYieldGoal(params: {
  selectedWorkItemId?: string;
  previousAccounting: OmegaExecutiveDispatchAccounting;
}): boolean {
  const goalId = findRepeatedLowYieldGoalId(params);
  if (!goalId) {
    return false;
  }
  const ledger = params.previousAccounting.workItemLedger.find((entry) => entry.itemId === goalId);
  if (!ledger || ledger.dispatchCount < 2) {
    return false;
  }
  const realizedUtilityPerDispatch =
    ledger.dispatchCount > 0 ? ledger.cumulativeRealizedUtility / ledger.dispatchCount : 0;
  const expectedUtilityPerDispatch =
    ledger.dispatchCount > 0 ? ledger.cumulativeExpectedUtility / ledger.dispatchCount : 0;
  const recentlyRepeated =
    recentSelectedIds(params.previousAccounting)
      .slice(0, 4)
      .filter((itemId) => itemId === params.selectedWorkItemId).length >= 2;
  return (
    recentlyRepeated &&
    realizedUtilityPerDispatch < 0.35 &&
    expectedUtilityPerDispatch >= realizedUtilityPerDispatch
  );
}

function selectScheduledItem(params: {
  observer: OmegaExecutiveObserverSnapshot;
  scheduledItems: OmegaExecutiveScheduledItem[];
  selectedAction: OmegaExecutiveDecision["selectedAction"];
}): OmegaExecutiveScheduledItem | undefined {
  if (params.selectedAction === "recover") {
    return (
      params.scheduledItems.find(
        (item) => item.queueKind === "anomaly" && item.action === "recover",
      ) ??
      params.scheduledItems.find(
        (item) => item.queueKind === "goal" && item.action === "recover",
      ) ??
      params.scheduledItems[0]
    );
  }
  if (params.selectedAction === "direct_execute") {
    return (
      params.scheduledItems.find((item) => item.queueKind === "goal") ?? params.scheduledItems[0]
    );
  }
  if (params.selectedAction === "maintain") {
    return (
      params.scheduledItems.find((item) => item.queueKind === "maintenance") ??
      params.scheduledItems.find(
        (item) => item.queueKind === "anomaly" && item.action === "maintain",
      ) ??
      params.scheduledItems[0]
    );
  }
  return params.scheduledItems[0];
}

function selectRecoveryEscalationItem(params: {
  scheduledItems: OmegaExecutiveScheduledItem[];
}): OmegaExecutiveScheduledItem | undefined {
  return (
    params.scheduledItems.find((item) => item.id === "anomaly:stalled_progress") ??
    params.scheduledItems.find((item) => item.queueKind === "anomaly" && item.action === "recover")
  );
}

function toPlanQueueKind(
  queueKind: OmegaExecutiveScheduledItem["queueKind"] | undefined,
): OmegaExecutiveQueueKind {
  if (queueKind === "goal") {
    return "goal";
  }
  if (queueKind === "maintenance") {
    return "maintenance";
  }
  if (queueKind === "anomaly") {
    return "anomaly";
  }
  return "none";
}

function reconcileWorkItemLedger(params: {
  ledgerMap: Map<string, OmegaExecutiveWorkItemLedgerEntry>;
  scheduledItems: OmegaExecutiveScheduledItem[];
  nextCycle: number;
}) {
  const activeIds = new Set(params.scheduledItems.map((item) => item.id));
  for (const ledger of params.ledgerMap.values()) {
    if (activeIds.has(ledger.itemId)) {
      continue;
    }
    if (
      ledger.state === "dispatched" ||
      ledger.state === "deferred" ||
      ledger.state === "selected"
    ) {
      ledger.state = "completed";
      ledger.lastCompletedAtCycle = params.nextCycle;
    }
  }
}

export function deriveNextOmegaExecutiveDispatchAccounting(params: {
  previousAccounting?: OmegaExecutiveDispatchAccounting;
  plan: OmegaExecutiveDispatchPlan;
}): OmegaExecutiveDispatchAccounting {
  const previous = params.previousAccounting ?? createDefaultDispatchAccounting();
  const nextCycle = previous.totalCycles + 1;
  const selectedItem = params.plan.scheduledItems.find(
    (item) => item.id === params.plan.selectedWorkItemId,
  );
  const dispatchedItem = params.plan.scheduledItems.find(
    (item) => item.id === params.plan.dispatchedWorkItemId,
  );
  const selectedQueue = dispatchedItem?.queueKind;
  const ledgerMap = new Map(previous.workItemLedger.map((entry) => [entry.itemId, { ...entry }]));

  for (const item of params.plan.scheduledItems) {
    if (!ledgerMap.has(item.id)) {
      ledgerMap.set(item.id, {
        itemId: item.id,
        queueKind: item.queueKind,
        state: "queued",
        selectedCount: 0,
        dispatchCount: 0,
        deferCount: 0,
        llmCalls: 0,
        observedWallTimeMs: 0,
        cumulativeExpectedUtility: 0,
        cumulativeRealizedUtility: 0,
        averageBudgetPressure: 0,
        firstSeenAtCycle: nextCycle,
        lastSelectedAtCycle: 0,
      });
    }
  }
  reconcileWorkItemLedger({
    ledgerMap,
    scheduledItems: params.plan.scheduledItems,
    nextCycle,
  });
  if (selectedItem) {
    const ledger = ledgerMap.get(selectedItem.id);
    if (ledger) {
      ledger.state = params.plan.shouldDispatchLlmTurn ? "dispatched" : "deferred";
      ledger.selectedCount += 1;
      ledger.lastSelectedAtCycle = nextCycle;
      ledger.cumulativeExpectedUtility += params.plan.expectedUtility;
      const priorSelections = Math.max(ledger.selectedCount - 1, 0);
      ledger.averageBudgetPressure =
        (ledger.averageBudgetPressure * priorSelections + params.plan.budgetUsage.budgetPressure) /
        Math.max(ledger.selectedCount, 1);
      if (params.plan.shouldDispatchLlmTurn) {
        ledger.dispatchCount += 1;
        ledger.llmCalls += 1;
        ledger.observedWallTimeMs += params.plan.estimatedDispatchCostMs;
        ledger.cumulativeRealizedUtility += Math.max(
          0,
          params.plan.expectedUtility - params.plan.budgetUsage.budgetPressure * 0.15,
        );
        ledger.lastDispatchedAtCycle = nextCycle;
      } else {
        ledger.deferCount += 1;
        ledger.lastDeferredAtCycle = nextCycle;
      }
    }
  }

  return {
    totalCycles: nextCycle,
    llmDispatches: previous.llmDispatches + (params.plan.shouldDispatchLlmTurn ? 1 : 0),
    deferredCycles: previous.deferredCycles + (params.plan.shouldDispatchLlmTurn ? 0 : 1),
    queueDispatchCounts: {
      goal:
        previous.queueDispatchCounts.goal +
        (selectedQueue === "goal" && params.plan.shouldDispatchLlmTurn ? 1 : 0),
      maintenance:
        previous.queueDispatchCounts.maintenance +
        (selectedQueue === "maintenance" && params.plan.shouldDispatchLlmTurn ? 1 : 0),
      anomaly:
        previous.queueDispatchCounts.anomaly +
        (selectedQueue === "anomaly" && params.plan.shouldDispatchLlmTurn ? 1 : 0),
    },
    recentSelectedWorkItemIds: [
      ...(params.plan.selectedWorkItemId ? [params.plan.selectedWorkItemId] : []),
      ...previous.recentSelectedWorkItemIds,
    ].slice(0, OMEGA_EXECUTIVE_HISTORY_LIMIT),
    recentDispatchedWorkItemIds: [
      ...(params.plan.dispatchedWorkItemId ? [params.plan.dispatchedWorkItemId] : []),
      ...previous.recentDispatchedWorkItemIds,
    ].slice(0, OMEGA_EXECUTIVE_HISTORY_LIMIT),
    workItemLedger: Array.from(ledgerMap.values()).slice(-OMEGA_EXECUTIVE_HISTORY_LIMIT),
  };
}

export function deriveOmegaExecutiveDispatchPlan(params: {
  observer: OmegaExecutiveObserverSnapshot;
  previousAccounting?: OmegaExecutiveDispatchAccounting;
}): OmegaExecutiveDispatchPlan {
  const { observer } = params;
  const previousAccounting = params.previousAccounting ?? createDefaultDispatchAccounting();
  const rationale = [...observer.decision.rationale];
  const budgetPressure = observer.decision.budgetUsage.budgetPressure;
  const queueDepths = buildQueueDepths(observer);
  const scheduledItems = buildScheduledItems(observer);
  const selectedScheduledItem = selectScheduledItem({
    observer,
    scheduledItems,
    selectedAction: observer.decision.selectedAction,
  });
  const selectedWorkItemId = selectedScheduledItem?.id;
  const expectedUtility = observer.decision.expectedUtility;
  const utilityBreakdown = observer.decision.utilityBreakdown;
  const budgetUsage = observer.decision.budgetUsage;
  const estimatedDispatchCostMs =
    observer.decision.budgetUsage.observedTurns > 0
      ? Math.round(
          observer.decision.budgetUsage.observedWallTimeMs /
            observer.decision.budgetUsage.observedTurns,
        )
      : 0;

  if (observer.decision.selectedAction === "recover") {
    return {
      shouldDispatchLlmTurn: true,
      selectedAction: "recover",
      queueKind: toPlanQueueKind(selectedScheduledItem?.queueKind),
      selectedWorkItemId,
      dispatchedWorkItemId: selectedWorkItemId,
      expectedUtility,
      utilityBreakdown,
      budgetUsage,
      estimatedDispatchCostMs,
      queueDepths,
      scheduledItems,
      nextWakeDelayMs: OMEGA_EXECUTIVE_RECOVERY_WAKE_DELAY_MS,
      rationale,
    };
  }

  const repeatedLowYieldGoalId = findRepeatedLowYieldGoalId({
    selectedWorkItemId,
    previousAccounting,
  });
  if (repeatedLowYieldGoalId) {
    const recoveryEscalationItem = selectRecoveryEscalationItem({ scheduledItems });
    if (recoveryEscalationItem) {
      rationale.push("Escalating repeated low-yield work into recovery-oriented handling.");
      return {
        shouldDispatchLlmTurn: true,
        selectedAction: "recover",
        queueKind: toPlanQueueKind(recoveryEscalationItem.queueKind),
        selectedWorkItemId: recoveryEscalationItem.id,
        dispatchedWorkItemId: recoveryEscalationItem.id,
        expectedUtility,
        utilityBreakdown,
        budgetUsage,
        estimatedDispatchCostMs,
        queueDepths,
        scheduledItems,
        nextWakeDelayMs: OMEGA_EXECUTIVE_RECOVERY_WAKE_DELAY_MS,
        rationale,
      };
    }
    if (observer.maintenanceQueue.length > 0) {
      rationale.push(
        "Direct execution deferred because this goal was recently retried with low realized utility.",
      );
      return {
        shouldDispatchLlmTurn: false,
        selectedAction: "maintain",
        queueKind: "maintenance",
        selectedWorkItemId: `maintenance:${observer.maintenanceQueue[0]?.goalId}`,
        expectedUtility,
        utilityBreakdown,
        budgetUsage,
        estimatedDispatchCostMs,
        queueDepths,
        scheduledItems,
        nextWakeDelayMs: OMEGA_EXECUTIVE_BACKOFF_WAKE_DELAY_MS,
        deferReason: "repeat_low_yield",
        rationale,
      };
    }
  }

  if (shouldPromoteMaintenanceWork({ observer, previousAccounting })) {
    rationale.push("Maintenance queue promoted to avoid starvation during idle cycles.");
    const maintenanceItem = observer.maintenanceQueue[0]
      ? `maintenance:${observer.maintenanceQueue[0].goalId}`
      : undefined;
    return {
      shouldDispatchLlmTurn: false,
      selectedAction: "maintain",
      queueKind: "maintenance",
      selectedWorkItemId: maintenanceItem,
      expectedUtility,
      utilityBreakdown,
      budgetUsage,
      estimatedDispatchCostMs,
      queueDepths,
      scheduledItems,
      nextWakeDelayMs: OMEGA_EXECUTIVE_ACTIVE_WAKE_DELAY_MS,
      deferReason: "maintenance_only",
      rationale,
    };
  }

  if (observer.decision.selectedAction === "direct_execute") {
    if (shouldBackoffRepeatedLowYieldGoal({ selectedWorkItemId, previousAccounting })) {
      const recoveryEscalationItem = selectRecoveryEscalationItem({ scheduledItems });
      rationale.push(
        "Direct execution deferred because this goal was recently retried with low realized utility.",
      );
      if (recoveryEscalationItem) {
        rationale.push("Escalating repeated low-yield work into recovery-oriented handling.");
        return {
          shouldDispatchLlmTurn: true,
          selectedAction: "recover",
          queueKind: toPlanQueueKind(recoveryEscalationItem.queueKind),
          selectedWorkItemId: recoveryEscalationItem.id,
          dispatchedWorkItemId: recoveryEscalationItem.id,
          expectedUtility,
          utilityBreakdown,
          budgetUsage,
          estimatedDispatchCostMs,
          queueDepths,
          scheduledItems,
          nextWakeDelayMs: OMEGA_EXECUTIVE_RECOVERY_WAKE_DELAY_MS,
          rationale,
        };
      }
      return {
        shouldDispatchLlmTurn: false,
        selectedAction: observer.maintenanceQueue.length > 0 ? "maintain" : "direct_execute",
        queueKind:
          observer.maintenanceQueue.length > 0
            ? "maintenance"
            : toPlanQueueKind(selectedScheduledItem?.queueKind),
        selectedWorkItemId:
          observer.maintenanceQueue.length > 0
            ? `maintenance:${observer.maintenanceQueue[0]?.goalId}`
            : selectedWorkItemId,
        expectedUtility,
        utilityBreakdown,
        budgetUsage,
        estimatedDispatchCostMs,
        queueDepths,
        scheduledItems,
        nextWakeDelayMs: OMEGA_EXECUTIVE_BACKOFF_WAKE_DELAY_MS,
        deferReason: "repeat_low_yield",
        rationale,
      };
    }
    if (budgetPressure >= 0.95) {
      rationale.push("Dispatch deferred because recent runtime budget pressure is too high.");
      return {
        shouldDispatchLlmTurn: false,
        selectedAction: observer.decision.selectedAction,
        queueKind: toPlanQueueKind(selectedScheduledItem?.queueKind),
        selectedWorkItemId,
        expectedUtility,
        utilityBreakdown,
        budgetUsage,
        estimatedDispatchCostMs,
        queueDepths,
        scheduledItems,
        nextWakeDelayMs: OMEGA_EXECUTIVE_BACKOFF_WAKE_DELAY_MS,
        deferReason: "budget_backoff",
        rationale,
      };
    }
    if (observer.decision.expectedUtility < 0.4) {
      rationale.push("Dispatch deferred because expected utility is too low.");
      return {
        shouldDispatchLlmTurn: false,
        selectedAction: "direct_execute",
        queueKind: toPlanQueueKind(selectedScheduledItem?.queueKind),
        selectedWorkItemId,
        expectedUtility,
        utilityBreakdown,
        budgetUsage,
        estimatedDispatchCostMs,
        queueDepths,
        scheduledItems,
        nextWakeDelayMs: OMEGA_EXECUTIVE_BACKOFF_WAKE_DELAY_MS,
        deferReason: "low_expected_utility",
        rationale,
      };
    }
    return {
      shouldDispatchLlmTurn: true,
      selectedAction: "direct_execute",
      queueKind: toPlanQueueKind(selectedScheduledItem?.queueKind),
      selectedWorkItemId,
      dispatchedWorkItemId: selectedWorkItemId,
      expectedUtility,
      utilityBreakdown,
      budgetUsage,
      estimatedDispatchCostMs,
      queueDepths,
      scheduledItems,
      nextWakeDelayMs: OMEGA_EXECUTIVE_ACTIVE_WAKE_DELAY_MS,
      rationale,
    };
  }

  if (observer.decision.selectedAction === "maintain") {
    if (isDispatchableMaintenanceItem(selectedWorkItemId)) {
      rationale.push(
        "Dispatching a maintenance probe because repeated failures justify an autonomous experiment.",
      );
      return {
        shouldDispatchLlmTurn: true,
        selectedAction: "maintain",
        queueKind: toPlanQueueKind(selectedScheduledItem?.queueKind),
        selectedWorkItemId,
        dispatchedWorkItemId: selectedWorkItemId,
        expectedUtility,
        utilityBreakdown,
        budgetUsage,
        estimatedDispatchCostMs,
        queueDepths,
        scheduledItems,
        nextWakeDelayMs: OMEGA_EXECUTIVE_ACTIVE_WAKE_DELAY_MS,
        rationale,
      };
    }
    rationale.push("Maintenance work stays scheduled but does not justify an LLM turn yet.");
    return {
      shouldDispatchLlmTurn: false,
      selectedAction: "maintain",
      queueKind: toPlanQueueKind(selectedScheduledItem?.queueKind),
      selectedWorkItemId,
      expectedUtility,
      utilityBreakdown,
      budgetUsage,
      estimatedDispatchCostMs,
      queueDepths,
      scheduledItems,
      nextWakeDelayMs: OMEGA_EXECUTIVE_IDLE_WAKE_DELAY_MS,
      deferReason: "maintenance_only",
      rationale,
    };
  }

  rationale.push("No executive action passed the dispatch threshold.");
  return {
    shouldDispatchLlmTurn: false,
    selectedAction: "idle",
    queueKind: "none",
    selectedWorkItemId,
    expectedUtility,
    utilityBreakdown,
    budgetUsage,
    estimatedDispatchCostMs,
    queueDepths,
    scheduledItems,
    nextWakeDelayMs: OMEGA_EXECUTIVE_IDLE_WAKE_DELAY_MS,
    deferReason: "no_action",
    rationale,
  };
}
