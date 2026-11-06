'use client';

import { use } from 'react';
import { MandateEditor } from './mandate-editor';
import { PageHeader, Spinner } from './ui';
import { useDashboard } from './use-dashboard';

export function EditAgentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { state } = useDashboard();
  const agent = state?.agents.find((a) => a.id === id);

  if (!state) return <Spinner />;
  if (!agent) return <p className="text-ink-2">Agent not found.</p>;
  return (
    <div className="space-y-8">
      <PageHeader title={`Edit ${agent.name}'s rules`} description="Changes apply to the next purchase request. Every version is kept in the activity log." />
      <MandateEditor mode="edit" agent={agent} />
    </div>
  );
}
