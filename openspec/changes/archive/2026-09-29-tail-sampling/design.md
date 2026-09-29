## Context

One local collector receives OTLP from the browser (through the BFF), the BFF, both backend nodes and the engine, and
reads container logs. Tempo's metrics-generator derives the service graph and span metrics from what it stores. The
tail-sampling processor is configured and in no pipeline.

## Goals / Non-Goals

**Goals:** a sampling setup that keeps every error and every slow operation and a share of the rest, samples whole
traces correctly with several collectors, and keeps the service map and span metrics exact.

**Non-Goals:** sampling locally by default; deploying it; alerting.

## Decisions

### D1 — "Slow" per operation

The `latency` policy measures a trace from its first span to its last, so a move (think time, async consumers) always
looks slow. Instead, `ottl_condition` policies test single spans:

| Span                                                   | Slow when | Why that threshold                                               |
| ------------------------------------------------------ | --------- | ---------------------------------------------------------------- |
| SERVER (API endpoints, BFF pages and server functions) | > 1 s     | a person waits on it; commands answer in tens of ms              |
| an actor handling one message (`actor.type` set)       | > 500 ms  | handlers are synchronous; a persist is the slowest part (~10 ms) |
| a projection record (`consume …`, retries included)    | > 2 s     | backoff is 200 ms doubling; 2 s means several retries            |

The engine's `engine move` spans are consumers without `actor.type`: never slow by these rules. Thresholds live in the
collector configuration with this table as their reason; changing them is a configuration change.

### D2 — Two tiers

```text
apps ──OTLP──▶ gateway (otel-collector) ──metrics, logs──▶ Prometheus, Loki
                  │ traces, routed by trace id (load_balancing, DNS)
                  ▼
             sampler × N ──span_metrics, service_graph──▶ Prometheus
                  │ tail_sampling
                  ▼
                Tempo
```

- The gateway keeps the name `otel-collector`, so no app changes its endpoint.
- The `load_balancing` exporter resolves the samplers through DNS (`otel-sampler`, one address per replica) and hashes
  the trace id: all spans of a trace go to one sampler, even when they arrive at different times from different apps.
  When the number of samplers changes, traces in flight during the change may be split; that is the documented cost.
- Samplers compute the connectors (D3) from every span, then sample and export to Tempo.

### D3 — Metrics before sampling

`span_metrics` (namespace `traces.spanmetrics`: calls and duration per service, span name, kind and status) and
`service_graph` (edges between services, from client/server and producer/consumer pairs) run on the full stream: in
the single collector locally, in the samplers when sampling. Their Prometheus names match what Tempo produced
(`traces_service_graph_request_total`, …), so Grafana's service map and the dashboards are unchanged. Tempo keeps only
`local-blocks` (TraceQL metrics over what it stores).

### D4 — Dangling links (known)

Logs (Loki) and profiles (Pyroscope) keep the trace ids of traces that sampling dropped: their "open trace" link finds
nothing. Ways to adjust, cheapest first: raise the probabilistic share; add a policy for traces that matter
(`ottl_condition` on an attribute such as `game.id`, or `string_attribute` on a service); keep every trace with an
error log by marking the span as an error when the error is logged (the backend's exceptions already set the span
status); or, for logs, filter the Loki "open trace" link on the error level, where the trace is almost always kept.

## Risks / Trade-offs

- [DNS caches old sampler addresses after a scale change] → the resolver re-resolves every 5 s; traces in flight
  during the change can be split (sampled on partial data), a few seconds' worth.
- [A sampler crashes] → its traces in decision wait (≤ 10 s) are lost; the gateway re-routes the rest.
- [Memory] → `decision_wait` 10 s × span rate per sampler; `num_traces` bounds it.

## Migration Plan

Local: the collector configuration changes form, Tempo drops two processors; the metric names are the same. Sampling
is opt-in with the override file.
