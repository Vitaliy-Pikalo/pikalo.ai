/**
 * Model gateway Lambda behind a function URL (embed + converse). Auth, the
 * model allowlist and limits live in lib/assistant/embed-handler.ts; this
 * file only wires AWS clients.
 * Env: SIGNING_SECRET_ARN, BEDROCK_MODEL_ID, CHAT_MODEL_ALLOWLIST (comma-separated).
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  InvokeModelCommand,
  type ConverseCommandInput,
} from "@aws-sdk/client-bedrock-runtime";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import {
  createEmbedHandler,
  type ConverseResponse,
} from "../../lib/assistant/embed-handler";
import { EMBEDDING_DIMENSIONS } from "../../lib/ingest/pipeline";

const bedrock = new BedrockRuntimeClient({});
const secrets = new SecretsManagerClient({});
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "amazon.titan-embed-text-v2:0";

// Cached per container; a rotated secret is picked up on the next cold start.
let cachedSecret: Promise<string> | undefined;

export const handler = createEmbedHandler({
  allowedModels: (process.env.CHAT_MODEL_ALLOWLIST ?? "").split(",").filter(Boolean),
  async converse(req) {
    const res = await bedrock.send(
      new ConverseCommand({
        modelId: req.modelId,
        system: [{ text: req.system }],
        messages: req.messages as ConverseCommandInput["messages"],
        toolConfig: req.toolConfig as ConverseCommandInput["toolConfig"],
        inferenceConfig: { maxTokens: req.maxTokens, temperature: req.temperature },
      }),
    );
    return {
      output: res.output as ConverseResponse["output"],
      stopReason: res.stopReason ?? "unknown",
      usage: {
        inputTokens: res.usage?.inputTokens ?? 0,
        outputTokens: res.usage?.outputTokens ?? 0,
      },
    };
  },
  secret() {
    cachedSecret ??= secrets
      .send(new GetSecretValueCommand({ SecretId: process.env.SIGNING_SECRET_ARN! }))
      .then((r) => r.SecretString ?? "")
      .catch((e) => {
        cachedSecret = undefined;
        throw e;
      });
    return cachedSecret;
  },
  async embed(text) {
    const res = await bedrock.send(
      new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          inputText: text,
          dimensions: EMBEDDING_DIMENSIONS,
          normalize: true,
        }),
      }),
    );
    return JSON.parse(new TextDecoder().decode(res.body)).embedding as number[];
  },
});
