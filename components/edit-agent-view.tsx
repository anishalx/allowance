'use client';

import { use } from 'react';
import { MandateEditor } from './mandate-editor';
import { Spinner } from './ui';
import { useDashboard } from './use-dashboard';

export function EditAgentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useDashboard();
  const agent = state?.agents.find((a) => a.id === id);

  if (!state) return <Spinner />;
  if (!agent) return <p className="text-ink-2">Agent not found.</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Edit {agent.name}&apos;s rules</h1>
        <p className="mt-1 text-sm text-ink-2">Changes apply to the next purchase request. Every version is kept in the activity log.</p>
      </div>
      <MandateEditor mode="edit" agent={agent} />
    </div>
  );
}
