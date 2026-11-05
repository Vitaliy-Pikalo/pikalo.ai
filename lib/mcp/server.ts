/**
 * Pikalo MCP tool server.
 *
 * Exposes the tested calculation engines as MCP tools. The assistant gets
 * every number from these tools (never from the model), and any MCP client,
 * such as Claude Desktop, can use them directly.
 *
 * Each tool validates its input with zod, returns the engine's full output
 * as structured content, and includes the IRS sources it relied on.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkResidency } from "@/lib/residency";
import { checkFica } from "@/lib/fica";
import { checkRoth } from "@/lib/roth";

const year = z.number().int().min(1985).max(2100);
const days = z.number().int().min(0).max(366);
const dollars = z.number().min(0).max(10_000_000);

const asResult = (output: object) => ({
  content: [{ type: "text" as const, text: JSON.stringify(output) }],
  structuredContent: output as Record<string, unknown>,
});

export function createPikaloServer(): McpServer {
  const server = new McpServer({ name: "pikalo", version: "0.1.0" });

  server.registerTool(
    "check_tax_residency",
    {
      title: "U.S. tax residency check",
      description:
        "Applies the green card test and the substantial presence test (IRS Pub 519), including F/J/M/Q student and J/Q teacher exemptions. Returns resident, nonresident, needs_review or invalid, with reasons and flags for what it can't decide.",
      inputSchema: {
        taxYear: year,
        status: z.enum(["citizen", "green_card", "student", "teacher_trainee", "other"]),
        daysCurrent: days,
        daysPrior1: days,
        daysPrior2: days,
        firstYearInStatus: year.optional(),
        priorExemptHistory: z.boolean().optional(),
        foreignEmployer: z.boolean().optional(),
        statusChanged: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => asResult(checkResidency(args)),
  );

  server.registerTool(
    "check_fica_refund",
    {
      title: "FICA refund check for students",
      description:
        "Decides whether Social Security and Medicare tax was withheld in error from a nonresident F-1/J-1/M-1 student and estimates the refund from W-2 boxes 3, 4 and 6.",
      inputSchema: {
        taxYear: year,
        visa: z.enum(["f1", "j1_student", "m1", "j1_scholar", "dependent", "h1b_other"]),
        firstYearInStatus: year,
        job: z.enum(["on_campus", "cpt", "opt", "unauthorized"]),
        wages: dollars,
        socialSecurityWithheld: dollars,
        medicareWithheld: dollars,
        statusChanged: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => asResult(checkFica(args)),
  );

  server.registerTool(
    "roth_ira_limit",
    {
      title: "2026 Roth IRA contribution limit",
      description:
        "Computes the maximum 2026 Roth IRA contribution using IRS limits (IR-2025-111) and Pub 590-A Worksheet 2-2. Only tax year 2026 is supported.",
      inputSchema: {
        taxYear: z.literal(2026),
        filingStatus: z.enum([
          "single",
          "head_of_household",
          "married_joint",
          "married_separate",
          "qualifying_surviving_spouse",
        ]),
        age50OrOlder: z.boolean(),
        taxableCompensation: dollars,
        modifiedAgi: dollars,
        otherIraContributions: dollars,
        livedApartAllYear: z.boolean().optional(),
        spouseCompensation: dollars.optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => asResult(checkRoth(args)),
  );

  return server;
}
