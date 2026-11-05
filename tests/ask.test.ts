import { describe, expect, it, vi } from "vitest";
import { ask, MAX_QUESTION_CHARS, type AskDeps } from "@/lib/assistant/ask";
import { createMcpToolRunner } from "@/lib/assistant/tools";
import { retrievePassages, type Passage } from "@/lib/assistant/retrieval";
import type { ConverseRequest, ConverseResponse } from "@/lib/assistant/embed-handler";

const PASSAGES: Passage[] = [
  {
    id: "spt:1",
    doc_id: "spt",
    doc_title: "IRS: Substantial Presence Test",
    section: "Substantial Presence Test",
    url: "https://www.irs.gov/spt#a",
    content:
      "You must be physically present for at least 31 days during the current year.",
    similarity: 0.82,
  },
  {
    id: "p519:9",
    doc_id: "p519",
    doc_title: "Publication 519",
    section: "Exempt individuals",
    url: "https://www.irs.gov/p519#b",
    content:
      "Students temporarily present under F, J, M or Q visas are exempt individuals.",
    similarity: 0.7,
  },
];

const text = (t: string): ConverseResponse => ({
  output: { message: { role: "assistant", content: [{ text: t }] } },
  stopReason: "end_turn",
  usage: { inputTokens: 100, outputTokens: 20 },
});

function deps(script: ConverseResponse[], overrides: Partial<AskDeps> = {}) {
  const converse = vi.fn(async (_r: ConverseRequest) => {
    const next = script.shift();
    if (!next) throw new Error("model called too many times");
    return next;
  });
  return {
    converse,
    deps: {
      embed: vi.fn(async () => [0.1]),
      retrieve: vi.fn(async () => PASSAGES),
      converse,
      tools: createMcpToolRunner(),
      modelId: "us.amazon.nova-micro-v1:0",
      ...overrides,
    } satisfies AskDeps,
  };
}

describe("ask", () => {
  it("answers from retrieved passages with citations", async () => {
    const { deps: d, converse } = deps([
      text(
        "You need at least 31 days of presence this year [1]. Students on F visas are usually exempt [2].",
      ),
    ]);
    const r = await ask("how many days for substantial presence?", d);
    expect(r.status).toBe("answered");
    expect(r.citations.map((c) => c.n)).toEqual([1, 2]);
    expect(r.citations[0].url).toBe("https://www.irs.gov/spt#a");
    const prompt = JSON.stringify(converse.mock.calls[0][0].messages);
    expect(prompt).toContain("[1] IRS: Substantial Presence Test");
  });

  it("runs MCP tools the model asks for and allows their numbers", async () => {
    const { deps: d, converse } = deps([
      {
        output: {
          message: {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "t1",
                  name: "roth_ira_limit",
                  input: {
                    taxYear: 2026,
                    filingStatus: "single",
                    age50OrOlder: false,
                    taxableCompensation: 40000,
                    modifiedAgi: 40000,
                    otherIraContributions: 0,
                  },
                },
              },
            ],
          },
        },
        stopReason: "tool_use",
      },
      text("You can contribute up to $7,500 to a Roth IRA for 2026."),
    ]);
    const r = await ask("I'm single and make $40,000. How much can I put in a Roth?", d);
    expect(r.status).toBe("answered");
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]).toMatchObject({ name: "roth_ira_limit", ok: true });
    // The tool result went back to the model as a toolResult block.
    const second = converse.mock.calls[1][0].messages;
    expect(JSON.stringify(second.at(-1))).toContain("toolResult");
  });

  it("asks the model to repair, then blocks, when numbers have no source", async () => {
    const { deps: d, converse } = deps([
      text("The limit is $9,999 this year."),
      text("The limit is still $9,999."),
    ]);
    const r = await ask("what is the limit?", d);
    expect(r.status).toBe("blocked");
    expect(r.unsupported[0]).toContain("$9,999");
    expect(r.unsupported[0]).toContain("limit is still");
    expect(r.answer).not.toContain("9,999");
    expect(converse).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(converse.mock.calls[1][0].messages.at(-1))).toContain("$9,999");
  });

  it("accepts a repaired answer", async () => {
    const { deps: d } = deps([
      text("You need 45 days [1]."),
      text("You need at least 31 days in the current year [1]."),
    ]);
    const r = await ask("how many days?", d);
    expect(r.status).toBe("answered");
    expect(r.answer).toContain("31 days");
  });

  it("reports a tool error to the model instead of crashing", async () => {
    const { deps: d } = deps([
      {
        output: {
          message: {
            role: "assistant",
            content: [
              {
                toolUse: {
                  toolUseId: "t1",
                  name: "roth_ira_limit",
                  input: { taxYear: 1999 },
                },
              },
            ],
          },
        },
        stopReason: "tool_use",
      },
      text("I couldn't compute that; please check IRS Publication 590-A [1]."),
    ]);
    const r = await ask("roth limit 1999?", d);
    expect(r.toolCalls[0].ok).toBe(false);
    expect(r.status).toBe("answered");
  });

  it("stops after a bounded number of tool rounds", async () => {
    const loop: ConverseResponse = {
      output: {
        message: {
          role: "assistant",
          content: [{ toolUse: { toolUseId: "x", name: "nope", input: {} } }],
        },
      },
      stopReason: "tool_use",
    };
    const { deps: d, converse } = deps(Array(10).fill(loop));
    const r = await ask("loop forever", d);
    expect(r.status).toBe("error");
    expect(converse.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it("rejects empty and oversized questions before any model call", async () => {
    const { deps: d, converse } = deps([]);
    await expect(ask("   ", d)).rejects.toThrow(/question/);
    await expect(ask("a".repeat(MAX_QUESTION_CHARS + 1), d)).rejects.toThrow(/question/);
    expect(converse).not.toHaveBeenCalled();
  });

  it("says so when nothing relevant was retrieved and no tool was used", async () => {
    const { deps: d, converse } = deps([], { retrieve: vi.fn(async () => []) });
    const r = await ask("what's the best pizza in NYC?", d);
    expect(r.status).toBe("no_sources");
    expect(converse).not.toHaveBeenCalled();
  });
});

describe("tool-required guard", () => {
  const rothCall: ConverseResponse = {
    output: {
      message: {
        role: "assistant",
        content: [
          {
            toolUse: {
              toolUseId: "t9",
              name: "roth_ira_limit",
              input: {
                taxYear: 2026,
                filingStatus: "single",
                age50OrOlder: false,
                taxableCompensation: 60000,
                modifiedAgi: 60000,
                otherIraContributions: 0,
              },
            },
          },
        ],
      },
    },
    stopReason: "tool_use",
  };
  const rothPassages: Passage[] = [
    { ...PASSAGES[0], content: "For 2025 the contribution limit is $7,000." },
  ];

  it("makes the model use the calculator when the user gave their own numbers", async () => {
    // Seen live: Nova Lite answered $7,000 (the 2025 limit, present in a
    // source) instead of calling the tool, which returns $7,500 for 2026.
    const { deps: d, converse } = deps(
      [
        text("You can contribute up to $7,000 for 2026 [1]."),
        rothCall,
        text("You can contribute up to $7,500 for 2026."),
      ],
      { retrieve: vi.fn(async () => rothPassages) },
    );
    const r = await ask(
      "I'm single and earn $60,000. How much can I put in a Roth IRA?",
      d,
    );
    expect(r.status).toBe("answered");
    expect(r.answer).toContain("$7,500");
    expect(r.toolCalls[0]).toMatchObject({ name: "roth_ira_limit", ok: true });
    expect(JSON.stringify(converse.mock.calls[1][0].messages.at(-1))).toContain(
      "roth_ira_limit",
    );
  });

  it("withholds the answer if the model still won't use the calculator", async () => {
    const { deps: d } = deps([text("Up to $7,000 [1]."), text("Still $7,000 [1].")], {
      retrieve: vi.fn(async () => rothPassages),
    });
    const r = await ask(
      "I'm single and earn $60,000. How much can I put in a Roth IRA?",
      d,
    );
    expect(r.status).toBe("blocked");
    expect(r.answer).not.toContain("7,000");
  });

  it("nudges toward the right calculator even when the answer has no numbers", async () => {
    // Seen live: Lite called the residency tool for a W-2 FICA question and
    // answered without the refund amount.
    const ficaCall: ConverseResponse = {
      output: {
        message: {
          role: "assistant",
          content: [
            {
              toolUse: {
                toolUseId: "f1",
                name: "check_fica_refund",
                input: {
                  taxYear: 2026,
                  visa: "f1",
                  firstYearInStatus: 2024,
                  job: "on_campus",
                  wages: 10000,
                  socialSecurityWithheld: 620,
                  medicareWithheld: 145,
                },
              },
            },
          ],
        },
      },
      stopReason: "tool_use",
    };
    const { deps: d, converse } = deps([
      text("You're exempt, so ask your employer for a refund."),
      ficaCall,
      text("You can likely get back $765. Ask your employer first."),
    ]);
    const r = await ask(
      "F-1 since 2024, on-campus job, W-2 shows $620 Social Security and $145 Medicare. Refund?",
      d,
    );
    expect(r.answer).toContain("$765");
    expect(converse).toHaveBeenCalledTimes(3);
  });

  it("lets a no-number answer through if the model still skips the tool", async () => {
    const { deps: d } = deps([
      text("You're exempt, so ask your employer for a refund."),
      text("You're exempt; ask your employer."),
    ]);
    const r = await ask("F-1, W-2 shows $620 Social Security withheld. Refund?", d);
    expect(r.status).toBe("answered");
  });

  it("doesn't nudge when the model asks the user a clarifying question", async () => {
    const { deps: d, converse } = deps([
      text("What year did you first arrive on your F-1 visa?"),
    ]);
    const r = await ask("My W-2 shows $620 Social Security withheld. Refund?", d);
    expect(r.status).toBe("answered");
    expect(converse).toHaveBeenCalledTimes(1);
  });

  it("doesn't require a tool for general questions without personal numbers", async () => {
    const { deps: d, converse } = deps([text("A Roth IRA grows tax-free [1].")]);
    const r = await ask("What is a Roth IRA?", d);
    expect(r.status).toBe("answered");
    expect(converse).toHaveBeenCalledTimes(1);
  });
});

describe("model output cleanup", () => {
  it("strips <thinking> blocks from the answer, closed or not", async () => {
    const { deps: d } = deps([
      text(
        "<thinking>The user wants days. Source 1 says 31.</thinking>You need at least 31 days [1].",
      ),
    ]);
    const r = await ask("how many days?", d);
    expect(r.answer).toBe("You need at least 31 days [1].");
    const { deps: d2 } = deps([text("You need 31 days [1].<thinking>unfinished")]);
    expect((await ask("how many days?", d2)).answer).toBe("You need 31 days [1].");
  });

  it("drops a leading 'Final Answer:' label", async () => {
    const { deps: d } = deps([text("Final Answer: You need at least 31 days [1].")]);
    expect((await ask("how many days?", d)).answer).toBe(
      "You need at least 31 days [1].",
    );
  });

  it("ignores numbers inside thinking when checking provenance", async () => {
    const { deps: d } = deps([
      text("<thinking>maybe 999 days?</thinking>You need at least 31 days [1]."),
    ]);
    expect((await ask("how many days?", d)).status).toBe("answered");
  });
});

describe("system prompt", () => {
  it("tells the model when to use tools and to hide reasoning", async () => {
    const { SYSTEM_PROMPT } = await import("@/lib/assistant/ask");
    expect(SYSTEM_PROMPT).toMatch(/check_fica_refund/);
    expect(SYSTEM_PROMPT).toMatch(/general question/i);
    expect(SYSTEM_PROMPT).toMatch(/thinking/i);
  });
});

describe("tool runner", () => {
  it("describes every tool input field so the model fills them correctly", async () => {
    const specs = await createMcpToolRunner().specs();
    for (const s of specs) {
      const props = (
        s.toolSpec.inputSchema.json as {
          properties: Record<string, { description?: string }>;
        }
      ).properties;
      for (const [field, schema] of Object.entries(props)) {
        expect(schema.description, `${s.toolSpec.name}.${field}`).toBeTruthy();
      }
    }
  });

  it("exposes the three MCP tools as Bedrock tool specs", async () => {
    const specs = await createMcpToolRunner().specs();
    expect(specs.map((s) => s.toolSpec.name).sort()).toEqual([
      "check_fica_refund",
      "check_tax_residency",
      "roth_ira_limit",
    ]);
    expect(specs[0].toolSpec.inputSchema.json).toHaveProperty("properties");
  });
});

describe("retrievePassages", () => {
  it("calls match_passages with the publishable key and validates rows", async () => {
    const fetchFn = vi.fn(async (_url: string, _init: RequestInit) =>
      Response.json([...PASSAGES, { bad: true }]),
    );
    const rows = await retrievePassages([0.1, 0.2], {
      url: "https://x.supabase.co",
      key: "sb_publishable_abc",
      fetchFn,
    });
    expect(rows).toHaveLength(2);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/match_passages");
    expect((init.headers as Record<string, string>).apikey).toBe("sb_publishable_abc");
    expect(JSON.parse(init.body as string)).toMatchObject({ match_count: 6 });
  });

  it("throws on HTTP errors", async () => {
    const fetchFn = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(
      retrievePassages([0.1], { url: "https://x", key: "k", fetchFn }),
    ).rejects.toThrow(/500/);
  });
});

describe("requiredTool routing on the gold questions", async () => {
  const { requiredTool } = await import("@/lib/assistant/ask");
  const gold = (await import("../evals/gold-assistant.json")).default.cases as {
    id: string;
    question: string;
  }[];
  const q = (id: string) => gold.find((c) => c.id === id)!.question;

  it.each([
    ["roth-single-60k", "roth_ira_limit"],
    ["roth-single-phaseout", "roth_ira_limit"],
    ["fica-f1-oncampus", "check_fica_refund"],
    ["residency-f1-2024", "check_tax_residency"],
    ["spt-31-days", null],
    ["fbar-threshold", null],
    ["form-8843", null],
    ["treaty-p901", null],
    ["out-of-scope", null],
  ])("%s → %s", (id, tool) => {
    expect(requiredTool(q(id))).toBe(tool);
  });
});
