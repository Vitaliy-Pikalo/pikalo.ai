/** Same local Job launcher is used on Windows and the Linux CI runner. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { "negative-control": { type: "boolean", default: false } },
});
const negative = values["negative-control"];
const jobName = negative ? "pikalo-evals-negative" : "pikalo-evals";
const args = [
  "--kubeconfig",
  fileURLToPath(new URL("../../work/k8s/kubeconfig", import.meta.url)),
  "--context",
  "kind-pikalo-local",
  "--request-timeout=20s",
  "-n",
  "pikalo",
];
function kubectl(command: string[], input?: unknown) {
  return execFileSync("kubectl", [...args, ...command], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 90_000,
    ...(input === undefined ? {} : { input: JSON.stringify(input) }),
  }).trim();
}
const job = JSON.parse(
  kubectl([
    "create",
    "--dry-run=client",
    "-f",
    fileURLToPath(new URL("../../k8s/jobs/eval-job.yaml", import.meta.url)),
    "-o",
    "json",
  ]),
);
job.metadata.name = jobName;
const negativeConfigName = "eval-negative-control";
let createdConfig = false;
try {
  const config = JSON.parse(
    kubectl(["get", "configmap", "answer-config", "-o", "json"]),
  ).data;
  assert.equal(
    config.EMBED_URL,
    "http://127.0.0.1:1",
    "Local/CI Job launcher requires fixture cloud URLs",
  );
  assert.equal(config.SUPABASE_URL, "http://127.0.0.1:1");
  console.log(
    kubectl(["delete", "job", jobName, "--ignore-not-found=true", "--wait=true"]),
  );
  if (negative) {
    const gold = JSON.parse(
      await readFile(new URL("../../evals/gold-tools.json", import.meta.url), "utf8"),
    );
    gold.cases[0].expect = { __negative_control_expected_failure__: true };
    console.log(
      kubectl(["apply", "-f", "-"], {
        apiVersion: "v1",
        kind: "ConfigMap",
        metadata: { name: negativeConfigName, namespace: "pikalo" },
        data: { "gold-tools.json": JSON.stringify(gold) },
      }),
    );
    createdConfig = true;
    job.spec.template.spec.volumes.push({
      name: "negative-control",
      configMap: { name: negativeConfigName },
    });
    job.spec.template.spec.containers[0].volumeMounts.push({
      name: "negative-control",
      mountPath: "/app/evals/gold-tools.json",
      subPath: "gold-tools.json",
      readOnly: true,
    });
  }
  console.log(kubectl(["create", "--dry-run=server", "-f", "-"], job));
  console.log(kubectl(["create", "-f", "-"], job));
  const deadline = Date.now() + 240_000;
  let result: "Complete" | "Failed" | undefined;
  while (Date.now() < deadline) {
    const status = JSON.parse(kubectl(["get", "job", jobName, "-o", "json"])).status;
    const terminal = (status?.conditions ?? []).find(
      (condition: { type: string; status: string }) =>
        condition.status === "True" && ["Complete", "Failed"].includes(condition.type),
    );
    if (terminal) {
      result = terminal.type;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  assert.ok(result, `Job ${jobName} exceeded the launcher's timeout`);
  const pods = JSON.parse(
    kubectl(["get", "pods", "-l", `job-name=${jobName}`, "-o", "json"]),
  ).items;
  assert.equal(pods.length, 1, "backoffLimit=0 must produce one eval attempt");
  const logs = kubectl(["logs", pods[0].metadata.name, "-c", "evals"]);
  console.log(logs);
  await mkdir(new URL("../../work/k8s", import.meta.url), { recursive: true });
  await writeFile(new URL(`../../work/k8s/${jobName}.log`, import.meta.url), logs + "\n");
  const exitCode = pods[0].status.containerStatuses?.find(
    (container: { name: string }) => container.name === "evals",
  )?.state.terminated?.exitCode;
  if (negative) {
    assert.equal(
      result,
      "Failed",
      "An intentionally wrong eval expectation must fail the Job",
    );
    assert.equal(
      exitCode,
      1,
      "Negative control must fail through the eval process, not scheduling or image errors",
    );
    assert.match(logs, /\| tools \| 32\/33 \|/);
    assert.match(logs, /\| provenance \| 14\/14 \|/);
    assert.match(logs, /__negative_control_expected_failure__/);
    console.log(
      "PASS negative control: one wrong expectation caused eval exit 1 and Job Failed.",
    );
  } else {
    assert.equal(result, "Complete", "Eval Job failed; deployment gate must fail");
    assert.equal(exitCode, 0);
    assert.match(logs, /\| tools \| 33\/33 \|/);
    assert.match(logs, /\| provenance \| 14\/14 \|/);
    console.log(
      "PASS eval Job Complete: 47/47 deterministic gold cases passed inside Kubernetes.",
    );
  }
} finally {
  if (createdConfig)
    console.log(
      kubectl(["delete", "configmap", negativeConfigName, "--ignore-not-found=true"]),
    );
}
