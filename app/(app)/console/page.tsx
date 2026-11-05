'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Spinner } from '@/components/ui';
import { useDashboard } from '@/components/use-dashboard';

// AG Studio is browser-only.
const StudioConsole = dynamic(() => import('@/components/console/studio-console'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center gap-2 text-ink-2">
      <Spinner /> Loading console…
    </div>
  ),
});

export default function ConsolePage() {
  const { state } = useDashboard();
  const empty = !!state && state.requests.length === 0 && state.operations.length === 0;
  return (
    <div className="relative left-1/2 flex h-[calc(100vh-7.5rem)] w-[calc(100vw-2rem)] max-w-[1800px] -translate-x-1/2 flex-col gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Console</h1>
        <p className="mt-1 text-sm text-ink-2">
          Every agent payment as data, in AG Studio. Ask the Guardian to analyse it, or to act: freeze an agent, refund a purchase, change rules, reconcile with PayPal. Actions always need your click.
        </p>
        {empty && (
          <p className="mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-2">
            Nothing to analyse yet.{' '}
            <Link href="/playground" className="font-medium text-ink underline">
              Run a scenario in the playground
            </Link>
            , then come back: every purchase, block and refund lands here.
          </p>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <StudioConsole />
      </div>
    </div>
  );
}
