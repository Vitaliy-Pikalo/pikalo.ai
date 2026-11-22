# Local fixture load test

This benchmark measures HTTP orchestration on a single-node kind cluster.
It is not a measurement of Bedrock inference, production Supabase retrieval,
the live site's capacity, or deployment on EKS.

The request path is:

```text
k6 Job -> answer-api Service -> answer Pod
  -> HMAC-signed HTTP embedding fixture
  -> HTTP retrieval fixture (one fixed passage)
  -> HMAC-signed HTTP model fixture (tool request)
  -> real HTTP MCP calculator Service and Roth engine
  -> HMAC-signed HTTP model fixture (formats the actual calculator result)
  -> real tool-required and number-provenance guards -> HTTP answer
```

The fixture model refuses to finish without a successful calculator result.
Each k6 iteration checks HTTP 200, `answered` status, a successful actual MCP
Roth result and a citation. The stable question is an example with $40,000
income; it contains no real user data. The model/retrieval fixture uses fixed
data, no artificial delays and no CPU burners.

`load/answer.mts` is a separate entry point with hard-coded local fixture URLs.
The normal service and Next.js routes retain the default eight-requests/minute
local limiter. This benchmark entry point explicitly uses 60,000/minute, allowing
the test to measure completed answers rather than throttling responses. It calls
the same HTTP handler factory and assistant loop. No public request field or
production environment switch changes that limit.

## Reproduce

Use PowerShell from the repository root with Docker Desktop's Linux engine
running. k6 runs as a Pod, so native Windows k6 installation is unnecessary.

```powershell
docker build --load -f services/mcp-calc/Dockerfile -t pikalo-mcp-calc:local .
docker build --load -f services/answer-api/Dockerfile -t pikalo-answer-api:local .
docker build --load -f evals/Dockerfile -t pikalo-evals:local .
docker build --load -f load/Dockerfile -t pikalo-load:local .
./scripts/k8s/benchmark.ps1 -Rate 20 -Seconds 180
```

The script creates kind, loads the images, creates dummy Secrets, deploys the
normal services and runs the deterministic eval Job. It installs metrics-server
and HPA, applies `k8s/load`, and runs a 1 request/second, 10-second smoke test.
The measured run then offers 20 requests/second for 180 seconds with 32
preallocated VUs and at most 128 VUs. Each run starts from one idle Ready answer
Pod. The HPA target remains 60% of a 100m CPU request, with limits of 1–3 answer
replicas. Calculator and fixture backends each have one replica.

The generator targets Service DNS inside the cluster, not a port-forward pinned
to one Pod. Connection reuse is disabled so new connections can reach newly
scaled replicas through the layer-4 Service. It shares the local Docker VM with the tested services. The test
includes HPA scale-up time rather than reporting only a pre-scaled steady state.
The verifier samples desired, active and Ready answer Pod counts every five
seconds and records the observed maxima; it does not invent or force a peak.

Thresholds require HTTP failure rate below 1%, over 99% valid guarded answers and
no dropped iterations. The verifier additionally requires zero HTTP failures and
all answers valid for a successful recorded run. Failed runs retain evidence too.
`benchmark.ps1` tears down its cluster in `finally`, including on errors.

## Evidence

The measured output is written to ignored `work/load/measured/`:

- `summary.json`: unmodified k6 summary.
- `k6.log`: raw generator output.
- `pods.json`: timestamped observations of the HPA and answer Pods.
- `report.json`: metrics extracted from those files, including measured
  environment versions, Docker CPU count and memory allocation.

`requestsPerSecond` is k6's completed HTTP request rate, not the configured offered
rate. `p95Milliseconds` is k6's HTTP request-duration percentile, excluding the
initial DNS/connection timing. `maxReadyAnswerPods` is sampled Ready replica count;
the separate active count also includes starting Pods. Quantiles include all
recorded HTTP requests, and error/answer validity rates are reported alongside
them. Do not use these numbers as live model latency or real user capacity.

References: [k6 arrival-rate executor](https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/),
[built-in metric definitions](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/),
[k6 2.4.0 release](https://github.com/grafana/k6/releases/tag/v2.4.0).
