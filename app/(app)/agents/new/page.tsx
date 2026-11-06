import { MandateEditor } from '@/components/mandate-editor';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'New agent' };

export default function NewAgentPage() {
  return (
    <div className="space-y-8">
      <PageHeader title="Give a new agent an allowance" description="Describe what it may spend on, the way you'd tell a person. You'll review the exact rules before they take effect." />
      <MandateEditor mode="new" />
    </div>
  );
}
