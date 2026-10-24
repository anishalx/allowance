import clsx from 'clsx';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx('h-7 w-7', className)} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      {/* a coin on a leash */}
      <circle cx="13" cy="18" r="6.5" fill="none" stroke="var(--brand-ink)" strokeWidth="2.4" />
      <path d="M13 15.2v5.6M11.2 16.6h3.1a1.2 1.2 0 0 1 0 2.4h-2.6" stroke="var(--brand-ink)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M18 13.5 24.5 7" stroke="var(--brand-ink)" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="25" cy="6.6" r="2.2" fill="var(--brand-ink)" />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'allow';
  size?: 'sm' | 'md' | 'lg';
};

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        {
          sm: 'h-8 px-3 text-sm',
          md: 'h-10 px-4 text-sm',
          lg: 'h-12 px-6 text-base',
        }[size],
        {
          primary: 'bg-ink text-canvas hover:opacity-90',
          allow: 'bg-allow text-white hover:opacity-90 dark:text-brand-ink',
          secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
          ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
          danger: 'bg-deny text-white hover:opacity-90',
        }[variant],
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={clsx('rounded-2xl border border-line bg-surface shadow-card', className)} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-ink-2 uppercase">{children}</h2>
      {action}
    </div>
  );
}

export type Tone = 'allow' | 'ask' | 'deny' | 'ai' | 'neutral';

export function Chip({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        {
          allow: 'bg-allow-soft text-allow',
          ask: 'bg-ask-soft text-ask',
          deny: 'bg-deny-soft text-deny',
          ai: 'bg-ai-soft text-ai',
          neutral: 'bg-surface-2 text-ink-2',
        }[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_approval: { label: 'Needs you', tone: 'ask' },
  denied: { label: 'Blocked', tone: 'deny' },
  expired: { label: 'Expired', tone: 'neutral' },
  processing: { label: 'Charging…', tone: 'neutral' },
  paid: { label: 'Paid', tone: 'allow' },
  settled: { label: 'Settled', tone: 'allow' },
  failed: { label: 'Failed', tone: 'deny' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  executing: { label: 'Running…', tone: 'neutral' },
  done: { label: 'Done in PayPal', tone: 'allow' },
};

export function StatusChip({ status, decidedBy }: { status: string; decidedBy?: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'neutral' as Tone };
  if (status === 'denied' && decidedBy === 'auditor') return <Chip tone="ai">Blocked by AI auditor</Chip>;
  if (status === 'denied' && decidedBy === 'human') return <Chip tone="deny">Denied by you</Chip>;
  return <Chip tone={s.tone}>{s.label}</Chip>;
}

export function Meter({ label, spent, limit, className }: { label: string; spent: number; limit: number; className?: string }) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const tone = pct >= 90 ? 'bg-deny' : pct >= 70 ? 'bg-ask' : 'bg-allow';
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-2">{label}</span>
        <span className="tabular text-ink-2">
          <span className="font-medium text-ink">${(spent / 100).toFixed(2)}</span> / ${(limit / 100).toFixed(0)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={spent} aria-valuemax={limit} aria-label={label}>
        <div className={clsx('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} aria-hidden="true" />;
}
