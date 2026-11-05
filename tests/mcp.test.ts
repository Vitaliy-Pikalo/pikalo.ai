import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPikaloServer } from "@/lib/mcp/server";
import { checkResidency } from "@/lib/residency";
import { checkFica } from "@/lib/fica";
import { checkRoth } from "@/lib/roth";

let client: Client;

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createPikaloServer().connect(serverTransport);
  client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client.close();
});

describe("pikalo MCP server", () => {
  it("lists the three read-only tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "check_fica_refund",
      "check_tax_residency",
      "roth_ira_limit",
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it("residency tool returns exactly what the engine returns", async () => {
    const args = {
      taxYear: 2026,
      status: "student" as const,
      firstYearInStatus: 2021,
      daysCurrent: 200,
      daysPrior1: 365,
      daysPrior2: 365,
    };
    const res = await client.callTool({ name: "check_tax_residency", arguments: args });
    expect(res.structuredContent).toEqual(
      JSON.parse(JSON.stringify(checkResidency(args))),
    );
  });

  it("FICA tool returns the refund estimate", async () => {
    const args = {
      taxYear: 2026,
      visa: "f1" as const,
      firstYearInStatus: 2025,
      job: "opt" as const,
      wages: 48_000,
      socialSecurityWithheld: 2_976,
      medicareWithheld: 696,
    };
    const res = await client.callTool({ name: "check_fica_refund", arguments: args });
    expect((res.structuredContent as { refundEstimate: number }).refundEstimate).toBe(
      3_672,
    );
    expect(res.structuredContent).toEqual(JSON.parse(JSON.stringify(checkFica(args))));
  });

  it("Roth tool matches the engine", async () => {
    const args = {
      taxYear: 2026 as const,
      filingStatus: "single" as const,
      age50OrOlder: false,
      taxableCompensation: 60_000,
      modifiedAgi: 160_500,
      otherIraContributions: 0,
    };
    const res = await client.callTool({ name: "roth_ira_limit", arguments: args });
    expect((res.structuredContent as { maxContribution: number }).maxContribution).toBe(
      3_750,
    );
    expect(res.structuredContent).toEqual(JSON.parse(JSON.stringify(checkRoth(args))));
  });

  it("rejects invalid input instead of guessing", async () => {
    const res = await client.callTool({
      name: "check_tax_residency",
      arguments: {
        taxYear: 2026,
        status: "student",
        daysCurrent: -5,
        daysPrior1: 0,
        daysPrior2: 0,
      },
    });
    expect(res.isError).toBe(true);
  });

  it("Roth tool refuses years other than 2026", async () => {
    const res = await client.callTool({
      name: "roth_ira_limit",
      arguments: {
        taxYear: 2025,
        filingStatus: "single",
        age50OrOlder: false,
        taxableCompensation: 1,
        modifiedAgi: 1,
        otherIraContributions: 0,
      },
    });
    expect(res.isError).toBe(true);
  });
});
