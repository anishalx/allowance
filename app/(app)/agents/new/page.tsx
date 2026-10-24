import { MandateEditor } from '@/components/mandate-editor';

export const metadata = { title: 'New agent' };

export default function NewAgentPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Give a new agent an allowance</h1>
        <p className="mt-1 text-sm text-ink-2">Describe what it may spend on. You&apos;ll review the exact rules before they take effect.</p>
      </div>
      <MandateEditor mode="new" />
    </div>
  );
}
