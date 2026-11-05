/**
 * Eval runner. Scores gold cases and reports pass rates.
 *
 * - Tool evals call each tool through the MCP server (the same path the
 *   assistant uses) and compare the listed fields to hand-calculated values.
 * - Provenance evals check the guardrail blocks invented numbers and lets
 *   supported answers through.
 *
 * Assistant (LLM) evals plug into the same report later.
 */

import { checkProvenance } from "@/lib/assistant/provenance";

export interface ToolCase {
  id: string;
  question: string;
  tool: string;
  args: Record<string, unknown>;
  /** Dotted paths into the tool output. An array along the path matches if any item does. */
  expect: Record<string, unknown>;
  source: string;
}

export interface ProvenanceCase {
  id: string;
  answer: string;
  sources: string[];
  question?: string;
  ok: boolean;
}

export interface CaseResult {
  id: string;
  pass: boolean;
  detail?: string;
}

export interface SuiteResult {
  name: string;
  passed: number;
  total: number;
  rate: number;
  failures: CaseResult[];
}

export type CallTool = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export function getPath(obj: unknown, path: string): unknown[] {
  let values: unknown[] = [obj];
  for (const key of path.split(".")) {
    values = values.flatMap((v) => {
      if (Array.isArray(v)) {
        return v.map((item) => (item as Record<string, unknown>)?.[key]);
      }
      return v && typeof v === "object" ? [(v as Record<string, unknown>)[key]] : [];
    });
  }
  return values.flatMap((v) => (Array.isArray(v) ? v : [v]));
}

const equal = (a: unknown, b: unknown) =>
  typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) < 1e-6
    : JSON.stringify(a) === JSON.stringify(b);

function summarize(name: string, results: CaseResult[]): SuiteResult {
  const passed = results.filter((r) => r.pass).length;
  return {
    name,
    passed,
    total: results.length,
    rate: results.length ? passed / results.length : 1,
    failures: results.filter((r) => !r.pass),
  };
}

export async function runToolEvals(
  cases: ToolCase[],
  call: CallTool,
): Promise<SuiteResult> {
  const results: CaseResult[] = [];
  for (const c of cases) {
    try {
      const out = await call(c.tool, c.args);
      const misses = Object.entries(c.expect).filter(
        ([path, want]) => !getPath(out, path).some((got) => equal(got, want)),
      );
      results.push({
        id: c.id,
        pass: misses.length === 0,
        detail: misses.length
          ? misses
              .map(
                ([p, want]) =>
                  `${p}: want ${JSON.stringify(want)}, got ${JSON.stringify(getPath(out, p))}`,
              )
              .join("; ")
          : undefined,
      });
    } catch (e) {
      results.push({ id: c.id, pass: false, detail: `error: ${(e as Error).message}` });
    }
  }
  return summarize("tools", results);
}

export function runProvenanceEvals(cases: ProvenanceCase[]): SuiteResult {
  return summarize(
    "provenance",
    cases.map((c) => {
      const r = checkProvenance(c.answer, c.sources, c.question);
      return {
        id: c.id,
        pass: r.ok === c.ok,
        detail:
          r.ok === c.ok
            ? undefined
            : `want ok=${c.ok}, got ok=${r.ok} (unsupported: ${r.unsupported.map((u) => u.raw).join(", ") || "none"})`,
      };
    }),
  );
}

export function formatReport(suites: SuiteResult[]): string {
  const rows = suites.map(
    (s) => `| ${s.name} | ${s.passed}/${s.total} | ${(s.rate * 100).toFixed(1)}% |`,
  );
  const failures = suites.flatMap((s) =>
    s.failures.map((f) => `- **${s.name} / ${f.id}**: ${f.detail ?? "failed"}`),
  );
  return [
    "## Pikalo evals",
    "",
    "| Suite | Passed | Rate |",
    "| --- | --- | --- |",
    ...rows,
    "",
    failures.length ? "### Failures\n\n" + failures.join("\n") : "All cases pass.",
    "",
  ].join("\n");
}
