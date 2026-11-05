/**
 * Scoring for live assistant evals (evals/assistant.mts). Each gold case
 * states what a good answer must do; scoring is deterministic string and
 * structure checks, no model-graded judgments.
 */

export interface AssistantCase {
  id: string;
  question: string;
  /** Acceptable statuses, e.g. ["answered"] or ["no_sources", "blocked"]. */
  expectStatus?: string[];
  /** A tool that must have been called successfully. */
  expectTool?: string;
  /** Each entry must appear (case-insensitive); "a|b" means either. */
  mustInclude?: string[];
  /** None of these may appear. */
  mustNotInclude?: string[];
  /** Substring that at least one citation URL must contain; "a|b" means either. */
  expectCitation?: string;
}

export interface AssistantOutput {
  status: string;
  answer: string;
  citations: { url: string }[];
  tools: { name: string; ok: boolean }[];
}

export interface CaseScore {
  id: string;
  pass: boolean;
  failures: string[];
}

export function scoreAssistantCase(c: AssistantCase, out: AssistantOutput): CaseScore {
  const failures: string[] = [];
  const answer = out.answer.toLowerCase();

  if (c.expectStatus && !c.expectStatus.includes(out.status)) {
    failures.push(`status ${out.status} not in [${c.expectStatus.join(", ")}]`);
  }
  if (c.expectTool && !out.tools.some((t) => t.name === c.expectTool && t.ok)) {
    failures.push(`tool ${c.expectTool} not called`);
  }
  for (const need of c.mustInclude ?? []) {
    const options = need.toLowerCase().split("|");
    if (!options.some((o) => answer.includes(o))) failures.push(`missing "${need}"`);
  }
  for (const bad of c.mustNotInclude ?? []) {
    if (answer.includes(bad.toLowerCase())) failures.push(`contains forbidden "${bad}"`);
  }
  const citeOptions = c.expectCitation?.split("|") ?? [];
  if (
    citeOptions.length &&
    !out.citations.some((x) => citeOptions.some((o) => x.url.includes(o)))
  ) {
    failures.push(`no citation matching ${c.expectCitation}`);
  }
  return { id: c.id, pass: failures.length === 0, failures };
}
