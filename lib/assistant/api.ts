/**
 * HTTP handling for POST /api/ask, separate from the route file so it can be
 * tested without Next.js. Validates input, rate-limits per IP, never logs the
 * question text (it may contain personal details), and hides internal errors.
 */

import { MAX_QUESTION_CHARS, type AskResult } from "@/lib/assistant/ask";

export const RATE_LIMIT_PER_MINUTE = 8;
const WINDOW_MS = 60_000;

export interface AskHandlerDeps {
  run(question: string): Promise<AskResult>;
  now?: () => number;
}

export function createAskHandler(deps: AskHandlerDeps) {
  // Per-instance limiter: a cheap first line of defense. Serverless instances
  // don't share memory, so this bounds each instance, not the whole fleet.
  const hits = new Map<string, number[]>();
  const now = deps.now ?? Date.now;

  return async function POST(request: Request): Promise<Response> {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const t = now();
    const recent = (hits.get(ip) ?? []).filter((x) => t - x < WINDOW_MS);
    if (recent.length >= RATE_LIMIT_PER_MINUTE) {
      const retry = Math.ceil((WINDOW_MS - (t - recent[0])) / 1000);
      return Response.json(
        { error: "Too many questions. Please wait a minute." },
        { status: 429, headers: { "retry-after": String(retry) } },
      );
    }

    let question: unknown;
    try {
      question = (await request.json())?.question;
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
    if (
      typeof question !== "string" ||
      !question.trim() ||
      question.length > MAX_QUESTION_CHARS
    ) {
      return Response.json(
        { error: `Ask a question between 1 and ${MAX_QUESTION_CHARS} characters.` },
        { status: 400 },
      );
    }

    recent.push(t);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear(); // bound memory

    const started = now();
    try {
      const r = await deps.run(question);
      console.log(
        JSON.stringify({
          event: "ask",
          status: r.status,
          model: r.model,
          questionChars: question.length,
          tools: r.toolCalls.map((c) => `${c.name}:${c.ok ? "ok" : "err"}`),
          citations: r.citations.length,
          // Model-invented numbers only (numbers from the question are always
          // allowed), so this never echoes user data.
          unsupported: r.unsupported.slice(0, 10),
          usage: r.usage,
          ms: now() - started,
        }),
      );
      return Response.json({
        status: r.status,
        answer: r.answer,
        citations: r.citations,
        tools: r.toolCalls.map(({ name, ok, output }) => ({ name, ok, output })),
      });
    } catch (e) {
      console.error(JSON.stringify({ event: "ask_failed", error: String(e) }));
      return Response.json(
        { error: "The assistant is unavailable right now. Please try again shortly." },
        { status: 503 },
      );
    }
  };
}
