// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { readFile } from "node:fs/promises";
import { createHttpServer } from "@/services/http";
import { handleMcpRequest } from "@/services/mcp-calc/app";
import { createRemoteToolRunner } from "@/services/answer-api/remote-tools";
import { createAnswerHandler } from "@/services/answer-api/app";
import {
  runToolEvals,
  runProvenanceEvals,
  type ToolCase,
  type ProvenanceCase,
} from "@/lib/evals/runner";

const servers: Server[] = [];
async function start(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No listening address");
  return `http://127.0.0.1:${address.port}`;
}
afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeIdleConnections();
        }),
    ),
  );
});

describe("standalone services over real HTTP (no cloud calls)", () => {
  let mcpBase: string;
  let answerBase: string;
  let calls = 0;
  beforeAll(async () => {
    mcpBase = await start(createHttpServer(handleMcpRequest));
    const tools = createRemoteToolRunner(`${mcpBase}/mcp`);
    answerBase = await start(
      createHttpServer(
        createAnswerHandler({
          embed: async () => [0],
          retrieve: async () => [],
          modelId: "test-fixture",
          tools,
          converse: async () => {
            calls++;
            if (calls === 1)
              return {
                output: {
                  message: {
                    role: "assistant",
                    content: [
                      {
                        toolUse: {
                          toolUseId: "roth-1",
                          name: "roth_ira_limit",
                          input: {
                            taxYear: 2026,
                            filingStatus: "single",
                            age50OrOlder: false,
                            taxableCompensation: 40000,
                            modifiedAgi: 40000,
                            otherIraContributions: 0,
                          },
                        },
                      },
                    ],
                  },
                },
                stopReason: "tool_use",
              };
            return {
              output: {
                message: {
                  role: "assistant",
                  content: [{ text: "Your Roth contribution limit is $7,500 for 2026." }],
                },
              },
              stopReason: "end_turn",
            };
          },
        }),
      ),
    );
  });

  it("passes all 33 existing calculator cases across the HTTP MCP boundary and all 14 provenance cases", async () => {
    const tools = createRemoteToolRunner(`${mcpBase}/mcp`);
    expect(await tools.specs()).toHaveLength(3);
    const toolCases = JSON.parse(await readFile("evals/gold-tools.json", "utf8"))
      .cases as ToolCase[];
    const provenanceCases = JSON.parse(
      await readFile("evals/gold-provenance.json", "utf8"),
    ).cases as ProvenanceCase[];
    const calculator = await runToolEvals(toolCases, async (name, args) => {
      const result = await tools.call(name, args);
      if (!result.ok) throw new Error(JSON.stringify(result.output));
      return result.output;
    });
    expect(calculator.failures).toEqual([]);
    expect(calculator.passed).toBe(33);
    expect(runProvenanceEvals(provenanceCases).passed).toBe(14);
    expect((await tools.call("check_tax_residency", { daysCurrent: -5 })).ok).toBe(false);
  }, 20_000);

  it("returns a guarded answer through both HTTP services with a fixture model", async () => {
    const res = await fetch(`${answerBase}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: "I'm single and make $40,000. How much can I put in a Roth?",
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "answered",
      answer: "Your Roth contribution limit is $7,500 for 2026.",
      tools: [{ name: "roth_ira_limit", ok: true, output: { maxContribution: 7500 } }],
    });
    expect(calls).toBe(2);
  });

  it("handles health, readiness, malformed input, routing and oversized bodies", async () => {
    for (const base of [mcpBase, answerBase]) {
      for (const path of ["/healthz", "/readyz"]) {
        expect((await fetch(`${base}${path}`)).status).toBe(200);
      }
      expect((await fetch(`${base}/missing`)).status).toBe(404);
    }
    expect((await fetch(`${answerBase}/api/ask`)).status).toBe(405);
    expect(
      (await fetch(`${answerBase}/api/ask`, { method: "POST", body: "{" })).status,
    ).toBe(400);
    expect(
      (await fetch(`${answerBase}/api/ask`, { method: "POST", body: "x".repeat(20_000) }))
        .status,
    ).toBe(413);
    expect(
      (
        await fetch(`${mcpBase}/mcp`, {
          method: "POST",
          headers: { origin: "https://example.com" },
        })
      ).status,
    ).toBe(403);
  });

  it("fails closed on calculator outage and recovers on the next operation", async () => {
    const server = createHttpServer(handleMcpRequest);
    const base = await start(server);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const tools = createRemoteToolRunner(`${base}/mcp`);
    expect((await tools.call("roth_ira_limit", {})).ok).toBe(false);
    await new Promise<void>((resolve) =>
      server.listen(address.port, "127.0.0.1", resolve),
    );
    expect(await tools.specs()).toHaveLength(3);
  });
});
