'use client';

import clsx from 'clsx';
import { Ban, Check, CircleAlert, Link2, Pause, Pencil, RefreshCw, Send, ShieldAlert, Undo2, Wallet } from 'lucide-react';
import type { DashboardState } from '@/lib/dashboard';
import { timeAgo } from '@/lib/format';

const ICONS: Record<string, { icon: typeof Check; cls: string }> = {
  'request.processing': { icon: Check, cls: 'text-allow bg-allow-soft' },
  'request.approved': { icon: Check, cls: 'text-allow bg-allow-soft' },
  'request.pending_approval': { icon: CircleAlert, cls: 'text-ask bg-ask-soft' },
  'request.denied': { icon: Ban, cls: 'text-deny bg-deny-soft' },
  'request.expired': { icon: Ban, cls: 'text-ink-3 bg-surface-2' },
  'payment.captured': { icon: Wallet, cls: 'text-allow bg-allow-soft' },
  'payout.created': { icon: Send, cls: 'text-ink-2 bg-surface-2' },
  'payout.settled': { icon: Send, cls: 'text-allow bg-allow-soft' },
  'payout.failed': { icon: CircleAlert, cls: 'text-deny bg-deny-soft' },
  'payment.failed': { icon: CircleAlert, cls: 'text-deny bg-deny-soft' },
  'payment.refunded': { icon: Undo2, cls: 'text-ink-2 bg-surface-2' },
  'wallet.linked': { icon: Link2, cls: 'text-allow bg-allow-soft' },
  'wallet.revoked': { icon: Ban, cls: 'text-deny bg-deny-soft' },
  'agent.frozen': { icon: Pause, cls: 'text-deny bg-deny-soft' },
  'agent.active': { icon: RefreshCw, cls: 'text-allow bg-allow-soft' },
  'agent.rules_updated': { icon: Pencil, cls: 'text-ink-2 bg-surface-2' },
  'dispute.created': { icon: ShieldAlert, cls: 'text-deny bg-deny-soft' },
};

export function ActivityFeed({ events, onSelect }: { events: DashboardState['events']; onSelect?: (requestId: string) => void }) {
  if (!events.length) return <p className="text-sm text-ink-3">Nothing yet. Run an agent from the playground.</p>;
  return (
    <ol className="space-y-3">
      {events.map((e) => {
        const { icon: Icon, cls } = ICONS[e.type] ?? { icon: Check, cls: 'text-ink-2 bg-surface-2' };
        const escalated = e.type === 'request.denied' && e.message.includes('AI auditor');
        const clickable = e.requestId && onSelect;
        return (
          <li key={e.id} className="slide-in">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onSelect!(e.requestId!)}
              className={clsx('flex w-full items-start gap-3 rounded-lg text-left', clickable && 'hover:bg-surface-2')}
            >
              <span className={clsx('mt-0.5 rounded-lg p-1.5', escalated ? 'bg-ai-soft text-ai' : cls)}>
                {escalated ? <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug">{e.message}</span>
                <span className="text-xs text-ink-3">{timeAgo(e.createdAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
