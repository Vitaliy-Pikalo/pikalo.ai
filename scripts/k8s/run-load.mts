/** Real HTTP load across Service DNS; model/retrieval are strictly local fixtures. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";

const { values } = parseArgs({
  options: {
    rate: { type: "string", default: "20" },
    seconds: { type: "string", default: "180" },
    label: { type: "string", default: "measured" },
  },
});
const rate = Number(values.rate),
  seconds = Number(values.seconds),
  label = values.label!;
assert.ok(Number.isInteger(rate) && rate >= 1 && rate <= 100);
assert.ok(Number.isInteger(seconds) && seconds >= 10 && seconds <= 600);
assert.match(label, /^[a-z0-9-]{1,30}$/);
const kubeArgs = [
  "--kubeconfig",
  fileURLToPath(new URL("../../work/k8s/kubeconfig", import.meta.url)),
  "--context",
  "kind-pikalo-local",
  "--request-timeout=20s",
  "-n",
  "pikalo",
];
const kubectl = (args: string[], input?: unknown) =>
  execFileSync("kubectl", [...kubeArgs, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 210_000,
    ...(input === undefined ? {} : { input: JSON.stringify(input) }),
  }).trim();
const output = new URL(`../../work/load/${label}/`, import.meta.url);
await mkdir(output, { recursive: true });
// A failed rerun must never leave a previous run's successful report in place.
for (const artifact of [
  "report.json",
  "summary.json",
  "k6.log",
  "pods.json",
  "error.txt",
])
  await rm(new URL(artifact, output), { force: true });
process.on("uncaughtException", (error) => {
  void writeFile(new URL("error.txt", output), error.stack ?? String(error)).finally(
    () => {
      console.error(error);
      process.exit(1);
    },
  );
});
const readJson = (args: string[]) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse(kubectl(args));
    } catch (error) {
      if (attempt >= 2) throw error;
      console.error(`Retrying Kubernetes observation: ${String(error)}`);
    }
  }
};
const environment = {
  kubernetes: JSON.parse(kubectl(["version", "-o", "json"])).serverVersion.gitVersion,
  node: kubectl(["exec", "deployment/answer-api", "--", "node", "--version"]),
  dockerVersion: execFileSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim(),
  dockerCpus: Number(
    execFileSync("docker", ["info", "--format", "{{.NCPU}}"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
  ),
  dockerMemoryBytes: Number(
    execFileSync("docker", ["info", "--format", "{{.MemTotal}}"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim(),
  ),
};
const config = JSON.parse(
  kubectl(["get", "configmap", "answer-config", "-o", "json"]),
).data;
assert.equal(config.EMBED_URL, "http://127.0.0.1:1");
assert.equal(config.SUPABASE_URL, "http://127.0.0.1:1");
const deployment = JSON.parse(kubectl(["get", "deployment", "answer-api", "-o", "json"]));
assert.equal(deployment.spec.template.spec.containers[0].image, "pikalo-load:local");
assert.deepEqual(deployment.spec.template.spec.containers[0].command, [
  "node",
  "--import",
  "tsx",
  "load/answer.mts",
]);
const fixture = JSON.parse(
  kubectl(["get", "deployment", "fixture-backend", "-o", "json"]),
);
assert.equal(fixture.spec.template.spec.containers[0].image, "pikalo-load:local");
const observe = () => {
  const hpa = readJson(["get", "hpa", "answer-api", "-o", "json"]);
  const pods = readJson(["get", "pods", "-l", "app=answer-api", "-o", "json"]).items;
  return {
    at: new Date().toISOString(),
    active: pods.filter(
      (p: { metadata: { deletionTimestamp?: string } }) => !p.metadata.deletionTimestamp,
    ).length,
    totalIncludingTerminating: pods.length,
    ready: pods.filter(
      (p: {
        metadata: { deletionTimestamp?: string };
        status: { conditions?: { type: string; status: string }[] };
      }) =>
        !p.metadata.deletionTimestamp &&
        p.status.conditions?.some((c) => c.type === "Ready" && c.status === "True"),
    ).length,
    desired: hpa.status?.desiredReplicas ?? 0,
    cpuUtilizationPercent:
      hpa.status?.currentMetrics?.[0]?.resource?.current?.averageUtilization ?? null,
  };
};
const idleDeadline = Date.now() + 300_000;
while (true) {
  const state = observe();
  if (
    state.totalIncludingTerminating === 1 &&
    state.ready === 1 &&
    state.desired === 1 &&
    state.cpuUtilizationPercent !== null
  )
    break;
  if (Date.now() > idleDeadline)
    throw new Error("HPA did not reach a one-Pod idle baseline");
  console.log(`Waiting for idle baseline: ${JSON.stringify(state)}`);
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
const script = await readFile(new URL("../../load/ask.js", import.meta.url), "utf8");
kubectl(["apply", "-f", "-"], {
  apiVersion: "v1",
  kind: "ConfigMap",
  metadata: { name: "k6-script", namespace: "pikalo" },
  data: { "ask.js": script },
});
const name = `pikalo-load-${label}`;
kubectl(["delete", "job", name, "--ignore-not-found=true", "--wait=true"]);
const manifest = {
  apiVersion: "batch/v1",
  kind: "Job",
  metadata: { name, namespace: "pikalo" },
  spec: {
    backoffLimit: 0,
    activeDeadlineSeconds: seconds + 180,
    ttlSecondsAfterFinished: 1800,
    template: {
      spec: {
        restartPolicy: "Never",
        automountServiceAccountToken: false,
        securityContext: {
          runAsNonRoot: true,
          runAsUser: 12345,
          runAsGroup: 12345,
          fsGroup: 12345,
        },
        containers: [
          {
            name: "k6",
            image:
              "grafana/k6:2.4.0@sha256:d41bb79cd8de5a7ad619b53570e3712633e8bff0937010a5c6c57a4747e7a276",
            args: ["run", "--quiet", "--no-usage-report", "/scripts/ask.js"],
            env: [
              { name: "RATE", value: String(rate) },
              { name: "SECONDS", value: String(seconds) },
            ],
            resources: {
              requests: { cpu: "100m", memory: "128Mi" },
              limits: { cpu: "1", memory: "512Mi" },
            },
            securityContext: {
              allowPrivilegeEscalation: false,
              readOnlyRootFilesystem: true,
              capabilities: { drop: ["ALL"] },
            },
            volumeMounts: [
              { name: "script", mountPath: "/scripts", readOnly: true },
              { name: "tmp", mountPath: "/tmp" },
            ],
          },
        ],
        volumes: [
          { name: "script", configMap: { name: "k6-script" } },
          { name: "tmp", emptyDir: {} },
        ],
      },
    },
  },
};
console.log(kubectl(["create", "-f", "-"], manifest));
const observations = [];
const deadline = Date.now() + (seconds + 240) * 1000;
let result: string | undefined;
while (Date.now() < deadline) {
  const snapshot = observe();
  observations.push(snapshot);
  await writeFile(
    new URL("pods.json", output),
    JSON.stringify(observations, null, 2) + "\n",
  );
  console.log(JSON.stringify(snapshot));
  const job = readJson(["get", "job", name, "-o", "json"]);
  const terminal = job.status?.conditions?.find(
    (c: { type: string; status: string }) =>
      c.status === "True" && ["Complete", "Failed"].includes(c.type),
  );
  if (terminal) {
    result = terminal.type;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
const logs = kubectl(["logs", `job/${name}`, "-c", "k6"]);
await writeFile(new URL("k6.log", output), logs + "\n");
await writeFile(
  new URL("pods.json", output),
  JSON.stringify(observations, null, 2) + "\n",
);
const marker = logs.split(/\r?\n/).find((line) => line.startsWith("K6_SUMMARY_JSON="));
assert.ok(marker, `Missing k6 JSON summary. Job: ${result}. Logs: ${logs.slice(-3000)}`);
const summary = JSON.parse(marker.slice("K6_SUMMARY_JSON=".length));
await writeFile(new URL("summary.json", output), JSON.stringify(summary, null, 2) + "\n");
const metrics = summary.metrics;
const report = {
  measuredAt: new Date().toISOString(),
  mode: "local deterministic model/retrieval fixtures",
  rate,
  seconds,
  completedRequests: metrics.http_reqs.values.count,
  requestsPerSecond: metrics.http_reqs.values.rate,
  p95Milliseconds: metrics.http_req_duration.values["p(95)"],
  httpFailureRate: metrics.http_req_failed.values.rate,
  guardedAnswerRate: metrics.guarded_answers.values.rate,
  droppedIterations: metrics.dropped_iterations?.values.count ?? 0,
  maxActiveAnswerPods: Math.max(...observations.map((s) => s.active)),
  maxReadyAnswerPods: Math.max(...observations.map((s) => s.ready)),
  k6Version: "2.4.0",
  cpuRequest: "100m",
  hpaTarget: "60%",
  hpaMaxReplicas: 3,
  connectionReuse: false,
  scriptSha256: createHash("sha256").update(script).digest("hex"),
  environment,
};
await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
assert.equal(result, "Complete", "k6 thresholds failed; evidence was saved");
assert.ok(report.completedRequests > 0 && Number.isFinite(report.p95Milliseconds));
assert.equal(report.httpFailureRate, 0);
assert.equal(report.guardedAnswerRate, 1);
assert.equal(report.droppedIterations, 0);
console.log("PASS local fixture load test; raw k6 summary and Pod observations saved.");
