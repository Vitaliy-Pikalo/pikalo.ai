/** Synthetic HPA control-loop smoke test; not a request load/capacity benchmark. */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const args = [
  "--kubeconfig",
  fileURLToPath(new URL("../../work/k8s/kubeconfig", import.meta.url)),
  "--context",
  "kind-pikalo-local",
  "--request-timeout=20s",
  "-n",
  "pikalo",
];
const observationFile = new URL("../../work/k8s/hpa-observations.jsonl", import.meta.url);
function kubectl(...command: string[]) {
  return execFileSync("kubectl", [...args, ...command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 210_000,
  }).trim();
}
type Condition = { type: string; status: string };
type Hpa = {
  spec: {
    minReplicas: number;
    maxReplicas: number;
    metrics: { resource: { target: { averageUtilization: number } } }[];
  };
  status?: {
    currentReplicas?: number;
    desiredReplicas?: number;
    currentMetrics?: { resource?: { current: { averageUtilization?: number } } }[];
    conditions?: Condition[];
  };
};
async function sample(stage: string) {
  const hpa = JSON.parse(kubectl("get", "hpa", "answer-api", "-o", "json")) as Hpa;
  const deployment = JSON.parse(kubectl("get", "deployment", "answer-api", "-o", "json"));
  const snapshot = {
    at: new Date().toISOString(),
    stage,
    desired: hpa.status?.desiredReplicas ?? 0,
    current: deployment.status.replicas ?? 0,
    ready: deployment.status.readyReplicas ?? 0,
    cpuUtilizationPercent:
      hpa.status?.currentMetrics?.[0]?.resource?.current.averageUtilization ?? null,
    scalingActive:
      hpa.status?.conditions?.some(
        (condition) => condition.type === "ScalingActive" && condition.status === "True",
      ) ?? false,
  };
  console.log(JSON.stringify(snapshot));
  await appendFile(observationFile, JSON.stringify(snapshot) + "\n");
  return snapshot;
}
async function waitFor(
  stage: string,
  timeoutSeconds: number,
  predicate: (snapshot: Awaited<ReturnType<typeof sample>>) => boolean,
) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const snapshot = await sample(stage);
    assert.ok(snapshot.current <= 3, "HPA exceeded maxReplicas");
    if (predicate(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`HPA did not reach expected state during ${stage}`);
}

let worker: ChildProcess | undefined;
let workerPid: number | undefined;
let workerPod: string | undefined;
let workerStopped = false;
function stopWorker() {
  if (workerPid && workerPod && !workerStopped) {
    // Only stop the bounded process we started, never the service (PID 1).
    kubectl(
      "exec",
      workerPod,
      "--",
      "node",
      "-e",
      "try { process.kill(Number(process.argv[1]), 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }",
      String(workerPid),
    );
    workerStopped = true;
  }
}
try {
  const config = JSON.parse(
    kubectl("get", "configmap", "answer-config", "-o", "json"),
  ).data;
  assert.equal(
    config.EMBED_URL,
    "http://127.0.0.1:1",
    "Use fixture cloud configuration for this verification",
  );
  assert.equal(config.SUPABASE_URL, "http://127.0.0.1:1");
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
  console.log(
    kubectl(
      "wait",
      "--for=condition=Available",
      "apiservice/v1beta1.metrics.k8s.io",
      "--timeout=180s",
    ),
  );
  const hpa = JSON.parse(kubectl("get", "hpa", "answer-api", "-o", "json")) as Hpa;
  assert.equal(hpa.spec.minReplicas, 1);
  assert.equal(hpa.spec.maxReplicas, 3);
  assert.equal(hpa.spec.metrics[0].resource.target.averageUtilization, 60);
  await writeFile(observationFile, "");
  console.log("Synthetic CPU control-loop test; no HTTP answer load or cloud calls.");
  await waitFor(
    "idle-before",
    240,
    (s) =>
      s.scalingActive &&
      s.cpuUtilizationPercent !== null &&
      s.desired === 1 &&
      s.current === 1 &&
      s.ready === 1,
  );
  console.log(kubectl("top", "pods"));
  workerPod = JSON.parse(kubectl("get", "pods", "-l", "app=answer-api", "-o", "json"))
    .items[0].metadata.name;
  const cpuExercise =
    "console.log(process.pid); const end = Date.now()+300000; function tick(){if(Date.now()>=end)return;const stop=Date.now()+75;while(Date.now()<stop){};setTimeout(tick,125)}tick();";
  worker = spawn(
    "kubectl",
    [...args, "--request-timeout=0", "exec", workerPod!, "--", "node", "-e", cpuExercise],
    { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("CPU exercise startup timed out")),
      20_000,
    );
    let output = "";
    worker!.stdout!.on("data", (chunk) => {
      output += String(chunk);
      const firstLine = output.split(/\r?\n/)[0];
      if (/^\d+$/.test(firstLine) && output.includes("\n")) {
        workerPid = Number(firstLine);
        assert.ok(workerPid > 1);
        clearTimeout(timer);
        resolve();
      }
    });
    worker!.stderr!.on("data", () => {});
    worker!.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker!.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("CPU exercise exited before startup"));
    });
  });
  const peak = await waitFor(
    "cpu-exercise",
    210,
    (s) => s.scalingActive && s.desired === 3 && s.current === 3 && s.ready === 3,
  );
  console.log("PASS HPA scaled answer-api from 1 to 3 Ready Pods");
  console.log(
    kubectl(
      "apply",
      "-k",
      fileURLToPath(new URL("../../k8s/autoscaling", import.meta.url)),
    ),
  );
  assert.equal(
    JSON.parse(kubectl("get", "deployment", "answer-api", "-o", "json")).spec.replicas,
    3,
  );
  console.log("PASS reapplying autoscaling manifests preserved the HPA replica count");
  console.log(kubectl("top", "pods"));
  console.log(kubectl("get", "hpa"));
  stopWorker();
  console.log("CPU exercise stopped; waiting for stabilization and scale-down.");
  await waitFor(
    "idle-after",
    300,
    (s) => s.scalingActive && s.desired === 1 && s.current === 1 && s.ready === 1,
  );
  console.log("PASS HPA scaled answer-api back to 1 Ready Pod");
  console.log(kubectl("get", "hpa"));
  console.log(kubectl("top", "pods"));
  console.log(
    `Observed peak Ready replicas: ${peak.ready}. This is a synthetic scaling smoke test, not measured request capacity.`,
  );
  console.log("Phase 3 verification passed; no cloud services called.");
} finally {
  try {
    stopWorker();
  } finally {
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      await new Promise<void>((resolve) => {
        worker!.once("exit", () => resolve());
        worker!.kill();
      });
    }
  }
}
