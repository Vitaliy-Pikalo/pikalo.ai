import { describe, expect, it } from "vitest";
import { parseReviewForm } from "@/lib/review/form";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const ID = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";

describe("parseReviewForm", () => {
  it("accepts a decision with an optional trimmed note", () => {
    expect(
      parseReviewForm(fd({ id: ID, decision: "rejected", note: "  wrong year  " })),
    ).toEqual({
      ok: true,
      id: ID,
      status: "rejected",
      note: "wrong year",
    });
    expect(parseReviewForm(fd({ id: ID, decision: "approved" }))).toMatchObject({
      ok: true,
      status: "approved",
      note: null,
    });
  });

  it.each([
    [{ id: "not-a-uuid", decision: "approved" }],
    [{ id: ID, decision: "open" }],
    [{ id: ID, decision: "delete" }],
    [{ id: ID, decision: "approved", note: "x".repeat(2001) }],
  ])("rejects %j", (o) => {
    expect(parseReviewForm(fd(o)).ok).toBe(false);
  });
});
