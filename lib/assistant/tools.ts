/**
 * Runs Pikalo's MCP tool server in-process and adapts it to Bedrock Converse.
 * The assistant calls tools through a real MCP client, so the same server
 * that Claude Desktop can use is what produces every number in an answer.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPikaloServer } from "@/lib/mcp/server";
import type { ToolSpec } from "@/lib/assistant/embed-handler";

export interface ToolCallResult {
  ok: boolean;
  output: unknown;
}

export interface ToolRunner {
  specs(): Promise<ToolSpec[]>;
  call(name: string, input: unknown): Promise<ToolCallResult>;
}

export function createMcpToolRunner(): ToolRunner {
  let client: Promise<Client> | undefined;

  const connect = () =>
    (client ??= (async () => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await createPikaloServer().connect(serverTransport);
      const c = new Client({ name: "pikalo-assistant", version: "0.1.0" });
      await c.connect(clientTransport);
      return c;
    })());

  return {
    async specs() {
      const { tools } = await (await connect()).listTools();
      return tools.map((t) => ({
        toolSpec: {
          name: t.name,
          description: t.description ?? t.name,
          inputSchema: { json: t.inputSchema },
        },
      }));
    },

    async call(name, input) {
      try {
        const res = await (
          await connect()
        ).callTool({
          name,
          arguments: (input ?? {}) as Record<string, unknown>,
        });
        if (res.isError) {
          const msg = (res.content as { text?: string }[])?.[0]?.text ?? "tool error";
          return { ok: false, output: { error: msg } };
        }
        return { ok: true, output: res.structuredContent ?? res.content };
      } catch (e) {
        return {
          ok: false,
          output: { error: e instanceof Error ? e.message : String(e) },
        };
      }
    },
  };
}
