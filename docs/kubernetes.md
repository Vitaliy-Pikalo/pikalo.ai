# Ask Pikalo on local Kubernetes

Phase 2 runs the two Phase 1 service images on a free, single-node kind cluster.
The live Next.js/Vercel app and AWS infrastructure are unchanged. Autoscaling,
metrics-server, eval Jobs, CI rollout gates and load testing are later phases.

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
docker build -f services/mcp-calc/Dockerfile -t pikalo-mcp-calc:local .
docker build -f services/answer-api/Dockerfile -t pikalo-answer-api:local .

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
4. All 14 provenance cases pass on the host, and invalid answer input returns 400.
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
