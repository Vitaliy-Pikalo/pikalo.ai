import { converse, embedQuery } from "@/lib/assistant/embed-client";
import { retrievePassages } from "@/lib/assistant/retrieval";
import { createAnswerHandler } from "@/services/answer-api/app";
import { createRemoteToolRunner } from "@/services/answer-api/remote-tools";
import { createHttpServer, listen } from "@/services/http";

for (const name of [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "EMBED_URL",
  "EMBED_SIGNING_SECRET",
  "MCP_CALC_URL",
]) {
  if (!process.env[name]?.trim())
    throw new Error(`Missing required environment variable: ${name}`);
}

const handler = createAnswerHandler({
  embed: (text) => embedQuery(text),
  retrieve: (embedding) => retrievePassages(embedding),
  converse: (request) => converse(request),
  tools: createRemoteToolRunner(process.env.MCP_CALC_URL!),
  modelId: process.env.ASSISTANT_MODEL_ID ?? "us.amazon.nova-micro-v1:0",
});
listen(createHttpServer(handler), 3000, "answer-api");
