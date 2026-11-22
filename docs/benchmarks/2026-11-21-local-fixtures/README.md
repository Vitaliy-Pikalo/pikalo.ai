# Local Kubernetes benchmark: November 21, 2026

These are local fixture measurements, not production RAG or Bedrock capacity.
The smoke run passed. The stress run completed and **failed** its zero-drop
threshold; its measurements remain useful evidence of that failure.

| Measurement                                    |         Smoke | Stress (`measured/`) |
| ---------------------------------------------- | ------------: | -------------------: |
| Offered requests/s                             |             1 |                   20 |
| Scheduled duration                             |          10 s |                180 s |
| Completed HTTP requests                        |            11 |                3,550 |
| Completed HTTP requests/s                      |      1.083716 |            19.717583 |
| HTTP p95                                       | 243.298395 ms |      3,198.322422 ms |
| HTTP failures                                  |             0 |                    0 |
| Valid guarded answers among completed requests |          100% |                 100% |
| Dropped iterations                             |             0 |                   51 |
| Peak sampled active answer Pods                |             1 |                    3 |
| Peak sampled Ready answer Pods                 |             1 |                    3 |
| Zero-drop threshold                            |          Pass |             **Fail** |

## Command actually run

From the repository root in Windows PowerShell, with Docker Desktop running
and the four images already built using the commands in [load/README.md](../../../load/README.md):

```powershell
./scripts/k8s/benchmark.ps1 -Rate 20 -Seconds 180
```

That command creates kind, imports the images, runs the normal 49-case eval
Job, installs metrics-server/HPA and applies the fixture-only load overlay.
It invokes:

```powershell
./scripts/k8s/run-load.ps1 -Rate 1 -Seconds 10 -Label smoke
./scripts/k8s/run-load.ps1 -Rate 20 -Seconds 180 -Label measured
```

The outer command exited 1 because the stress Job failed, and its `finally`
block removed the cluster. Subsequent `kind get clusters` returned
`No kind clusters found.` and the kind network listing was empty.
An earlier attempt stopped before collecting a final summary; no throughput
or latency claim is taken from that incomplete attempt.

## Environment and method

- Source configuration: `85d23fb710121d910e1809a445dbf43c63e43587`.
- Kubernetes v1.36.4, kind v0.33.0, service Node v22.23.5, Docker 29.9.3.
- Docker VM: 8 CPUs and 6,098,739,200 bytes memory (about 5.68 GiB).
- k6 2.4.0, pinned image digest in the runner; 32 preallocated and at most 128 VUs.
- `load/ask.js` SHA-256: `40b93c5eca8e8ef315ab193b551566c8eabea8c9f3d72fc0dc760f3ff87e8f68`.
- One kind node hosts the generator and every service. Each run starts with
  one idle Ready answer Pod. Connection reuse is disabled, so new connections
  can reach replicas added behind the Service during the run.
- Answer HPA: 100m CPU request per Pod, 60% CPU target, 1–3 replicas. Calculator
  and fixture backend each retain one replica. Sampling is approximately every
  five seconds plus kubectl overhead; the raw file preserves exact timestamps.
- UTC completion timestamps in the reports fall on November 22; these runs
  occurred on November 21 in America/New_York.

The actual assistant handler, HMAC HTTP adapters, MCP calculator, tool-required
guard and number-provenance guard execute. Local fixtures replace model inference,
embedding and database retrieval. The fixture model formats the actual tool
result. A separate benchmark entry point raises its local limiter; the normal
service and live Next.js path retain the default eight requests/minute.

## Interpretation and evidence

Throughput comes from k6 `http_reqs.values.rate`; p95 comes from
`http_req_duration.values["p(95)"]` and excludes initial connection/DNS timing.
The validity rate covers completed requests only. A dropped iteration never
starts, so it cannot contribute an HTTP failure or a valid answer.

All 3,550 completed stress answers passed all three checks: HTTP 200/answered,
an actual successful Roth MCP result, and a citation. The zero-drop threshold
failed with 51 dropped iterations. The generator dynamically allocated up to
83 VUs (81 observed active); it did not reach the configured 128-VU ceiling.
These aggregate data cannot isolate generator allocation, shared-node contention
and service latency as causes. They do not establish maximum sustainable capacity.

The HPA samples show one Ready answer Pod at `00:43:09.003Z` and three at
`00:43:44.401Z`; all timestamps are preserved in `measured/pods.json`.
No artificial CPU workload or response delay was added to this request test.
The separate synthetic HPA exercise in the setup guide remains a different test.

Each directory contains the original saved `k6.log`, the complete k6 JSON
summary, Pod/HPA observations and the extracted report:

- [Stress report](measured/report.json), [summary](measured/summary.json),
  [Pod samples](measured/pods.json), [raw log](measured/k6.log).
- [Smoke report](smoke/report.json), [summary](smoke/summary.json),
  [Pod samples](smoke/pods.json), [raw log](smoke/k6.log).

No real AWS, Bedrock or Supabase requests were used. The live application and
its previously reported evaluation/cost figures are separate from this benchmark.
