/** Separate entrypoint: local fixture URLs are hard-coded; never used by production. */
import { converse, embedQuery } from "@/lib/assistant/embed-client";
import { retrievePassages } from "@/lib/assistant/retrieval";
import { createAnswerHandler } from "@/services/answer-api/app";
import { createRemoteToolRunner } from "@/services/answer-api/remote-tools";
import { createHttpServer, listen } from "@/services/http";

const gateway = { url: "http://fixture-backend:3002/embed", secret: "fixture" };
const handler = createAnswerHandler(
  {
    embed: (text) => embedQuery(text, gateway),
    retrieve: (embedding) =>
      retrievePassages(embedding, { url: "http://fixture-backend:3002", key: "fixture" }),
    converse: (request) => converse(request, gateway),
    tools: createRemoteToolRunner("http://mcp-calc:3001/mcp"),
    modelId: "fixture-model",
  },
  { localLimitPerMinute: 60_000 },
);
listen(createHttpServer(handler), 3000, "answer-api-local-load-fixture");
