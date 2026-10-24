import { formatUsd } from './policy/engine';

// Optional phone push via ntfy.sh: install the ntfy app, subscribe to your topic, and approvals arrive
// with one-tap Approve / Deny buttons. No account or API key needed.

// Render sets RENDER_EXTERNAL_URL automatically; APP_BASE_URL overrides it (e.g. a custom domain).
export const appUrl = () => (process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function pushApprovalRequest(opts: {
  topic: string | null;
  requestId: string;
  approvalToken: string;
  agentName: string;
  merchantName: string;
  amountCents: number;
  reason: string;
}) {
  if (!opts.topic) return;
  const base = `${appUrl()}/api/requests/${opts.requestId}/decision?token=${opts.approvalToken}`;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(opts.topic)}`, {
      method: 'POST',
      signal: AbortSignal.timeout(8_000),
      headers: {
        Title: `${opts.agentName} wants to spend ${formatUsd(opts.amountCents)}`,
        Tags: 'moneybag',
        Priority: 'high',
        Click: `${appUrl()}/approve/${opts.requestId}?token=${opts.approvalToken}`,
        Actions: `http, Approve, ${base}&action=approve, method=POST, clear=true; http, Deny, ${base}&action=deny, method=POST, clear=true`,
      },
      body: `${opts.merchantName}: ${opts.reason}`,
    });
  } catch (err) {
    console.error('[notify] ntfy push failed:', (err as Error).message);
  }
}
