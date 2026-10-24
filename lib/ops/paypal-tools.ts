import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PayPalAgentToolkit } from '@paypal/agent-toolkit/mcp';
import { accessToken } from '../paypal/client';

// PayPal's own Agent Toolkit (the MCP server PayPal ships for AI agents), run in-process. Business agents
// reach these tools only through Allowance, which checks every mutating call before forwarding it here.

export const PAYPAL_TOOL_ACTIONS = {
  orders: { get: true },
  payments: { createRefund: true, getRefunds: true },
  invoices: { create: true, send: true, get: true, list: true },
  disputes: { list: true, get: true, create: true },
};

export async function callPayPalTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const toolkit = new PayPalAgentToolkit({
    accessToken: await accessToken(),
    configuration: { actions: PAYPAL_TOOL_ACTIONS, context: { sandbox: (process.env.PAYPAL_BASE_URL ?? '').includes('sandbox') || !process.env.PAYPAL_BASE_URL } },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'allowance', version: '0.1.0' });
  await Promise.all([toolkit.connect(serverSide), client.connect(clientSide)]);
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = (result.content as { type: string; text?: string }[])?.find((c) => c.type === 'text')?.text ?? '';
    if (result.isError) throw new Error(text || `PayPal tool ${name} failed`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // The toolkit sometimes reports failures as plain text rather than isError.
      throw new Error(text || `PayPal tool ${name} returned no data`);
    }
    // ...and sometimes as a JSON envelope: {"ok": false, "status": 403, "message": "..."}.
    const envelope = parsed as { ok?: boolean; status?: number; message?: string };
    if (envelope && envelope.ok === false) throw new Error(`PayPal ${envelope.status ?? ''} ${envelope.message ?? 'error'}`.trim());
    return parsed as T;
  } finally {
    await client.close().catch(() => {});
    await toolkit.close().catch(() => {});
  }
}

export async function listPayPalTools() {
  const toolkit = new PayPalAgentToolkit({ accessToken: 'unused', configuration: { actions: PAYPAL_TOOL_ACTIONS, context: { sandbox: true } } });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'allowance', version: '0.1.0' });
  await Promise.all([toolkit.connect(serverSide), client.connect(clientSide)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}
