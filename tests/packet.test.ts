import { describe, expect, it } from "vitest";
import { buildPacket, type PacketInput } from "@/lib/packet";

const base: PacketInput = {
  fullName: "Ana Lee",
  taxYear: 2026,
  visaLabel: "F-1",
  jobLabel: "OPT",
  employerName: "Acme Corp",
  employerAddress: "1 Main St, Pittsburgh, PA 15213",
  socialSecurityWithheld: 2_976,
  medicareWithheld: 696,
  employerRefunded: 0,
  employerStatement: "none",
};

const build = (o: Partial<PacketInput>) => buildPacket({ ...base, ...o });

describe("buildPacket", () => {
  it("claims the full amount when the employer refunded nothing", () => {
    const p = build({});
    expect(p.claimAmount).toBe(3_672);
    expect(p.form843.find((l) => l.line === "2")?.value).toBe("$3,672.00");
    expect(p.form843.find((l) => l.line === "1")?.value).toBe("01/01/2026 to 12/31/2026");
  });

  it("subtracts any amount the employer already refunded", () => {
    const p = build({ employerRefunded: 672 });
    expect(p.claimAmount).toBe(3_000);
    expect(p.form8316.find((q) => q.q === "1")?.a).toBe("Yes");
    expect(p.form8316.find((q) => q.q === "2")?.a).toBe("$672.00");
  });

  it("puts the employer on question 9", () => {
    expect(build({}).form8316.find((q) => q.q === "9")?.a).toBe(
      "Acme Corp, 1 Main St, Pittsburgh, PA 15213",
    );
  });

  it("explanation names the exemption, visa, amounts and year", () => {
    const e = build({}).explanation;
    expect(e).toMatch(/3121\(b\)\(19\)/);
    expect(e).toMatch(/F-1/);
    expect(e).toMatch(/\$2,976\.00/);
    expect(e).toMatch(/\$696\.00/);
    expect(e).toMatch(/2026/);
  });

  it("adds an own-statement note when there is no employer statement", () => {
    expect(build({ employerStatement: "none" }).checklist.join(" ")).toMatch(
      /own signed statement/,
    );
    expect(build({ employerStatement: "have" }).checklist.join(" ")).toMatch(
      /statement from your employer/,
    );
  });

  it("asks for the EAD only for practical training", () => {
    expect(build({ jobLabel: "OPT" }).checklist.join(" ")).toMatch(/EAD/);
    expect(build({ jobLabel: "on-campus work" }).checklist.join(" ")).not.toMatch(/EAD/);
  });

  it("never asks for or prints an SSN", () => {
    const p = build({});
    const ssnLine = p.form843.find((l) => l.label.includes("SSN"));
    expect(ssnLine?.value).toMatch(/write it yourself/i);
  });

  it("employer email includes the amounts and a request to stop withholding", () => {
    const m = build({}).employerEmail;
    expect(m.subject).toMatch(/FICA/);
    expect(m.body).toMatch(/\$3,672\.00/);
    expect(m.body).toMatch(/stop withholding/i);
  });

  it("claim never goes negative", () => {
    expect(build({ employerRefunded: 99_999 }).claimAmount).toBe(0);
  });
});
