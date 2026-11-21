import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ToolRunner } from "@/lib/assistant/tools";

export function createRemoteToolRunner(url: string): ToolRunner {
  const endpoint = new URL(url);
  if (!["http:", "https:"].includes(endpoint.protocol))
    throw new Error("Invalid MCP_CALC_URL");

  // Short-lived, stateless clients avoid pinning sessions to a calculator replica.
  async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ name: "pikalo-answer-api", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(endpoint, {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(5_000),
          ]),
        }),
    });
    try {
      await client.connect(transport, { timeout: 5_000 });
      return await run(client);
    } finally {
      await client.close();
    }
  }

  return {
    specs: () =>
      withClient(async (client) => {
        const { tools } = await client.listTools();
        return tools.map((tool) => ({
          toolSpec: {
            name: tool.name,
            description: tool.description ?? tool.name,
            inputSchema: { json: tool.inputSchema },
          },
        }));
      }),
    async call(name, input) {
      try {
        return await withClient(async (client) => {
          const result = await client.callTool({
            name,
            arguments: (input ?? {}) as Record<string, unknown>,
          });
          if (result.isError)
            return { ok: false, output: { error: "Calculator rejected the request." } };
          return { ok: true, output: result.structuredContent ?? result.content };
        });
      } catch {
        return { ok: false, output: { error: "Calculator unavailable." } };
      }
    },
  };
}
