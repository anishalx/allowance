'use client';

import clsx from 'clsx';
import { Check, Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button, Card, SectionTitle, Spinner } from '@/components/ui';
import { api, useDashboard } from '@/components/use-dashboard';
import { useOrigin, useSearchParam } from '@/components/use-location';

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-ink"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 font-mono text-xs leading-relaxed">{code}</pre>
    </div>
  );
}

export default function ConnectPage() {
  const { state } = useDashboard();
  const [picked, setPicked] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = useOrigin('https://your-allowance-host');
  const fromUrl = useSearchParam('agent');
  const agentId = picked ?? fromUrl ?? state?.agents[0]?.id ?? null;

  const agent = state?.agents.find((a) => a.id === agentId);
  const url = `${origin}/api/mcp`;
  const k = key ?? `${agent?.apiKeyPrefix ?? 'alw_xxxxxxxx'}…`;
  const slug = (agent?.name ?? 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  async function rotate() {
    if (!agent) return;
    if (key === null && !confirm(`Issue a new key for ${agent.name}? Any client using the old key stops working.`)) return;
    setBusy(true);
    try {
      setKey((await api<{ apiKey: string }>(`/api/agents/${agent.id}/key`, { method: 'POST' })).apiKey);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect an agent</h1>
        <p className="mt-1 text-sm text-ink-2">
          Allowance is a remote MCP server. Shopping agents get get_allowance, list_merchants, request_payment, get_payment_status, list_my_payments and request_refund.
          Business agents get PayPal&apos;s own Agent Toolkit tools (get_order, create_refund, create_and_send_invoice, disputes) with Allowance in front of every action.
          Either way, an agent only ever sees its own rules.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit space-y-4 p-4">
          <SectionTitle>Agent</SectionTitle>
          <div className="space-y-2">
            {state?.agents.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setPicked(a.id);
                  setKey(null);
                }}
                className={clsx('w-full rounded-xl border p-3 text-left text-sm', a.id === agentId ? 'border-ink bg-surface-2' : 'border-line hover:bg-surface-2')}
              >
                <div className="font-medium">{a.name}</div>
                <div className="font-mono text-xs text-ink-3">{a.apiKeyPrefix}…</div>
              </button>
            ))}
          </div>
          <Button onClick={rotate} disabled={!agent || busy} className="w-full">
            {busy ? <Spinner /> : <KeyRound className="h-4 w-4" aria-hidden="true" />} {key ? 'Issue another key' : 'Generate API key'}
          </Button>
          {key && <p className="text-xs text-ask">Copy it now. It won&apos;t be shown again, and the snippets on the right already include it.</p>}
        </Card>

        <Card className="space-y-6 p-5">
          <CodeBlock title="Claude Code" code={`claude mcp add --transport http allowance-${slug} ${url} \\\n  --header "Authorization: Bearer ${k}"`} />
          <CodeBlock
            title="Cursor (.cursor/mcp.json)"
            code={JSON.stringify({ mcpServers: { [`allowance-${slug}`]: { url, headers: { Authorization: `Bearer ${k}` } } } }, null, 2)}
          />
          <CodeBlock
            title="Claude Desktop and other stdio-only clients (via mcp-remote)"
            code={JSON.stringify(
              { mcpServers: { [`allowance-${slug}`]: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', `Authorization:Bearer ${k}`] } } },
              null,
              2,
            )}
          />
          <CodeBlock
            title="OpenAI Responses API (remote MCP tool)"
            code={`const response = await openai.responses.create({
  model: "gpt-5.5",
  input: "Restock oat milk and eggs from FreshCart.",
  tools: [{
    type: "mcp",
    server_label: "allowance",
    server_url: "${url}",
    headers: { Authorization: "Bearer ${k}" },
    require_approval: "never", // Allowance does the approving
  }],
});`}
          />
          <CodeBlock
            title="Smoke test with curl"
            code={`curl -s ${url} \\\n  -H "Authorization: Bearer ${k}" \\\n  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_allowance","arguments":{}}}'`}
          />
        </Card>
      </div>
    </div>
  );
}
