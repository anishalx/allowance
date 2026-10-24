import { DEMO_USER_ID } from '../db/seed';
import { publicDemo } from '../demo-token';

// Daily AI caps for the public demo, so nobody can drain the OpenAI account. Weights are rough:
// an agent run makes many model calls; a rules compile, an audit or a console message makes one.
// Per process and in memory, like the rate limiter. The owner household is never capped.
export const AI_COST = { agentRun: 10, compile: 1, audit: 1, console: 1 } as const;

const cap = (name: string, fallback: number) => Number(process.env[name]) || fallback;

const g = globalThis as unknown as { __allowanceAiBudget?: { day: string; total: number; byHousehold: Map<string, number> } };

function today() {
  const day = new Date().toISOString().slice(0, 10);
  if (g.__allowanceAiBudget?.day !== day) g.__allowanceAiBudget = { day, total: 0, byHousehold: new Map() };
  return g.__allowanceAiBudget;
}

// Records the spend and returns null, or returns why it's over the limit.
export function spendAi(household: string, kind: keyof typeof AI_COST): string | null {
  if (!publicDemo()) return null;
  const budget = today();
  const cost = AI_COST[kind];
  const used = budget.byHousehold.get(household) ?? 0;
  if (household !== DEMO_USER_ID) {
    if (used + cost > cap('AI_UNITS_PER_VISITOR', 150)) return "Your demo has used today's AI allowance (it resets at midnight UTC). The payment rules still work without it.";
    if (budget.total + cost > cap('AI_UNITS_PER_DAY', 1000)) return "The live demo has used today's AI allowance (it resets at midnight UTC). The payment rules still work without it.";
  }
  budget.byHousehold.set(household, used + cost);
  budget.total += cost;
  return null;
}
