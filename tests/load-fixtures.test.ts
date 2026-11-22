// @vitest-environment node
import { afterAll, expect, it } from "vitest";
import type { Server } from "node:http";
import { createHttpServer } from "@/services/http";
import { handleFixtureRequest, fixtureConverse } from "@/load/fixtures";
import { handleMcpRequest } from "@/services/mcp-calc/app";
import { createAnswerHandler } from "@/services/answer-api/app";
import { createRemoteToolRunner } from "@/services/answer-api/remote-tools";
import { converse, embedQuery } from "@/lib/assistant/embed-client";
import { retrievePassages } from "@/lib/assistant/retrieval";

const servers: Server[] = [];
async function start(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing address");
  return `http://127.0.0.1:${address.port}`;
}
afterAll(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeIdleConnections();
        }),
    ),
  );
});

it("exercises signed gateway, retrieval, remote MCP, guards and HTTP with local fixtures", async () => {
  const fixture = await start(createHttpServer(handleFixtureRequest));
  const calc = await start(createHttpServer(handleMcpRequest));
  const gateway = { url: `${fixture}/embed`, secret: "fixture" };
  const api = await start(
    createHttpServer(
      createAnswerHandler(
        {
          embed: (text) => embedQuery(text, gateway),
          retrieve: (embedding) =>
            retrievePassages(embedding, { url: fixture, key: "fixture" }),
          converse: (request) => converse(request, gateway),
          tools: createRemoteToolRunner(`${calc}/mcp`),
          modelId: "fixture-model",
        },
        { localLimitPerMinute: 60_000 },
      ),
    ),
  );
  for (let i = 0; i < 10; i++) {
    const response = await fetch(`${api}/api/ask`, {
      method: "POST",
      body: JSON.stringify({
        question: "I'm single and make $40,000. How much can I put in a Roth?",
      }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "answered",
      tools: [{ name: "roth_ira_limit", ok: true, output: { maxContribution: 7500 } }],
    });
  }
  await expect(embedQuery("test", { ...gateway, secret: "wrong" })).rejects.toThrow(
    "401",
  );
}, 20_000);

it("refuses to fabricate a fixture answer without a successful calculator result", () => {
  expect(() =>
    fixtureConverse({
      modelId: "fixture-model",
      system: "",
      messages: [
        {
          role: "user",
          content: [
            { toolResult: { toolUseId: "x", status: "error", content: [{ json: {} }] } },
          ],
        },
      ],
    }),
  ).toThrow();
});
