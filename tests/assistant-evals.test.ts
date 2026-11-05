import { describe, expect, it } from "vitest";
import { scoreAssistantCase, type AssistantCase } from "@/lib/evals/assistant";

const base = {
  status: "answered" as const,
  answer: "You can put in up to $7,500 for 2026 [1].",
  citations: [
    {
      n: 1,
      title: "Pub 590-A",
      section: "s",
      url: "https://www.irs.gov/publications/p590a#x",
    },
  ],
  tools: [{ name: "roth_ira_limit", ok: true }],
};

const kase: AssistantCase = {
  id: "roth-single",
  question: "q",
  expectStatus: ["answered"],
  expectTool: "roth_ira_limit",
  mustInclude: ["7,500"],
  mustNotInclude: ["$8,000"],
  expectCitation: "p590a",
};

describe("scoreAssistantCase", () => {
  it("passes when every expectation holds", () => {
    expect(scoreAssistantCase(kase, base)).toEqual({
      id: "roth-single",
      pass: true,
      failures: [],
    });
  });

  it("lists each failed expectation", () => {
    const r = scoreAssistantCase(kase, {
      status: "blocked",
      answer: "It's $8,000.",
      citations: [],
      tools: [],
    });
    expect(r.pass).toBe(false);
    expect(r.failures).toEqual([
      "status blocked not in [answered]",
      "tool roth_ira_limit not called",
      'missing "7,500"',
      'contains forbidden "$8,000"',
      "no citation matching p590a",
    ]);
  });

  it("treats mustInclude alternatives separated by | as any-of", () => {
    const r = scoreAssistantCase(
      { id: "x", question: "q", mustInclude: ["nonresident|non-resident"] },
      { ...base, answer: "You're a non-resident alien." },
    );
    expect(r.pass).toBe(true);
  });

  it("is case-insensitive", () => {
    const r = scoreAssistantCase(
      { id: "x", question: "q", mustInclude: ["form 8843"] },
      { ...base, answer: "File FORM 8843." },
    );
    expect(r.pass).toBe(true);
  });

  it("accepts any of several citation sources", () => {
    const r = scoreAssistantCase(
      { id: "x", question: "q", expectCitation: "spt|p590a" },
      base,
    );
    expect(r.pass).toBe(true);
  });
});
