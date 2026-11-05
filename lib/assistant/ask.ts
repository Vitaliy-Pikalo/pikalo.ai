/**
 * The Pikalo assistant loop.
 *
 *   question → embed → retrieve IRS passages → model (with MCP tools)
 *            → provenance check → one repair attempt → answer or block
 *
 * The model phrases answers and chooses tools; it is never trusted with a
 * number. Every quantity in the final answer must appear in a retrieved
 * passage, a tool result or the question itself, or the answer is withheld.
 */

import { checkProvenance, extractNumbers } from "@/lib/assistant/provenance";
import type {
  ContentBlock,
  ConverseMessage,
  ConverseRequest,
  ConverseResponse,
} from "@/lib/assistant/embed-handler";
import type { Passage } from "@/lib/assistant/retrieval";
import type { ToolRunner } from "@/lib/assistant/tools";

export const MAX_QUESTION_CHARS = 1000;
const MAX_MODEL_CALLS = 4;
const MAX_ANSWER_TOKENS = 700;

export interface AskDeps {
  embed(text: string): Promise<number[]>;
  retrieve(embedding: number[]): Promise<Passage[]>;
  converse(req: ConverseRequest): Promise<ConverseResponse>;
  tools: ToolRunner;
  modelId: string;
}

export interface Citation {
  n: number;
  title: string;
  section: string;
  url: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  ok: boolean;
  output: unknown;
}

export interface AskResult {
  status: "answered" | "blocked" | "no_sources" | "error";
  answer: string;
  citations: Citation[];
  toolCalls: ToolCallRecord[];
  /** For blocked answers: short snippets around each unverifiable number. */
  unsupported: string[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export const SYSTEM_PROMPT = `You are Pikalo, a U.S. tax and money explainer for immigrants, international students and young people.

Rules:
- Use ONLY the numbered IRS sources in the user's message and results from your tools. If they don't answer the question, say so plainly and point to the most relevant source.
- Never state a dollar amount, limit, percentage, day count or threshold unless it appears in a source or a tool result. For any calculation about the user's own situation, call a tool; never do the math yourself.
- Tools are only for the user's own situation, when they give their own facts:
  - days in the U.S. and visa status → check_tax_residency (an F-1/J-1 student's "first year in status" is the year they first arrived on that visa)
  - W-2 wages and Social Security/Medicare withheld → check_fica_refund
  - income and filing status for a Roth IRA → roth_ira_limit
  Copy every fact the user gave into the tool input. For a general question (no personal numbers), answer from the sources and do not call a tool.
- If a tool needs details the user didn't give, ask for them briefly instead of guessing.
- Cite sources inline as [1], [2] after the sentence they support.
- Plain language, short paragraphs, under 180 words. Explain terms like "nonresident alien" when you use them.
- Write only the final answer for the user. Never include your reasoning, notes or <thinking> tags.
- This is education, not legal or tax advice. When a situation is unusual (status changes, treaties, dual status), recommend a qualified tax professional or the IRS.`;

const NO_SOURCES_ANSWER =
  "I couldn't find anything in the IRS publications I use that covers this. I only answer questions about U.S. taxes and money basics for immigrants and students, using IRS sources. Try rephrasing, or ask about residency, FICA refunds, Roth IRAs, FBAR or Form 8843.";

const BLOCKED_ANSWER =
  "I drafted an answer but couldn't verify every number in it against the IRS sources, so I'm not showing it. The sources below cover your question; please check them directly.";

function userPrompt(question: string, passages: Passage[]): string {
  const sources = passages
    .map((p, i) => `[${i + 1}] ${p.doc_title} — ${p.section}\n${p.content}`)
    .join("\n\n");
  return `IRS sources:\n\n${sources || "(none found)"}\n\nQuestion: ${question}`;
}

/** Some models (Nova) emit <thinking>…</thinking> notes; users never see them. */
export function stripThinking(text: string): string {
  return text
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<thinking>[\s\S]*$/i, "")
    .trim()
    .replace(/^\**\s*final answer\s*:?\s*\**\s*/i, "")
    .trim();
}

const textOf = (m: ConverseMessage) =>
  stripThinking(
    m.content
      .filter((b): b is { text: string } => "text" in b)
      .map((b) => b.text)
      .join("\n"),
  );

function citationsFor(answer: string, passages: Passage[]): Citation[] {
  const cited = new Set<number>();
  for (const m of answer.matchAll(/\[(\d{1,2})\]/g)) {
    const n = Number(m[1]);
    if (n >= 1 && n <= passages.length) cited.add(n);
  }
  const ns = cited.size
    ? [...cited].sort((a, b) => a - b)
    : passages.slice(0, 3).map((_, i) => i + 1);
  return ns.map((n) => ({
    n,
    title: passages[n - 1].doc_title,
    section: passages[n - 1].section,
    url: passages[n - 1].url,
  }));
}

/**
 * When the user states their own figures on a calculator's topic, the
 * answer must come from that calculator. Provenance alone isn't enough: a
 * wrong-year limit can still appear in a retrieved source (seen live: $7,000
 * for a 2026 Roth question, which is the 2025 limit).
 */
export function requiredTool(question: string): string | null {
  if (extractNumbers(question).length === 0) return null;
  if (/social security|medicare|\bfica\b|\bw-?2\b/i.test(question))
    return "check_fica_refund";
  if (/\broth\b|\bira\b/i.test(question)) return "roth_ira_limit";
  if (
    /resident|residency|substantial presence/i.test(question) &&
    /\bdays?\b/i.test(question)
  )
    return "check_tax_residency";
  return null;
}

export async function ask(question: string, deps: AskDeps): Promise<AskResult> {
  const q = question.trim();
  if (!q || q.length > MAX_QUESTION_CHARS)
    throw new Error("question must be 1–1000 characters");

  const usage = { inputTokens: 0, outputTokens: 0 };
  const toolCalls: ToolCallRecord[] = [];
  const result = (
    status: AskResult["status"],
    answer: string,
    passages: Passage[],
    unsupported: string[] = [],
  ): AskResult => ({
    status,
    answer,
    citations: status === "no_sources" ? [] : citationsFor(answer, passages),
    toolCalls,
    unsupported,
    model: deps.modelId,
    usage,
  });

  const passages = await deps.retrieve(await deps.embed(q));
  const toolSpecs = await deps.tools.specs();
  const toolMentioned =
    /roth|ira|fica|social security|medicare|resident|days|substantial presence/i.test(q);
  if (passages.length === 0 && !toolMentioned)
    return result("no_sources", NO_SOURCES_ANSWER, []);

  const messages: ConverseMessage[] = [
    { role: "user", content: [{ text: userPrompt(q, passages) }] },
  ];
  let calls = 0;
  const callModel = async () => {
    calls++;
    const res = await deps.converse({
      modelId: deps.modelId,
      system: SYSTEM_PROMPT,
      messages: [...messages],
      toolConfig: { tools: toolSpecs },
      maxTokens: MAX_ANSWER_TOKENS,
      temperature: 0,
    });
    usage.inputTokens += res.usage?.inputTokens ?? 0;
    usage.outputTokens += res.usage?.outputTokens ?? 0;
    messages.push(res.output.message);
    return res;
  };

  const runTools = async (first: ConverseResponse): Promise<ConverseResponse | null> => {
    let r = first;
    while (r.stopReason === "tool_use") {
      if (calls >= MAX_MODEL_CALLS) return null;
      const results: ContentBlock[] = [];
      for (const block of r.output.message.content) {
        if (!("toolUse" in block)) continue;
        const { toolUseId, name, input } = block.toolUse;
        const out = await deps.tools.call(name, input);
        toolCalls.push({ name, input, ok: out.ok, output: out.output });
        results.push({
          toolResult: {
            toolUseId,
            content: [{ json: out.output }],
            status: out.ok ? "success" : "error",
          },
        });
      }
      messages.push({ role: "user", content: results });
      r = await callModel();
    }
    return r;
  };
  const gaveUp = () =>
    result(
      "error",
      "Sorry, I couldn't finish that answer. Please try rephrasing.",
      passages,
    );

  // Tool loop.
  let res = await runTools(await callModel());
  if (!res) return gaveUp();

  // Tool-required guard: personal figures on a calculator's topic must go
  // through that calculator. Nudge once unless the model is asking the user
  // a clarifying question; withhold only if it still states numbers.
  const required = requiredTool(q);
  const usedRequired = () => toolCalls.some((t) => t.name === required && t.ok);
  const answerText = () => textOf(res!.output.message);
  const statesNumbers = () => extractNumbers(answerText()).length > 0;
  const asksUser = () => answerText().includes("?");
  if (required && !usedRequired() && !asksUser()) {
    if (calls < MAX_MODEL_CALLS) {
      messages.push({
        role: "user",
        content: [
          {
            text: `The user gave their own figures, so this answer must come from the ${required} tool. Call ${required} now with the facts from the question. Do not quote limits or compute amounts yourself.`,
          },
        ],
      });
      res = await runTools(await callModel());
      if (!res) return gaveUp();
    }
    if (!usedRequired() && statesNumbers()) {
      return result("blocked", BLOCKED_ANSWER, passages, [
        `required tool ${required} not used`,
      ]);
    }
  }

  // Provenance guard with one repair attempt.
  const sources = [
    ...passages.map((p) => p.content),
    ...toolCalls.filter((t) => t.ok).map((t) => JSON.stringify(t.output)),
  ];
  let answer = textOf(res.output.message);
  let check = checkProvenance(answer, sources, q);
  if (!check.ok && calls < MAX_MODEL_CALLS) {
    const bad = check.unsupported.map((n) => n.raw).join(", ");
    messages.push({
      role: "user",
      content: [
        {
          text: `These numbers in your answer do not appear in the sources or tool results: ${bad}. Rewrite the answer without them, using only numbers from the sources or tools.`,
        },
      ],
    });
    res = await callModel();
    answer = textOf(res.output.message);
    check = checkProvenance(answer, sources, q);
  }
  if (!check.ok || res.stopReason === "tool_use") {
    return result(
      "blocked",
      BLOCKED_ANSWER,
      passages,
      // A short window around each blocked number, so logs show *why*
      // (e.g. a list marker the guard misread) without storing the draft.
      check.unsupported.map((n) =>
        answer
          .slice(Math.max(0, n.index - 20), n.index + n.raw.length + 12)
          .replace(/\s+/g, " "),
      ),
    );
  }
  return result("answered", answer, passages);
}
