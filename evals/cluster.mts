/** All deterministic gold cases run inside the Job; calculator calls use Service DNS. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRemoteToolRunner } from "@/services/answer-api/remote-tools";
import {
  formatReport,
  runToolEvals,
  runProvenanceEvals,
  type ToolCase,
  type ProvenanceCase,
} from "@/lib/evals/runner";

const mcpUrl = process.env.MCP_CALC_URL;
const answerUrl = process.env.ANSWER_API_URL;
assert.ok(mcpUrl && answerUrl, "MCP_CALC_URL and ANSWER_API_URL must be set");
const load = async <T,>(name: string) => {
  const { cases } = JSON.parse(await readFile(new URL(name, import.meta.url), "utf8"));
  assert.ok(
    Array.isArray(cases) && cases.length > 0,
    `Empty or invalid eval fixture: ${name}`,
  );
  return cases as T[];
};
const [toolCases, provenanceCases] = await Promise.all([
  load<ToolCase>("./gold-tools.json"),
  load<ProvenanceCase>("./gold-provenance.json"),
]);
assert.ok(
  toolCases.every((test) => Object.keys(test.expect).length > 0),
  "Each calculator case needs assertions",
);
for (const path of ["/healthz", "/readyz"]) {
  const response: Response = await fetch(`${answerUrl}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200, `answer-api ${path}`);
  console.log(`PASS answer-api ${path} -> 200`);
}
const invalid = await fetch(`${answerUrl}/api/ask`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
  signal: AbortSignal.timeout(10_000),
});
assert.equal(
  invalid.status,
  400,
  "Invalid answer input must be rejected without a model call",
);
console.log("PASS answer-api invalid input -> 400");
const tools = createRemoteToolRunner(mcpUrl);
const suites = [
  await runToolEvals(toolCases, async (name, input) => {
    const result = await tools.call(name, input);
    if (!result.ok) throw new Error("Remote calculator call failed");
    return result.output;
  }),
  runProvenanceEvals(provenanceCases),
];
console.log(
  "All gold cases execute inside this Kubernetes Job; tools use the deployed MCP Service.",
);
console.log(formatReport(suites));
if (suites.some((suite) => suite.passed !== suite.total)) process.exitCode = 1;
