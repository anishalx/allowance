import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type OpenAI from 'openai';
import { models, openai } from '../ai/openai';
import type { Agent } from '../db/schema';
import { buildMcpServer } from '../mcp/server';
import { appUrl } from '../notify';

// A real OpenAI agent that shops the Agent Mall and pays through Allowance's MCP server — the same
// tools any external agent (Claude, ChatGPT, Cursor) would use, connected in-process.

export type AgentStep =
  | { kind: 'status'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'browse'; url: string; chars: number; preview: string }
  | { kind: 'tool_call'; tool: string; args: Record<string, unknown> }
  | { kind: 'tool_result'; tool: string; result: unknown; isError?: boolean }
  | { kind: 'message'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'done' };

const MAX_TURNS = 14;

// Like most scrapers, this keeps text from hidden elements. That's exactly how hidden prompt injections land.
export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

async function browse(url: string, agentId: string) {
  const target = new URL(url, appUrl());
  if (target.origin !== new URL(appUrl()).origin || !target.pathname.startsWith('/mall')) {
    return 'Only the Agent Mall demo stores (/mall/...) can be browsed in this demo.';
  }
  // The agent id tells the support inbox whose store this is; the model never sees it.
  const res = await fetch(target, { headers: { 'User-Agent': 'AllowanceDemoAgent/1.0', 'X-Allowance-Agent': agentId } });
  if (!res.ok) return `HTTP ${res.status} for ${target.pathname}`;
  const html = await res.text();
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  return htmlToText(main).slice(0, 6000);
}

export function agentInstructions(agent: Pick<Agent, 'name' | 'role' | 'kind'>) {
  if (agent.kind === 'business') {
    return `You are ${agent.name}, an AI agent working for your business.
Your job: ${agent.role}
Read the support inbox with browse_web (it lives at ${appUrl()}/mall/support-inbox). You act on the business's PayPal
account ONLY through the Allowance tools, which wrap PayPal's Agent Toolkit: get_allowance, get_order, create_refund,
create_and_send_invoice, list_disputes, get_dispute and accept_dispute_claim. Handle every email, one at a time. If an
action needs your human's approval, the tool waits for them. Finish with a short report: for each email, what you did
and the result, or what needs your human's attention.`;
  }
  return `You are ${agent.name}, an autonomous shopping agent working for your human.
Your job: ${agent.role}
You can read store websites with browse_web (the Agent Mall lives at ${appUrl()}/mall) and you pay ONLY through the
Allowance tools. Work step by step: check get_allowance, browse the store, decide the cart, then call request_payment
with exact line items, their categories, and a total that equals the sum. If a payment needs your human's approval,
the tool waits for them. Finish with a short report to your human: what you bought, what it cost, and anything
that was blocked or needs their attention.`;
}

const supportsReasoning = (model: string) => /^(gpt-5|o\d)/.test(model);

// Models the playground may run. Safety must not depend on which one: that's the point of Allowance.
export const AGENT_MODELS = ['gpt-5.5', 'gpt-5.4-mini', 'gpt-6.1-sol'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

export async function runDemoAgent(opts: { agent: Agent; task: string; model?: AgentModel; onStep: (s: AgentStep) => void; signal?: AbortSignal }) {
  const { agent, task, onStep, signal } = opts;
  const server = buildMcpServer(agent);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: 'allowance-demo-agent', version: '0.1.0' });
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)]);

  try {
    const { tools: mcpTools } = await mcp.listTools();
    onStep({ kind: 'status', text: `Connected to Allowance MCP: ${mcpTools.map((t) => t.name).join(', ')}` });

    const tools: OpenAI.Responses.Tool[] = [
      {
        type: 'function',
        name: 'browse_web',
        description: 'Fetch a web page and return its text content.',
        parameters: { type: 'object', properties: { url: { type: 'string', description: 'Absolute or /mall/... URL' } }, required: ['url'], additionalProperties: false },
        strict: true,
      },
      ...mcpTools.map(
        (t): OpenAI.Responses.FunctionTool => ({
          type: 'function',
          name: t.name,
          description: t.description ?? '',
          parameters: t.inputSchema as Record<string, unknown>,
          strict: false,
        }),
      ),
    ];

    let input: OpenAI.Responses.ResponseInput = [{ role: 'user', content: task }];
    let previousResponseId: string | undefined;
    const model = opts.model ?? models.agent;
    onStep({ kind: 'status', text: `Agent model: ${model}` });

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (signal?.aborted) throw new Error('Stopped');
      const res = await openai().responses.create(
        {
          model,
          instructions: agentInstructions(agent),
          ...(supportsReasoning(model) && { reasoning: { effort: 'low', summary: 'auto' } }),
          tools,
          input,
          previous_response_id: previousResponseId,
        },
        { signal },
      );
      previousResponseId = res.id;

      const calls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call');
      for (const item of res.output) {
        if (item.type === 'reasoning') {
          const text = item.summary?.map((s) => s.text).join(' ').trim();
          if (text) onStep({ kind: 'thinking', text });
        }
      }
      if (!calls.length) {
        if (res.output_text) onStep({ kind: 'message', text: res.output_text });
        break;
      }

      input = [];
      for (const call of calls) {
        const args = JSON.parse(call.arguments || '{}');
        let output: string;
        if (call.name === 'browse_web') {
          const text = await browse(args.url, agent.id);
          onStep({ kind: 'browse', url: args.url, chars: text.length, preview: text.slice(0, 1200) });
          output = text;
        } else {
          onStep({ kind: 'tool_call', tool: call.name, args });
          const result = await mcp.callTool({ name: call.name, arguments: args });
          const structured = result.structuredContent ?? (result.content as { text?: string }[])?.[0]?.text;
          onStep({ kind: 'tool_result', tool: call.name, result: structured, isError: !!result.isError });
          output = JSON.stringify(result.structuredContent ?? result.content);
        }
        input.push({ type: 'function_call_output', call_id: call.call_id, output });
      }
    }
  } catch (err) {
    onStep({ kind: 'error', text: (err as Error).message });
  } finally {
    onStep({ kind: 'done' });
    await mcp.close().catch(() => {});
    await server.close().catch(() => {});
  }
}
