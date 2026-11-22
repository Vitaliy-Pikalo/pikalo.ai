# Ask Pikalo on local Kubernetes

Two standalone service images run on a free, single-node kind cluster, with
metrics-server and CPU-based answer API autoscaling. Deterministic evals run as
a Kubernetes Job in a required GitHub Actions check. A k6 benchmark exercises the
HTTP answer path with local model/retrieval fixtures and the real MCP calculator.
The live Next.js/Vercel app and AWS infrastructure are unchanged.

See the [architecture and interview guide](kubernetes-architecture.md) and
[load-test methodology and commands](../load/README.md).

## Concepts for interviews

| Concept         | Meaning in this project                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Pod             | A running service container, its network identity and its temporary volumes. A replacement Pod can have a different address. |
| Deployment      | Maintains the desired number of Pods and manages replacements and rolling updates. Each service starts with one replica.     |
| Service         | A stable cluster address that selects ready Pods by label. `mcp-calc:3001` resolves through cluster DNS.                     |
| ConfigMap       | Nonsecret configuration, including the calculator address and model ID.                                                      |
| Secret          | Sensitive configuration supplied separately from Git. Base64 encoding is not encryption.                                     |
| Startup probe   | Gives the process time to start before readiness and liveness checks take over.                                              |
| Readiness probe | Decides whether a Pod is eligible for Service traffic. The answer API checks MCP discovery, not paid cloud services.         |
| Liveness probe  | Checks that the HTTP process responds. A calculator outage should not cause answer-process restarts.                         |

`k8s/base` declares two Deployments, two ClusterIP Services, a ConfigMap and a
namespace. The answer Deployment references `answer-secrets`, which is created
locally rather than committed. Resources are assembled using Kustomize, bundled
with kubectl; Helm is unnecessary here.

Both containers run as UID/GID 1000 with privilege escalation disabled, dropped
Linux capabilities, a read-only root filesystem and a small writable `/tmp`.
They do not mount Kubernetes API credentials. Requests are 100m CPU/128Mi memory,
with limits of 1 CPU/512Mi memory per container. These are starting configuration
values, not measured capacity results. The shutdown grace period is 75 seconds,
longer than the services' 70-second drain deadline.

## Prerequisites

Start Docker Desktop with Linux containers. Install kind if needed:

```powershell
winget install -e --id Kubernetes.kind --source winget
```

Docker Desktop includes kubectl. Verify `kind version`, `kubectl version --client`
and `docker version`. The cluster uses kind 0.33.0 and its published Kubernetes
1.36.4 node image, pinned by digest in `k8s/kind.yaml`.

Sources: [kind installation and image loading](https://kind.sigs.k8s.io/docs/user/quick-start/),
[kind 0.33.0 node images](https://github.com/kubernetes-sigs/kind/releases/tag/v0.33.0),
[kubectl on Windows](https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/).

## Reproduce Phase 2 without cloud calls

Run these commands in PowerShell from the repository root. The scripts refresh
PATH for newly installed tools. `create-cluster.ps1` refuses to overwrite an
existing cluster named `pikalo-local`.

```powershell
# Build these first if the Phase 1 images are not available.
docker build --load -f services/mcp-calc/Dockerfile -t pikalo-mcp-calc:local .
docker build --load -f services/answer-api/Dockerfile -t pikalo-answer-api:local .

./scripts/k8s/create-cluster.ps1
try {
    ./scripts/k8s/load-images.ps1
    ./scripts/k8s/create-local-secret.ps1 -Fixture
    ./scripts/k8s/deploy.ps1
    ./scripts/k8s/verify.ps1
} finally {
    ./scripts/k8s/teardown.ps1
}
```

The kubeconfig, which contains cluster access credentials, stays in ignored
`work/k8s/kubeconfig`. Commands specify both that file and `kind-pikalo-local`;
they do not change your default kubeconfig or target a cloud cluster. kind's API
server binds to `127.0.0.1`. Services are internal ClusterIP addresses, with
temporary localhost-only port forwarding during verification.

The default ConfigMap points cloud URLs at `http://127.0.0.1:1`; the fixture
Secret contains dummy values. The verification script requires these URLs and
does not submit a valid model question. It verifies:

1. Both Deployments become available; server-side dry-run validates the manifests.
2. Both health and readiness endpoints return 200.
3. All 33 existing calculator cases pass through HTTP MCP to a Kubernetes Pod.
4. All checked-in provenance cases pass on the host, and invalid answer input returns 400.
5. When the calculator is manually scaled to zero, answer readiness returns 503,
   the answer Service loses its ready endpoints, and liveness still returns 200.
   The same answer Pod remains running without additional restarts.
6. Restoring the calculator replica restores answer readiness and Service endpoints.

This manual replica change tests readiness and recovery; it is not autoscaling.
The verifier closes its port forwards and restores the calculator replica after
an interrupted outage check. Run teardown even if verification fails. Teardown
deletes only `pikalo-local` and removes the shared `kind` Docker network only if
no containers use it. Service images remain available for the next phase.

If image loading hits a Docker containerd digest error, `load-images.ps1` uses
a temporary single-platform archive and deletes that archive afterward. This is
the [targeted workaround documented by kind](https://kind.sigs.k8s.io/docs/user/known-issues/#unable-to-kind-load-docker-images);
it does not change Docker's global image-store settings.

## Inspect the running cluster

Before teardown, use the same explicit context for manual commands:

```powershell
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo get deployments,services,pods
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo describe deployment answer-api
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo get endpointslices
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo port-forward service/answer-api 3000:3000 --address=127.0.0.1
```

Stop manual port forwarding with Ctrl+C. Health/readiness can then be inspected
at `http://127.0.0.1:3000/healthz` and `/readyz`.

## Verified on November 19, 2026

The setup, Secret, deployment and verification commands above were executed
with kind 0.33.0, Kubernetes 1.36.4, kubectl 1.36.1 and Docker Engine 29.9.3.
The deployment script's server-side dry-run and both rollouts passed. The final
`./scripts/k8s/verify.ps1` run produced these results:

```text
deployment.apps/answer-api   READY 1/1
deployment.apps/mcp-calc     READY 1/1
tools                       33/33   100.0%
provenance                  14/14   100.0%
PASS invalid answer input -> 400
PASS /readyz -> 503
PASS /healthz -> 200
PASS readiness removed answer Service endpoints; answer Pod was not restarted
PASS /readyz -> 200
PASS answer Service endpoints recovered after calculator restart
Phase 2 verification passed; no cloud services called.
```

The initial run encountered control-plane API lease timeouts and controller/
scheduler restarts following image loading. The control plane recovered without
app changes. Verification was repeated after all kube-system Pods were Ready;
the repeat passed, with both app Pods at zero restarts. Image loading and
verification now wait for kube-system Pod readiness. These checks establish local
functionality; they do not measure production availability or performance.

## Phase 3: metrics-server and answer API autoscaling

Metrics-server collects resource usage from kubelets and exposes it through
`metrics.k8s.io`. An HPA is a control-plane controller that changes a Deployment's
replica count from measured utilization. It does not create additional cluster
nodes. See the [upstream metrics-server documentation](https://github.com/kubernetes-sigs/metrics-server/blob/v0.9.1/README.md)
and [Kubernetes HPA documentation](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/).

The answer HPA uses `autoscaling/v2`, with minimum 1 and maximum 3 replicas. Its
CPU target is 60% of the existing 100m request: about 60m CPU per Pod, not 60% of
the laptop or container CPU limit. The calculator stays at one replica. Scale-up
allows two additional Pods per 30 seconds. Scale-down uses a 60-second
stabilization window and removes at most one Pod per 30 seconds. These are local
demo settings to validate behavior, not production sizing recommendations.

`k8s/autoscaling` includes the base manifests and removes `spec.replicas` from
the answer Deployment so repeated applies do not reset the HPA's decisions.
After enabling HPA, use `deploy.ps1 -Autoscaling`; the base deployment script
refuses to reset an HPA-controlled Deployment. The Phase 2 outage verifier also
refuses to run while HPA is enabled because it manually changes replica counts.

Metrics-server's v0.9.1 release manifest is vendored without modification under
`k8s/metrics-server/upstream`, with its license and SHA256 recorded alongside it.
The local Kustomize patch adds `--kubelet-insecure-tls` for kind's kubelet serving
certificate. Keep that local exception out of a production cluster; use trusted
kubelet certificates there instead. No Windows or Docker security settings are
changed.

Reproduce from the repository root after building the Phase 1 service images:

```powershell
./scripts/k8s/create-cluster.ps1
try {
    ./scripts/k8s/load-images.ps1
    ./scripts/k8s/create-local-secret.ps1 -Fixture
    ./scripts/k8s/deploy.ps1
    ./scripts/k8s/enable-autoscaling.ps1
    ./scripts/k8s/verify-autoscaling.ps1
} finally {
    ./scripts/k8s/teardown.ps1
}
```

`enable-autoscaling.ps1` validates and installs metrics-server, waits for its
Deployment and aggregated API, then deploys the autoscaling overlay. Inspect the
running cluster before teardown with:

```powershell
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo top pods
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo get hpa
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo describe hpa answer-api
kubectl --kubeconfig work/k8s/kubeconfig --context kind-pikalo-local -n pikalo get events --field-selector involvedObject.kind=HorizontalPodAutoscaler --sort-by=.lastTimestamp
```

The verifier waits for one idle Ready answer Pod, then starts a bounded Node CPU
exercise inside that container. This child process's CPU is part of the same
container resource measurement. The HPA must produce three Ready answer Pods;
reapplying the overlay must preserve its replica count. The verifier then stops
the exact child process it started and waits for the HPA to return to one Ready
Pod. The child has a five-minute lifetime bound, and cleanup closes the local
kubectl process. Timestamped observations are written to ignored
`work/k8s/hpa-observations.jsonl` and printed in the command output.

This is a synthetic test of the real metrics-to-HPA control loop. It sends no
answer requests and measures neither request throughput nor p95 latency. Those
measurements belong to Phase 5; cloud-backed traffic still requires cost approval.

### Phase 3 results on November 19, 2026

`./scripts/k8s/enable-autoscaling.ps1` passed server-side manifest validation,
metrics-server rollout and Metrics API availability checks. Running
`./scripts/k8s/verify-autoscaling.ps1` produced:

```text
PASS HPA scaled answer-api from 1 to 3 Ready Pods
PASS reapplying autoscaling manifests preserved the HPA replica count
PASS HPA scaled answer-api back to 1 Ready Pod
Observed peak Ready replicas: 3. This is a synthetic scaling smoke test, not measured request capacity.
Phase 3 verification passed; no cloud services called.
```

The `kubectl get events` command, scoped to HPA objects, confirmed
`SuccessfulRescale` events for sizes 3, 2 and 1. A final `kubectl get hpa` showed
`cpu: 13%/60%`, min 1, max 3 and replicas 1. Both app Deployments were `1/1`
Ready, with zero restarts in their surviving Pods. The base `deploy.ps1` guard
was also exercised and correctly refused to reset HPA-managed replicas.
These observations came from the commands documented above and the synthetic
CPU exercise, not live user traffic. The local cluster was then torn down.

## Phase 4: eval Job and GitHub Actions gate

A Job runs a task to completion, recording `Complete` or `Failed` separately
from the long-running service Deployments. `k8s/jobs/eval-job.yaml` runs the eval
container once, with `restartPolicy: Never`, `backoffLimit: 0`, a 180-second active
deadline and a ten-minute cleanup TTL. The launcher watches for either terminal
condition and fails if the Job times out, fails, or returns a nonzero process exit.
See [Kubernetes Job semantics](https://kubernetes.io/docs/concepts/workloads/controllers/job/).

`evals/cluster.mts` runs all 33 existing calculator cases through
`http://mcp-calc:3001/mcp`, and all 16 current provenance cases inside the same
Job. Both suites require 100%. It also checks answer health/readiness and HTTP
rejection of invalid input. The Job image uses the same locked production
runtime as the services, then copies in the eval code and fixtures. It does not
run the separate 11-question live Bedrock evaluation or measure model quality.

The Job mounts no Secret or service-account token. Local and CI Deployments use
dummy credentials and unreachable placeholder cloud URLs. Neither this eval
gate nor its negative control needs AWS credentials, Supabase access, GitHub
Actions secrets, an image registry push or a paid cluster.

Reproduce from PowerShell at the repository root:

```powershell
docker build --load -f services/mcp-calc/Dockerfile -t pikalo-mcp-calc:local .
docker build --load -f services/answer-api/Dockerfile -t pikalo-answer-api:local .
docker build --load -f evals/Dockerfile -t pikalo-evals:local .
./scripts/k8s/create-cluster.ps1
try {
    ./scripts/k8s/load-images.ps1 -IncludeEvals
    ./scripts/k8s/create-local-secret.ps1 -Fixture
    ./scripts/k8s/deploy.ps1
    ./scripts/k8s/run-evals.ps1
    ./scripts/k8s/run-evals.ps1 -NegativeControl
} finally {
    ./scripts/k8s/teardown.ps1
}
```

The negative control changes one expected field in a temporary ConfigMap
override. The checked-in gold fixtures remain unchanged. It must produce
`32/33` calculator passes, all provenance cases passing, process exit 1 and a failed
Job; image errors, scheduling failures or timeouts cannot satisfy this check.
The negative-control launcher exits successfully only after confirming this
expected failure. Logs stay in ignored `work/k8s/pikalo-evals*.log`. Rerunning a
launcher replaces its own previously completed Job; it does not alter service
replicas or HPA configuration.

`.github/workflows/k8s.yml` runs on every push, pull request, merge group and
manual dispatch. Its stable check name is **Kubernetes eval gate**. The workflow
builds the three candidate images, creates a pinned kind cluster, loads the
images locally, deploys both services, requires the positive Job to pass, and
proves failure propagation with the negative control. It uploads only diagnostic
`.log` files, excluding kubeconfig credentials, and attempts teardown with
`if: always()`. Its GitHub token has only `contents: read`; fork PRs need no
repository secrets. Windows and Linux runners use the same PowerShell launchers.

### Required merge checks

GitHub branch protection on `main` requires **Kubernetes eval gate**, **check**
and **infra**, bound to the GitHub Actions app. Branches must be up to date, and
administrator enforcement is enabled. These repository settings were applied and
read back through GitHub's API; hosted positive and negative-control Jobs passed.
For example, [Kubernetes run 44966614908](https://github.com/Vitaliy-Pikalo/pikalo.ai/actions/runs/44966614908)
and [application/infra run 44966614900](https://github.com/Vitaliy-Pikalo/pikalo.ai/actions/runs/44966614900)
passed for `564eb06`. A failing eval Job fails the required check, preventing a
normal merge. These settings belong to GitHub rather than a versioned manifest.
See [GitHub required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging).

### Local Phase 4 results on November 19, 2026

These historical results precede synchronization with newer `main`. Upstream
added `prov-15` and `prov-16`; the current checked-in corpus has 33 calculator
and 16 provenance cases (49 total). Verifiers now derive counts from the files,
so new upstream cases cannot be silently excluded. The gold files were not edited
by this project. Builds use `--load` so isolated Docker builders export images
to the engine for kind rather than leaving them only in build cache.

The eval image built successfully. The positive and negative-control launchers
were run against the two deployed services in kind:

```text
tools       33/33  100.0%
provenance  14/14  100.0%
PASS eval Job Complete: 47/47 deterministic gold cases passed inside Kubernetes.

tools       32/33   97.0%
provenance  14/14  100.0%
PASS negative control: one wrong expectation caused eval exit 1 and Job Failed.
```

`npm test` passed 203 tests across 19 files; `npm run eval` still passed all 47
original deterministic cases. Typechecking and workflow validation with
`actionlint .github/workflows/k8s.yml` passed. The original gold files and live
application code were unchanged. The local test cluster was torn down afterward.

### Current Phase 4 verification on November 21, 2026

The Kubernetes commits were rebased onto upstream `44b6e1e`, preserving its newer
application features and gold fixtures. Current local verification passed:

```text
npm test: 293/293 tests passed across 29 files
npm run eval: tools 33/33, provenance 16/16
PASS eval Job Complete: 49/49 deterministic gold cases passed inside Kubernetes.
Negative control: tools 32/33, provenance 16/16, eval process exit 1, Job Failed
PASS negative control: one wrong expectation caused eval exit 1 and Job Failed.
```

Both service Deployments were `1/1` Ready with zero restarts during this Job run.
Typechecking, targeted lint and actionlint passed. The source application and gold
files match upstream exactly. The fresh cluster and its unused network were removed
with `teardown.ps1`; no cloud service calls were made.

## Load test and project completion

The [November 21 benchmark evidence](benchmarks/2026-11-21-local-fixtures/README.md)
records a passing 1/s smoke test and a 20/s, 180-second stress test. The stress
test completed 3,550 requests at 19.72 requests/s with HTTP p95 3,198.32 ms,
zero HTTP failures and all completed answers valid. The answer HPA grew from
one to three Ready Pods. However, k6 dropped 51 scheduled iterations, so the
stress Job **failed** its zero-drop threshold. This is an observed limitation,
not a passing capacity claim. No performance target was relaxed afterward.

Run `./scripts/k8s/benchmark.ps1 -Rate 20 -Seconds 180` after the image builds in
[load/README.md](../load/README.md). Raw summaries, logs and timestamped Pod
observations are checked in with the results. The benchmark uses local model
and retrieval fixtures with real MCP and guards, not cloud-backed inference.
The cluster and unused kind network were removed after the failed threshold.

The service split, cluster manifests, HPA, CI eval Job, measured load test and
architecture documentation are implemented. EKS was optional and skipped;
all project cluster work remained free and local. See the
[architecture diagram and interview guide](kubernetes-architecture.md).

## Real cloud configuration (requires separate approval)

No real AWS/Supabase configuration is used for Phase 2 verification. Before
cloud-backed requests, obtain approval under the project's cost guardrail.
The non-fixture Secret script reads `SUPABASE_PUBLISHABLE_KEY` and
`EMBED_SIGNING_SECRET` from the process environment and sends them to kubectl
over stdin. It never writes a populated Secret manifest or prints the values.
Cloud URLs belong in the ConfigMap. Restart the answer Deployment after changing
environment-backed configuration; existing Pods do not automatically reload it.
The cluster verifier intentionally rejects real cloud URLs. No AWS access keys,
Supabase service-role key or ingestion infrastructure belong in this cluster.
