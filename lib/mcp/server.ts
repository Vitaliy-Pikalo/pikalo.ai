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
        taxYear: year.describe("Tax year being checked, e.g. 2026"),
        status: z
          .enum(["citizen", "green_card", "student", "teacher_trainee", "other"])
          .describe(
            "student = F, J (student), M or Q visa; teacher_trainee = J or Q teacher, trainee or researcher; other = H-1B, B-1/B-2, etc.",
          ),
        daysCurrent: days.describe("Days physically in the U.S. during the tax year"),
        daysPrior1: days.describe("Days in the U.S. during the year before the tax year"),
        daysPrior2: days.describe("Days in the U.S. two years before the tax year"),
        firstYearInStatus: year
          .optional()
          .describe(
            "Calendar year the person first arrived in the U.S. in this visa status (needed for students and teachers)",
          ),
        priorExemptHistory: z
          .boolean()
          .optional()
          .describe(
            "True if they were exempt as a student/teacher in earlier years under a different visa",
          ),
        foreignEmployer: z
          .boolean()
          .optional()
          .describe("Teachers/trainees only: paid entirely by a foreign employer"),
        statusChanged: z
          .boolean()
          .optional()
          .describe("True if their visa status changed during the tax year"),
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
        taxYear: year.describe("Year the wages were paid, e.g. 2026"),
        visa: z
          .enum(["f1", "j1_student", "m1", "j1_scholar", "dependent", "h1b_other"])
          .describe(
            "Visa type; dependent = F-2/J-2/M-2; h1b_other = H-1B or other work visa",
          ),
        firstYearInStatus: year.describe(
          "Calendar year they first arrived in the U.S. in this student status",
        ),
        job: z
          .enum(["on_campus", "cpt", "opt", "unauthorized"])
          .describe("on_campus = job at the school; cpt/opt = practical training"),
        wages: dollars.describe("W-2 box 1 or box 3 wages in dollars"),
        socialSecurityWithheld: dollars.describe(
          "W-2 box 4: Social Security tax withheld",
        ),
        medicareWithheld: dollars.describe("W-2 box 6: Medicare tax withheld"),
        statusChanged: z
          .boolean()
          .optional()
          .describe("True if their visa status changed during the year"),
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
        taxYear: z.literal(2026).describe("Must be 2026"),
        filingStatus: z
          .enum([
            "single",
            "head_of_household",
            "married_joint",
            "married_separate",
            "qualifying_surviving_spouse",
          ])
          .describe("How they file their federal tax return"),
        age50OrOlder: z.boolean().describe("True if age 50 or older by the end of 2026"),
        taxableCompensation: dollars.describe("Wages, salary and self-employment income"),
        modifiedAgi: dollars.describe(
          "Modified adjusted gross income; use their total income if they don't know it",
        ),
        otherIraContributions: dollars.describe(
          "Amount already put in traditional IRAs for 2026; 0 if none",
        ),
        livedApartAllYear: z
          .boolean()
          .optional()
          .describe("Married filing separately only: lived apart from spouse all year"),
        spouseCompensation: dollars
          .optional()
          .describe("Married filing jointly only: spouse's taxable compensation"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (args) => asResult(checkRoth(args)),
  );

  return server;
}
