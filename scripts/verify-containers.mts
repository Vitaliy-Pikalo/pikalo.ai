/** Phase 1 Docker smoke/eval check. No AWS calls or real credentials. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRemoteToolRunner } from "@/services/answer-api/remote-tools";
import {
  formatReport,
  runToolEvals,
  runProvenanceEvals,
  type ToolCase,
  type ProvenanceCase,
} from "@/lib/evals/runner";

const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  }).trim();
const network = `pikalo-verify-${randomUUID().slice(0, 8)}`;
const containers: string[] = [];
let createdNetwork = false;

function start(name: string, port: number, image: string, env: string[] = []) {
  docker(
    "run",
    "--rm",
    "-d",
    "--network",
    network,
    "--name",
    name,
    "-p",
    `127.0.0.1::${port}`,
    ...env.flatMap((value) => ["-e", value]),
    image,
  );
  containers.push(name);
  const published = docker("port", name, `${port}/tcp`);
  assert.match(published, /^127\.0\.0\.1:\d+$/);
  return `http://${published}`;
}

async function expectStatus(base: string, path: string, status: number) {
  assert.equal(
    (await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8_000) })).status,
    status,
  );
  console.log(`PASS ${path} -> ${status}`);
}

async function waitReady(base: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await fetch(`${base}/readyz`, { signal: AbortSignal.timeout(2_000) })).ok)
        return;
    } catch {
      /* The process may still be starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Readiness timed out: ${base}`);
}

try {
  docker("network", "create", network);
  createdNetwork = true;
  const calcName = `${network}-calc`;
  const calc = start(calcName, 3001, "pikalo-mcp-calc:local");
  const answer = start(`${network}-answer`, 3000, "pikalo-answer-api:local", [
    `MCP_CALC_URL=http://${calcName}:3001/mcp`,
    "SUPABASE_URL=http://127.0.0.1:1",
    "SUPABASE_PUBLISHABLE_KEY=fixture",
    "EMBED_URL=http://127.0.0.1:1",
    "EMBED_SIGNING_SECRET=fixture",
  ]);
  await waitReady(calc);
  await waitReady(answer);
  for (const [name, base] of [
    ["mcp-calc", calc],
    ["answer-api", answer],
  ]) {
    console.log(name);
    await expectStatus(base, "/healthz", 200);
    await expectStatus(base, "/readyz", 200);
  }
  const tools = createRemoteToolRunner(`${calc}/mcp`);
  assert.equal((await tools.specs()).length, 3);
  const toolCases = JSON.parse(
    await readFile(new URL("../evals/gold-tools.json", import.meta.url), "utf8"),
  ).cases as ToolCase[];
  const provenanceCases = JSON.parse(
    await readFile(new URL("../evals/gold-provenance.json", import.meta.url), "utf8"),
  ).cases as ProvenanceCase[];
  const suites = [
    await runToolEvals(toolCases, async (name, input) => {
      const result = await tools.call(name, input);
      assert.equal(result.ok, true);
      return result.output;
    }),
    runProvenanceEvals(provenanceCases),
  ];
  console.log(
    "Calculator cases execute in Docker; provenance cases execute on the host.",
  );
  console.log(formatReport(suites));
  assert.ok(toolCases.length > 0 && provenanceCases.length > 0);
  assert.equal(suites[0].total, toolCases.length);
  assert.equal(suites[1].total, provenanceCases.length);
  assert.ok(suites.every((suite) => suite.rate === 1));
  assert.equal(
    (await fetch(`${answer}/api/ask`, { method: "POST", body: "{}" })).status,
    400,
  );
  console.log("PASS answer-api invalid input -> 400");
  docker("stop", "--time", "10", calcName);
  containers.splice(containers.indexOf(calcName), 1);
  console.log("Calculator stopped: checking dependency failure.");
  await expectStatus(answer, "/readyz", 503);
  await expectStatus(answer, "/healthz", 200);
  console.log("Container verification passed; no cloud services called.");
} finally {
  let cleanupFailed = false;
  for (const name of containers.reverse()) {
    try {
      docker("stop", "--time", "10", name);
    } catch {
      cleanupFailed = true;
      console.error(`Could not stop ${name}`);
    }
  }
  if (createdNetwork) {
    try {
      docker("network", "rm", network);
    } catch {
      cleanupFailed = true;
      console.error(`Could not remove ${network}`);
    }
  }
  if (cleanupFailed) process.exitCode = 1;
  else console.log("Cleanup complete: verification containers and network removed.");
}
