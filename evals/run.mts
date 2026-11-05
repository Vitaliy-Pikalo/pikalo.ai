/**
 * Runs every eval suite and fails (exit 1) if any suite is below its
 * threshold. Used by CI on every push.
 *
 *   npm run eval
 */
import { readFile, appendFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createPikaloServer } from "@/lib/mcp/server";
import {
  formatReport,
  runProvenanceEvals,
  runToolEvals,
  type ProvenanceCase,
  type ToolCase,
} from "@/lib/evals/runner";

const THRESHOLDS: Record<string, number> = { tools: 1, provenance: 1 };

const load = async <T,>(file: string) =>
  JSON.parse(await readFile(new URL(file, import.meta.url), "utf8")).cases as T[];

const [clientT, serverT] = InMemoryTransport.createLinkedPair();
await createPikaloServer().connect(serverT);
const client = new Client({ name: "evals", version: "1" });
await client.connect(clientT);

const tools = await runToolEvals(
  await load<ToolCase>("./gold-tools.json"),
  async (name, args) => {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) throw new Error(JSON.stringify(res.content));
    return res.structuredContent;
  },
);
const provenance = runProvenanceEvals(
  await load<ProvenanceCase>("./gold-provenance.json"),
);
await client.close();

const suites = [tools, provenance];
const report = formatReport(suites);
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report);

const failing = suites.filter((s) => s.rate < (THRESHOLDS[s.name] ?? 1));
if (failing.length) {
  console.error(`Below threshold: ${failing.map((s) => s.name).join(", ")}`);
  process.exit(1);
}
