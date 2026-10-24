import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { authenticateAgent, bearerKey } from '@/lib/agents/auth';
import { buildMcpServer } from '@/lib/mcp/server';

// Remote MCP endpoint (Streamable HTTP, stateless). Each agent authenticates with its own Allowance key.
async function handle(req: Request) {
  const agent = await authenticateAgent(bearerKey(req));
  if (!agent) {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32001, message: 'Missing or invalid Allowance agent key (Authorization: Bearer alw_…)' }, id: null },
      { status: 401 },
    );
  }
  const server = buildMcpServer(agent);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    // Stateless: nothing to keep once the response is produced.
    void transport.close();
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
