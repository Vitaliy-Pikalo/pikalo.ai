import { describe, expect, it } from "vitest";
import {
  formatReport,
  getPath,
  runProvenanceEvals,
  runToolEvals,
  type ToolCase,
} from "@/lib/evals/runner";

describe("getPath", () => {
  it("reads nested fields and searches arrays", () => {
    const obj = { a: { b: 2 }, flags: [{ code: "x" }, { code: "y" }] };
    expect(getPath(obj, "a.b")).toEqual([2]);
    expect(getPath(obj, "flags.code")).toEqual(["x", "y"]);
    expect(getPath(obj, "missing.path")).toEqual([]);
  });
});

describe("runToolEvals", () => {
  const cases: ToolCase[] = [
    { id: "ok", question: "", tool: "t", args: {}, expect: { n: 3 }, source: "" },
    { id: "bad", question: "", tool: "t", args: {}, expect: { n: 4 }, source: "" },
    { id: "boom", question: "", tool: "explode", args: {}, expect: { n: 3 }, source: "" },
  ];
  const call = async (name: string) => {
    if (name === "explode") throw new Error("tool failed");
    return { n: 3 };
  };

  it("counts passes and records why a case failed", async () => {
    const r = await runToolEvals(cases, call);
    expect(r.passed).toBe(1);
    expect(r.total).toBe(3);
    expect(r.failures.map((f) => f.id)).toEqual(["bad", "boom"]);
    expect(r.failures[0].detail).toMatch(/want 4, got \[3\]/);
    expect(r.failures[1].detail).toMatch(/tool failed/);
  });
});

describe("runProvenanceEvals", () => {
  it("passes when the guardrail verdict matches the label", () => {
    const r = runProvenanceEvals([
      { id: "a", answer: "$100", sources: ["100"], ok: true },
      { id: "b", answer: "$100", sources: ["99"], ok: false },
      { id: "c", answer: "$100", sources: ["99"], ok: true },
    ]);
    expect(r.passed).toBe(2);
    expect(r.failures[0].id).toBe("c");
  });
});

describe("formatReport", () => {
  it("renders a markdown table and lists failures", () => {
    const md = formatReport([
      {
        name: "tools",
        passed: 9,
        total: 10,
        rate: 0.9,
        failures: [{ id: "x", pass: false, detail: "d" }],
      },
    ]);
    expect(md).toMatch(/\| tools \| 9\/10 \| 90\.0% \|/);
    expect(md).toMatch(/tools \/ x\*\*: d/);
  });
});
