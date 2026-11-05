/**
 * Live assistant evals. Not run in CI: they call Bedrock and cost a little.
 *
 *   # against the deployed site (no secrets needed)
 *   npm run eval:assistant -- --base https://pikalo.org
 *
 *   # locally against any allowlisted model (model bake-off); needs
 *   # EMBED_URL, EMBED_SIGNING_SECRET, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
 *   npm run eval:assistant -- --model us.amazon.nova-lite-v1:0
 */
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { ask } from "@/lib/assistant/ask";
import { converse, embedQuery } from "@/lib/assistant/embed-client";
import { retrievePassages } from "@/lib/assistant/retrieval";
import { createMcpToolRunner } from "@/lib/assistant/tools";
import {
  scoreAssistantCase,
  type AssistantCase,
  type AssistantOutput,
} from "@/lib/evals/assistant";

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    model: { type: "string", default: "us.amazon.nova-micro-v1:0" },
    threshold: { type: "string", default: "0.8" },
    only: { type: "string" },
  },
});

const cases: AssistantCase[] = JSON.parse(
  await readFile(new URL("./gold-assistant.json", import.meta.url), "utf8"),
).cases.filter((c: AssistantCase) => !values.only || c.id === values.only);

const tools = createMcpToolRunner();
const usage = { inputTokens: 0, outputTokens: 0 };

async function run(question: string): Promise<AssistantOutput> {
  if (values.base) {
    // The site rate-limits per IP; pace requests.
    await new Promise((r) => setTimeout(r, 8_000));
    const res = await fetch(`${values.base}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  const r = await ask(question, {
    embed: (t) => embedQuery(t),
    retrieve: (e) => retrievePassages(e),
    converse: (req) => converse(req),
    tools,
    modelId: values.model!,
  });
  usage.inputTokens += r.usage.inputTokens;
  usage.outputTokens += r.usage.outputTokens;
  return { ...r, tools: r.toolCalls };
}

const target = values.base ?? values.model;
console.log(`Assistant evals → ${target} (${cases.length} cases)\n`);
let passed = 0;
for (const c of cases) {
  const started = Date.now();
  try {
    const out = await run(c.question);
    const s = scoreAssistantCase(c, out);
    if (s.pass) passed++;
    const ms = Date.now() - started;
    console.log(`${s.pass ? "PASS" : "FAIL"}  ${c.id}  [${out.status}, ${ms} ms]`);
    for (const f of s.failures) console.log(`      - ${f}`);
    if (!s.pass)
      console.log(`      answer: ${out.answer.slice(0, 240).replace(/\n/g, " ")}`);
  } catch (e) {
    console.log(`ERROR ${c.id}: ${e instanceof Error ? e.message : e}`);
  }
}

const rate = passed / cases.length;
console.log(`\n${passed}/${cases.length} passed (${Math.round(rate * 100)}%)`);
if (!values.base)
  console.log(`tokens: ${usage.inputTokens} in / ${usage.outputTokens} out`);
if (rate < Number(values.threshold)) process.exit(1);
