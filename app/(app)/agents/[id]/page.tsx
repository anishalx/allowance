import { Suspense } from 'react';
import { EditAgentView } from '@/components/edit-agent-view';
import { Spinner } from '@/components/ui';

export const metadata = { title: 'Edit rules' };

export default function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Spinner />}>
      <EditAgentView params={params} />
    </Suspense>
  );
}
