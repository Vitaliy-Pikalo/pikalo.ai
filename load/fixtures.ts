import {
  createEmbedHandler,
  type ConverseRequest,
  type ConverseResponse,
} from "@/lib/assistant/embed-handler";
import type { Handler } from "@/services/http";

const rothInput = {
  taxYear: 2026,
  filingStatus: "single",
  age50OrOlder: false,
  taxableCompensation: 40000,
  modifiedAgi: 40000,
  otherIraContributions: 0,
};
export function fixtureConverse(request: ConverseRequest): ConverseResponse {
  const result = request.messages
    .flatMap((message) => message.content)
    .find((block) => "toolResult" in block);
  if (!result)
    return {
      output: {
        message: {
          role: "assistant",
          content: [
            {
              toolUse: {
                toolUseId: "load-roth",
                name: "roth_ira_limit",
                input: rothInput,
              },
            },
          ],
        },
      },
      stopReason: "tool_use",
    };
  const json = result.toolResult.content.find((block) => "json" in block);
  const limit = (json && "json" in json ? json.json : undefined) as
    { maxContribution?: number } | undefined;
  if (
    result.toolResult.status !== "success" ||
    typeof limit?.maxContribution !== "number"
  )
    throw new Error("Fixture model requires an actual successful calculator result");
  return {
    output: {
      message: {
        role: "assistant",
        content: [
          {
            text: `Your Roth contribution limit is $${limit.maxContribution.toLocaleString("en-US")} for 2026 [1].`,
          },
        ],
      },
    },
    stopReason: "end_turn",
  };
}

const gateway = createEmbedHandler({
  secret: async () => "fixture",
  allowedModels: ["fixture-model"],
  embed: async () => Array(1024).fill(0),
  converse: async (request) => fixtureConverse(request),
});

export const handleFixtureRequest: Handler = async (request) => {
  const path = new URL(request.url).pathname;
  if (path === "/healthz") return Response.json({ status: "fixture" });
  if (path === "/rest/v1/rpc/match_passages" && request.method === "POST") {
    return Response.json([
      {
        id: "local-load-roth",
        doc_id: "local-load",
        doc_title: "Local test fixture",
        section: "Roth calculator",
        url: "https://www.irs.gov/retirement-plans/roth-iras",
        content: "Use the Roth IRA calculator to determine your contribution limit.",
        similarity: 1,
      },
    ]);
  }
  if (path !== "/embed") return new Response(null, { status: 404 });
  const response = await gateway({
    headers: Object.fromEntries(request.headers),
    body: await request.text(),
    requestContext: { http: { method: request.method } },
  });
  return new Response(response.body, {
    status: response.statusCode,
    headers: response.headers,
  });
};
