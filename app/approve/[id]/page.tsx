import { Suspense } from 'react';
import { ApproveView } from '@/components/approve-view';
import { Spinner } from '@/components/ui';

export const metadata = { title: 'Approve a purchase' };

export default function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Spinner className="m-6" />}>
      <ApproveView params={params} />
    </Suspense>
  );
}
