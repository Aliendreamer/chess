## Why

The collector's tail-sampling policy (observability D12) was written but off, and it was not ready for production: its
"slow" rule measured whole traces (a move against the engine is 5–10 s by design, so nearly every one would be kept);
with more than one collector a trace's spans would be split between them and sampled wrongly; Tempo's service map and
span metrics would be computed from the sampled traces only; and log and profile links to dropped traces would find
nothing. Cross-cutting, after the observability change; nothing changes for a player.

## What Changes

- **"Slow" means a slow operation, not a long trace.** A trace is kept when one of its spans is slow for what it is:
  an HTTP request or server function (a SERVER span) over 1 s, an actor handling one message over 500 ms, or a
  projection handling one record (retries included) over 2 s. The engine's deliberate think time never counts.
  Errors are kept as before, and 10 % of the rest.
- **Two collector tiers for sampling:** a gateway tier receives everything; it sends metrics and logs on directly
  and routes traces by trace id (`load_balancing` exporter) to a sampler tier, so every span of one trace reaches the
  same sampler, whichever app and node sent it.
- **Span metrics and the service graph come from the collector, before sampling** (`span_metrics` and
  `service_graph` connectors), locally and in production. Tempo's metrics-generator stops producing them; the
  Grafana service map and the dashboards read the same metric names.
- **Dangling links are a known limit, written down** with how to adjust them.
- **The local stack keeps every trace** (one collector, no sampling). The two-tier setup runs with
  `stack.sh up --tail-sampling` and is proven by `verify-tail-sampling.sh`.

## Owner decisions (2026-09-29)

1. Figure out per-operation "slow" thresholds.
2. Build the load-balancing tier.
3. Holding traces in memory for the decision wait (10 s) is fine.
4. Compute span metrics and the service graph before sampling.
5. Dangling links: document as known, with how to adjust.
6. Head sampling stays 1.0; all dropping happens at the tail.

## Out of scope

Alerting; deploying the collectors (the deploy target is not implemented); head-sampling changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `observability`: traces are sampled by tail in the sampling setup; span metrics and the service graph are derived
  before sampling.

## Impact

- `tools/localdev/observability/`: the collector configuration split into the gateway, sampler and single-collector
  forms; Tempo without its metrics-generator processors (local blocks stay for TraceQL).
- `tools/localdev/docker-compose.tail-sampling.yml`, `stack.sh up --tail-sampling`, `verify-tail-sampling.sh`.
- Docs: CLAUDE.md, architecture, the observability note.
