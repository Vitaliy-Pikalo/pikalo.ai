/** Phase 2: local-cluster checks, without model calls or an eval Job. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRemoteToolRunner } from "@/services/answer-api/remote-tools";
import {
  formatReport,
  runToolEvals,
  runProvenanceEvals,
  type ToolCase,
  type ProvenanceCase,
} from "@/lib/evals/runner";

const kubeArgs = [
  "--kubeconfig",
  fileURLToPath(new URL("../../work/k8s/kubeconfig", import.meta.url)),
  "--context",
  "kind-pikalo-local",
  "--request-timeout=20s",
  "-n",
  "pikalo",
];
function kubectl(...args: string[]) {
  return execFileSync("kubectl", [...kubeArgs, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 210_000,
  }).trim();
}
const forwards: ChildProcess[] = [];
async function forward(service: string, port: number): Promise<string> {
  const child = spawn(
    "kubectl",
    [
      ...kubeArgs,
      "port-forward",
      `service/${service}`,
      `:${port}`,
      "--address=127.0.0.1",
    ],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  forwards.push(child);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Port-forward timed out: ${service}`)),
      30_000,
    );
    let output = "";
    child.stdout!.on("data", (chunk) => {
      output += String(chunk);
      const match = output.match(/Forwarding from 127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    child.stderr!.on("data", () => {});
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(`Port-forward exited: ${service}`));
    });
  });
}
async function status(base: string, path: string, expected: number) {
  assert.equal(
    (await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10_000) })).status,
    expected,
  );
  console.log(`PASS ${path} -> ${expected}`);
}
async function waitForAnswerEndpoints(ready: boolean) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const slices = JSON.parse(
      kubectl(
        "get",
        "endpointslices",
        "-l",
        "kubernetes.io/service-name=answer-api",
        "-o",
        "json",
      ),
    );
    const hasReady = slices.items.some(
      (slice: { endpoints: { conditions: { ready?: boolean } }[] }) =>
        slice.endpoints.some((endpoint) => endpoint.conditions.ready === true),
    );
    if (hasReady === ready) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Answer Service ready endpoint state did not become ${ready}`);
}

let calculatorScaledDown = false;
try {
  assert.equal(
    JSON.parse(kubectl("get", "hpa", "-o", "json")).items.length,
    0,
    "Run Phase 2 verification before enabling HPA; this check manually changes replicas.",
  );
  console.log(
    kubectl(
      "-n",
      "kube-system",
      "wait",
      "--for=condition=Ready",
      "pod",
      "--all",
      "--timeout=180s",
    ),
  );
  const config = JSON.parse(
    kubectl("get", "configmap", "answer-config", "-o", "json"),
  ).data;
  assert.equal(
    config.EMBED_URL,
    "http://127.0.0.1:1",
    "Verification requires fixture gateway configuration",
  );
  assert.equal(
    config.SUPABASE_URL,
    "http://127.0.0.1:1",
    "Verification requires fixture retrieval configuration",
  );
  console.log(kubectl("get", "deployments,services,pods"));
  const answerPods = JSON.parse(
    kubectl("get", "pods", "-l", "app=answer-api", "-o", "json"),
  ).items;
  assert.equal(answerPods.length, 1);
  const initialUid = answerPods[0].metadata.uid;
  const initialRestarts = answerPods[0].status.containerStatuses[0].restartCount;
  const answer = await forward("answer-api", 3000);
  const calc = await forward("mcp-calc", 3001);
  for (const base of [answer, calc]) {
    await status(base, "/healthz", 200);
    await status(base, "/readyz", 200);
  }
  const tools = createRemoteToolRunner(`${calc}/mcp`);
  assert.equal((await tools.specs()).length, 3);
  const toolCases = JSON.parse(
    await readFile(new URL("../../evals/gold-tools.json", import.meta.url), "utf8"),
  ).cases as ToolCase[];
  const provenanceCases = JSON.parse(
    await readFile(new URL("../../evals/gold-provenance.json", import.meta.url), "utf8"),
  ).cases as ProvenanceCase[];
  const suites = [
    await runToolEvals(toolCases, async (name, args) => {
      const result = await tools.call(name, args);
      assert.equal(result.ok, true);
      return result.output;
    }),
    runProvenanceEvals(provenanceCases),
  ];
  console.log(
    "Calculator cases execute in Kubernetes; provenance cases execute on the host.",
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
  console.log("PASS invalid answer input -> 400");

  calculatorScaledDown = true;
  console.log(kubectl("scale", "deployment/mcp-calc", "--replicas=0"));
  console.log(
    kubectl("wait", "--for=delete", "pod", "-l", "app=mcp-calc", "--timeout=90s"),
  );
  await waitForAnswerEndpoints(false);
  await status(answer, "/readyz", 503);
  await status(answer, "/healthz", 200);
  const duringOutage = JSON.parse(
    kubectl("get", "pods", "-l", "app=answer-api", "-o", "json"),
  ).items[0];
  assert.equal(duringOutage.metadata.uid, initialUid);
  assert.equal(duringOutage.status.containerStatuses[0].restartCount, initialRestarts);
  console.log(
    "PASS readiness removed answer Service endpoints; answer Pod was not restarted",
  );
  console.log(kubectl("scale", "deployment/mcp-calc", "--replicas=1"));
  calculatorScaledDown = false;
  console.log(kubectl("rollout", "status", "deployment/mcp-calc", "--timeout=180s"));
  await waitForAnswerEndpoints(true);
  await status(answer, "/readyz", 200);
  console.log("PASS answer Service endpoints recovered after calculator restart");
  console.log(kubectl("get", "deployments,pods"));
  console.log("Phase 2 verification passed; no cloud services called.");
} finally {
  try {
    if (calculatorScaledDown) kubectl("scale", "deployment/mcp-calc", "--replicas=1");
  } finally {
    await Promise.all(
      forwards.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolve();
              return;
            }
            child.once("exit", () => resolve());
            child.kill();
          }),
      ),
    );
  }
}
