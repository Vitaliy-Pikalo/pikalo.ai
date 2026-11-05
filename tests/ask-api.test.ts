import { describe, expect, it, vi } from "vitest";
import { createAskHandler, RATE_LIMIT_PER_MINUTE } from "@/lib/assistant/api";
import type { AskResult } from "@/lib/assistant/ask";

const ok: AskResult = {
  status: "answered",
  answer: "Hi [1]",
  citations: [{ n: 1, title: "Pub 519", section: "s", url: "https://www.irs.gov/x" }],
  toolCalls: [
    {
      name: "roth_ira_limit",
      input: { secret: 1 },
      ok: true,
      output: { maxContribution: 7500 },
    },
  ],
  unsupported: [],
  model: "m",
  usage: { inputTokens: 1, outputTokens: 1 },
};

const req = (body: unknown, ip = "1.2.3.4") =>
  new Request("https://pikalo.org/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/ask handler", () => {
  it("returns the answer, citations and tool names", async () => {
    const run = vi.fn(async () => ok);
    const res = await createAskHandler({ run })(req({ question: "roth?" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe("Hi [1]");
    expect(body.citations).toHaveLength(1);
    expect(body.tools).toEqual([
      { name: "roth_ira_limit", ok: true, output: { maxContribution: 7500 } },
    ]);
    expect(run).toHaveBeenCalledWith("roth?");
  });

  it("returns 400 for bad input without calling the model", async () => {
    const run = vi.fn(async () => ok);
    const h = createAskHandler({ run });
    for (const body of ["nope", {}, { question: "" }, { question: "x".repeat(1001) }]) {
      expect((await h(req(body))).status).toBe(400);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it("rate-limits per client IP", async () => {
    const run = vi.fn(async () => ok);
    const h = createAskHandler({ run, now: () => 0 });
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) {
      expect((await h(req({ question: "q" }, "9.9.9.9"))).status).toBe(200);
    }
    const limited = await h(req({ question: "q" }, "9.9.9.9"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await h(req({ question: "q" }, "8.8.8.8"))).status).toBe(200);
  });

  it("frees the limit after a minute", async () => {
    let t = 0;
    const h = createAskHandler({ run: vi.fn(async () => ok), now: () => t });
    for (let i = 0; i <= RATE_LIMIT_PER_MINUTE; i++)
      await h(req({ question: "q" }, "7.7.7.7"));
    t = 61_000;
    expect((await h(req({ question: "q" }, "7.7.7.7"))).status).toBe(200);
  });

  it("returns 503 with a generic message when the pipeline fails", async () => {
    const run = vi.fn(async () => {
      throw new Error("embed service returned 502 secret-detail");
    });
    const res = await createAskHandler({ run })(req({ question: "q" }));
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret-detail");
  });

  it("never logs the question text", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await createAskHandler({ run: vi.fn(async () => ok) })(
      req({ question: "my SSN is 123" }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("SSN");
    log.mockRestore();
  });
});
