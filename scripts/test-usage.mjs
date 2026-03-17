import { computeNextProfileUsageStats } from ./src/agents/auth-profiles/usage.js;
const existing = { failureCounts: {}, usedCount: 0 };
const stats = computeNextProfileUsageStats({ existing, reason: rate_limit, now: Date.now() });
console.log(stats);
