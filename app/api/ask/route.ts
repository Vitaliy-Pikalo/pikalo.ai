import { ask } from "@/lib/assistant/ask";
import { createAskHandler } from "@/lib/assistant/api";
import { converse, embedQuery } from "@/lib/assistant/embed-client";
import { retrievePassages } from "@/lib/assistant/retrieval";
import { recordWithheld } from "@/lib/assistant/review-queue";
import { createMcpToolRunner } from "@/lib/assistant/tools";

// Up to 4 model calls plus embedding and retrieval.
export const maxDuration = 60;

const MODEL_ID = process.env.ASSISTANT_MODEL_ID ?? "us.amazon.nova-micro-v1:0";
const tools = createMcpToolRunner();

export const POST = createAskHandler({
  run: (question) =>
    ask(question, {
      embed: (text) => embedQuery(text),
      retrieve: (embedding) => retrievePassages(embedding),
      converse: (req) => converse(req),
      tools,
      modelId: MODEL_ID,
    }),
  record: (item) => recordWithheld(item),
});
