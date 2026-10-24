import { and, desc, eq } from 'drizzle-orm';
import { db, dbReady } from './db';
import { agents, events, merchants, operations, paymentRequests, users, wallets } from './db/schema';
import { getOperation, opsSummary } from './ops/service';
import { DEMO_USER_ID } from './db/seed';
import { allowanceSummary, getRequest } from './payments/service';

export const currentUserId = () => DEMO_USER_ID; // single demo household; real accounts are out of scope

export async function getDashboardState() {
  await dbReady();
  const userId = currentUserId();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [wallet] = await db.select().from(wallets).where(and(eq(wallets.userId, userId), eq(wallets.status, 'active'))).limit(1);
  const agentRows = await db.select().from(agents).where(eq(agents.userId, userId)).orderBy(agents.createdAt);
  const requestRows = await db.select().from(paymentRequests).where(eq(paymentRequests.userId, userId)).orderBy(desc(paymentRequests.createdAt)).limit(100);
  // Lazily expire stale approvals so the inbox is honest.
  const requests = await Promise.all(requestRows.map(async (r) => (r.status === 'pending_approval' ? ((await getRequest(r.id)) ?? r) : r)));
  const recentEvents = await db.select().from(events).where(eq(events.userId, userId)).orderBy(desc(events.id)).limit(60);
  const opRows = await db.select().from(operations).where(eq(operations.userId, userId)).orderBy(desc(operations.createdAt)).limit(50);
  const ops = await Promise.all(opRows.map(async (o) => (o.status === 'pending_approval' ? ((await getOperation(o.id)) ?? o) : o)));

  const spentStatuses = new Set(['paid', 'settled', 'processing']);
  const stats = {
    spentCents: requests.filter((r) => spentStatuses.has(r.status)).reduce((s, r) => s + r.amountCents, 0),
    blockedCents: requests.filter((r) => r.status === 'denied').reduce((s, r) => s + r.amountCents, 0),
    autoApproved: requests.filter((r) => r.decidedBy === 'policy' && r.decision === 'allow').length,
    humanApproved: requests.filter((r) => r.decidedBy === 'human' && r.decision === 'allow').length,
    blocked: requests.filter((r) => r.status === 'denied').length,
    caughtByAuditor: requests.filter((r) => r.decidedBy === 'auditor').length,
  };

  return {
    user: { name: user.name, ntfyTopic: user.ntfyTopic },
    wallet: wallet ? { payerEmail: wallet.payerEmail, linkedAt: wallet.updatedAt.toISOString() } : null,
    agents: await Promise.all(
      agentRows.map(async (a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        kind: a.kind,
        status: a.status,
        mandateText: a.mandateText,
        policy: a.policy,
        policyVersion: a.policyVersion,
        apiKeyPrefix: a.apiKeyPrefix,
        allowance: await allowanceSummary(a),
        opsPolicy: a.opsPolicy,
        ops: a.kind === 'business' ? await opsSummary(a) : null,
      })),
    ),
    requests: requests.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      merchant: r.merchant,
      items: r.items,
      amountCents: r.amountCents,
      purpose: r.purpose,
      policyChecks: r.policyChecks,
      policyDecision: r.policyDecision,
      audit: r.audit,
      decision: r.decision,
      decidedBy: r.decidedBy,
      status: r.status,
      approvalExpiresAt: r.approvalExpiresAt?.toISOString() ?? null,
      paypalOrderId: r.paypalOrderId,
      captureId: r.captureId,
      payoutBatchId: r.payoutBatchId,
      payoutStatus: r.payoutStatus,
      payoutFeeCents: r.payoutFeeCents,
      refundId: r.refundId,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    })),
    operations: ops.map((o) => {
      const { approvalToken: _secret, ...rest } = o;
      return { ...rest, createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(), approvalExpiresAt: o.approvalExpiresAt?.toISOString() ?? null };
    }),
    events: recentEvents.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    merchants: await db.select().from(merchants),
    stats,
  };
}

export type DashboardState = Awaited<ReturnType<typeof getDashboardState>>;
export type DashboardRequest = DashboardState['requests'][number];
export type DashboardAgent = DashboardState['agents'][number];
export type DashboardOperation = DashboardState['operations'][number];
