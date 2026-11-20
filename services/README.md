# Standalone Ask Pikalo services

Phase 1 adds two Node services alongside the existing Next.js app. The live
`app/api/ask/route.ts`, calculator engines and answer guards are unchanged.

```text
POST answer-api:3000/api/ask
  -> existing retrieval -> Supabase match_passages
  -> existing signed gateway -> AWS Lambda -> Bedrock
  -> MCP Streamable HTTP -> mcp-calc:3001/mcp -> existing calculator engines
  -> existing tool-required and number-provenance guards
```

The calculator uses stateless MCP with JSON responses. Each operation creates
and closes its client; replicas will not need shared sessions or sticky routing.
The answer API has the existing eight-request/minute limit per client IP per
process. The direct listener uses the socket address, ignoring caller-supplied
forwarding headers. An ingress/proxy needs an explicit trusted-proxy design later.
The calculator endpoint is for internal server clients and rejects browser Origin
headers. Neither service is intended for direct public exposure.

## Run locally (PowerShell)

From the repository root:

```powershell
npm ci
npm run service:mcp
```

In a second terminal, supply the existing gateway and Supabase configuration in
your environment, plus `MCP_CALC_URL=http://127.0.0.1:3001/mcp`, then run:

```powershell
npm run service:answer
```

Alternatively, Node 22 can load an ignored `.env.local` file:

```powershell
node --env-file=.env.local --import tsx services/answer-api/server.mts
```

Required answer environment variables: `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `EMBED_URL`, `EMBED_SIGNING_SECRET`, `MCP_CALC_URL`.
Missing configuration stops startup without printing values. Optional
`ASSISTANT_MODEL_ID` defaults to `us.amazon.nova-micro-v1:0`. The calculator
requires no credentials. `HOST` defaults to `127.0.0.1`; `PORT` defaults to 3000
for the answer API and 3001 for the calculator. Containers bind to `0.0.0.0`.

`GET /healthz` checks that the process can respond. `GET /readyz` on the answer
service also checks MCP tool discovery; it does not invoke Bedrock or verify
Supabase/gateway credentials. Calculator readiness is local. These endpoints are
prepared for Kubernetes probes: readiness controls traffic eligibility, while
liveness detects when a process needs restarting. No Kubernetes resources exist
in Phase 1.

Both processes drain HTTP requests on SIGINT/SIGTERM, with a 70-second deadline.
Requests are limited to 16 KiB. No credentials are baked into images.

## Verify without cloud calls

```powershell
npm run test:services
npm run lint
npm run typecheck
npm test
npm run eval
```

The service tests open real loopback HTTP listeners. They run all 33 existing
calculator cases against the remote MCP server, check the 14 provenance cases,
and exercise the full answer-to-calculator HTTP flow with a deterministic model
fixture. They also check malformed input, body limits, health endpoints and
calculator outage/recovery. This is not a new live Bedrock evaluation.

## Build and smoke-test containers (requires Docker)

Build from the repository root. The runtime uses Node 22 and production
dependencies, including `tsx` to execute the shared TypeScript sources.

```powershell
docker build -f services/mcp-calc/Dockerfile -t pikalo-mcp-calc:local .
docker build -f services/answer-api/Dockerfile -t pikalo-answer-api:local .
docker run --rm -d --name pikalo-mcp-calc -p 127.0.0.1:3001:3001 pikalo-mcp-calc:local
Invoke-RestMethod http://127.0.0.1:3001/healthz
docker stop pikalo-mcp-calc
```

For automated checks of both built images:

```powershell
node --import tsx scripts/verify-containers.mts
```

This command creates a temporary Docker network and two containers, exposing
test ports only on localhost and using placeholder gateway/Supabase configuration.
It checks health/readiness,
runs the 33 calculator cases against the container's HTTP MCP endpoint and the
14 provenance cases on the host, checks invalid answer input, and verifies that
answer readiness becomes 503 while liveness stays 200 when the calculator stops.
It removes its containers and network in a `finally` block. It makes no cloud
calls and does not perform a live model evaluation. Built images remain available
for the next phase.

### Verified locally on November 19, 2026

Both `docker build` commands above passed using Docker Engine 29.9.3 on
`linux/amd64`. Running `node --import tsx scripts/verify-containers.mts` produced:

```text
mcp-calc: /healthz -> 200, /readyz -> 200
answer-api: /healthz -> 200, /readyz -> 200
tools: 33/33 (100.0%)
provenance: 14/14 (100.0%)
answer-api invalid input -> 400
Calculator stopped: /readyz -> 503, /healthz -> 200
Container verification passed; no cloud services called.
Cleanup complete: verification containers and network removed.
```

An actual answer request still invokes paid AWS services through the existing
gateway. Obtain approval before live evals or load tests. Container build and
health checks above do not invoke AWS. Kubernetes, scaling, rollout Jobs and
load measurements belong to subsequent phases.
