'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { PageHeader, Spinner } from '@/components/ui';
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
    <div className="flex h-[calc(100vh-9rem)] min-h-[640px] flex-col gap-5">
      <PageHeader
        title="Console"
        description="Every agent payment as data, in AG Studio. Ask the Guardian to analyse it, or to act: freeze an agent, refund a purchase, change rules, reconcile with PayPal. Actions always need your click."
      >
        {empty && (
          <p className="mt-3 rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-ink-2">
            Nothing to analyse yet.{' '}
            <Link href="/playground" className="font-medium text-brand hover:underline">
              Run a scenario in the playground
            </Link>
            , then come back: every purchase, block and refund lands here.
          </p>
        )}
      </PageHeader>
      <div className="relative left-1/2 min-h-0 w-[calc(100vw-2rem)] max-w-[1800px] flex-1 -translate-x-1/2">
        <StudioConsole />
      </div>
    </div>
  );
}
