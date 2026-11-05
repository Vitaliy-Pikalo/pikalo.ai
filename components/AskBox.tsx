"use client";

import { Fragment, useState, type FormEvent, type ReactNode } from "react";

interface Citation {
  n: number;
  title: string;
  section: string;
  url: string;
}

interface AskResponse {
  status: "answered" | "blocked" | "no_sources" | "error";
  answer: string;
  citations: Citation[];
  tools: { name: string; ok: boolean }[];
}

const EXAMPLES = [
  "I'm on an F-1 visa and got here in 2024. Am I a resident for tax purposes?",
  "My employer took Social Security tax from my on-campus job. Can I get it back?",
  "I'm single and earn $60,000. How much can I put in a Roth IRA in 2026?",
  "Do I need to report my bank account back home?",
];

const TOOL_LABELS: Record<string, string> = {
  check_tax_residency: "Residency calculator",
  check_fica_refund: "FICA refund calculator",
  roth_ira_limit: "Roth IRA calculator",
};

/** Renders "[2]" markers as links to the matching source. */
function withCitations(text: string, citations: Citation[]): ReactNode[] {
  const urls = new Map(citations.map((c) => [c.n, c.url]));
  return text.split(/(\[\d{1,2}\])/g).map((part, i) => {
    const n = Number(part.match(/^\[(\d{1,2})\]$/)?.[1]);
    const url = urls.get(n);
    return url ? (
      <a
        key={i}
        href={url}
        className="align-super text-xs font-semibold text-stamp underline-offset-2 hover:underline"
        aria-label={`source ${n}`}
      >
        [{n}]
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
}

export default function AskBox() {
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState("");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e?: FormEvent, q = question) {
    e?.preventDefault();
    const text = q.trim();
    if (!text || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    setAsked(text);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Something went wrong.");
      else setResult(body);
    } catch {
      setError("Couldn't reach Pikalo. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-[72ch]">
      <form onSubmit={submit} className="rounded-lg border border-line bg-surface p-4">
        <label htmlFor="question" className="font-semibold">
          Your question
        </label>
        <textarea
          id="question"
          rows={3}
          maxLength={1000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
          placeholder="e.g. Do I have to file anything if I had no income?"
          className="mt-2 w-full resize-y rounded-md border border-field-line bg-surface px-3 py-2 text-base text-ink placeholder:text-slate/60"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate">
            Don&apos;t include your SSN, ITIN, or account numbers.
          </p>
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="rounded-md bg-ink px-4 py-2 font-semibold text-surface disabled:opacity-50"
          >
            {loading ? "Checking IRS sources…" : "Ask"}
          </button>
        </div>
      </form>

      {!result && !loading && !error && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-slate">Try one of these</p>
          <ul className="mt-2 space-y-2">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  onClick={() => {
                    setQuestion(ex);
                    submit(undefined, ex);
                  }}
                  className="text-left text-ink underline decoration-line underline-offset-4 hover:decoration-ink"
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div aria-live="polite" className="mt-8">
        {loading && <p className="text-slate">Looking through IRS publications…</p>}
        {error && (
          <p className="rounded-md border border-amber bg-amber-soft px-4 py-3 text-amber">
            {error}
          </p>
        )}
        {result && (
          <article>
            <p className="text-sm text-slate">You asked: {asked}</p>
            {result.status !== "answered" && (
              <p className="mt-3 rounded-md border border-amber bg-amber-soft px-4 py-3 text-amber">
                {result.status === "blocked"
                  ? "Held back: an answer couldn't be fully verified against IRS sources."
                  : result.status === "no_sources"
                    ? "Outside what Pikalo covers."
                    : "Couldn't finish this one."}
              </p>
            )}
            <div className="mt-4 space-y-3 leading-relaxed whitespace-pre-line">
              {withCitations(result.answer, result.citations)}
            </div>

            {result.tools.some((t) => t.ok) && (
              <p className="mt-5 text-sm text-slate">
                Numbers calculated with:{" "}
                {result.tools
                  .filter((t) => t.ok)
                  .map((t) => TOOL_LABELS[t.name] ?? t.name)
                  .join(", ")}
              </p>
            )}

            {result.citations.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <h2 className="text-sm font-semibold">Sources</h2>
                <ol className="mt-2 space-y-1 text-sm">
                  {result.citations.map((c) => (
                    <li key={c.n}>
                      <span className="text-slate">[{c.n}]</span>{" "}
                      <a
                        href={c.url}
                        className="underline underline-offset-2 hover:text-stamp"
                      >
                        {c.title}
                      </a>
                      <span className="text-slate"> — {c.section}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
