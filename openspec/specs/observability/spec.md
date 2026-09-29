# observability Specification

## Purpose

Seeing what the system does: the local telemetry stack, what each app exports and the switch that controls it, one
trace per user action across actors, the journal, Kafka and the relay, the actor, cluster and pipeline metrics, every
log, the profiles, and the dashboards.

## Requirements

### Requirement: The telemetry stack runs with the local stack

`stack.sh up` SHALL start an OpenTelemetry Collector, Prometheus, Tempo, Loki, Pyroscope and Grafana, plus metric
exporters for Postgres (primary and replica), Redis and the containers. Grafana MUST be reachable at
`grafana.chess.localhost` with its datasources and dashboards provisioned from the repo. Anonymous access MUST be off:
the `viewer` account MUST be able to view only, and editing MUST need the `admin` account.

#### Scenario: Signing in

- **WHEN** someone opens Grafana without signing in
- **THEN** they get the login page; `viewer` sees the dashboards and cannot save, `admin` can edit

#### Scenario: A fresh stack

- **WHEN** a developer runs `stack.sh up` on empty volumes
- **THEN** Grafana opens at `grafana.chess.localhost` with the Prometheus, Tempo, Loki and Pyroscope datasources
  working and every dashboard listed

### Requirement: Each app's export is a switch

The backend and the engine worker SHALL export traces, metrics and logs over OTLP only when
`Observability:Enabled` is true, and the BFF only when `OTEL_ENABLED` is true. With the switch off an app MUST export
nothing and behave exactly as with it on. The shipped `appsettings.json` MUST keep it off; the local stack MUST turn
it on.

#### Scenario: Export off

- **WHEN** the backend starts with `Observability:Enabled=false`
- **THEN** no exporter is registered and commands, events and Kafka records are the same as without this change

#### Scenario: Export on

- **WHEN** the backend starts in the local stack
- **THEN** its traces, metrics and logs reach the collector under `service.name` `chess-backend` and its node name

### Requirement: One trace follows a user action end to end

A user action SHALL produce one trace that continues across every hop it causes: the browser, the BFF, the API, the
actor that handles the command, the journal persist, the journal publisher, each Kafka consumer, the engine worker
when it is asked, and the live frame pushed back through the relay. Trace context MUST cross actor mailboxes with the
command, the journal inside the persisted event, Kafka as record headers, and the relay inside the live frame.

#### Scenario: A move against the computer

- **WHEN** a player moves in a game against the computer from the browser
- **THEN** one trace holds spans from `chess-frontend-web`, `chess-frontend`, `chess-backend` (the endpoint, `game
MakeMove`, the persist, the publish, the projection and engine-request consumers), `chess-engine`, the engine's
  move handled by the game actor, and the relay pushing the frame

#### Scenario: Finding a game's traces

- **WHEN** an operator searches Tempo for `game.id` of a game
- **THEN** the traces of that game's commands are listed

#### Scenario: Events from before the change

- **WHEN** a game persisted before this change is recovered and its events are published
- **THEN** recovery succeeds, and the publish spans start new traces

### Requirement: Actors and the cluster are visible in Grafana

Every node SHALL publish, per actor type and message type, messages handled with their outcome and handling time,
persist latency, recovery time, passivations, and dead or unhandled messages; and every 10 s its view of the cluster:
members by status, unreachable members, which singletons it hosts, and live entities per shard region and shard. The
Actors & cluster dashboard MUST show these per node. No metric label MAY carry a game, invite or user id.

#### Scenario: Games spread over two nodes

- **WHEN** six games are live on a two-node cluster
- **THEN** the dashboard shows the `games` entities per shard on each node, summing to six, and which node hosts the
  matchmaking, deadline and publisher singletons

#### Scenario: A node dies

- **WHEN** backend-1 is killed
- **THEN** the dashboard shows it unreachable and then gone, the singletons moving to backend-2, and backend-2's
  entity count rising as games recover there

### Requirement: The event pipeline is visible

The backend SHALL publish the journal publisher's lag and records published per topic, and each projection group's
records by outcome (applied, skipped, retried, parked, gap), handling time and quarantined aggregates. Consumer lag
per group MUST come from Redpanda's metrics. The Event pipeline dashboard MUST show all of these.

#### Scenario: A stalled projection

- **WHEN** a projection stalls on a sequence gap
- **THEN** the dashboard shows its `gap` outcomes rising and its consumer lag growing while the other groups keep
  flowing

### Requirement: Requests, runtime and resources are visible

The HTTP & BFF dashboard SHALL show request rate, errors and latency per API endpoint and per BFF server function,
and the relay's open sockets, subscriptions, frames pushed and refusals. The Runtime & containers dashboard SHALL show
.NET heap, GC pauses, thread pool and exceptions per node, the BFF's event-loop lag and heap, and memory and CPU per
container. The Engine worker dashboard SHALL show jobs by kind and outcome, think time, restarts and dropped requests.

#### Scenario: Memory per process

- **WHEN** an operator opens Runtime & containers
- **THEN** each backend node, the engine worker and the BFF show their heap and their container's memory over time

### Requirement: Every log in the stack reaches Loki

Logs SHALL reach Loki from every container of the local stack, each labelled with its service. The backend and engine
worker logs MUST arrive structured over OTLP, carrying the trace and span ids of the work they were written in, and
MUST NOT arrive a second time from container output. Every other container's output MUST be collected from
Docker's log files. A Logs dashboard MUST show log volume and errors per service and a tail filtered by service, level
and text.

#### Scenario: Infrastructure logs

- **WHEN** Keycloak logs an error during a login
- **THEN** it appears in Loki under `service_name` `keycloak`, stack trace in one entry, and on the Logs dashboard's
  errors panel

#### Scenario: No duplicates

- **WHEN** the backend writes one log line while tracing is on
- **THEN** Loki holds that line once, with its trace id

### Requirement: Logs and profiles are linked to traces

Grafana SHALL link a span to its logs and a log line to its trace. Pyroscope SHALL receive CPU and allocation profiles
from both backend nodes and the BFF (not the engine worker, which only drives Stockfish), and Grafana MUST open the
profile samples of a backend span.

#### Scenario: From a slow span to its logs and profile

- **WHEN** an operator opens a slow `game MakeMove` span in Tempo
- **THEN** its logs and its CPU profile open from the span

### Requirement: Browser spans reach the collector through the BFF

The browser SHALL send its spans to `POST /otel/v1/traces` on `app.`, never to another origin. The BFF MUST forward
them to the collector only when `OTEL_ENABLED` is true (404 otherwise), MUST refuse bodies over 256 KB, and MUST
rate-limit per client IP.

#### Scenario: Tracing off

- **WHEN** the BFF runs with `OTEL_ENABLED=false`
- **THEN** the page loads no tracer and `POST /otel/v1/traces` answers 404

#### Scenario: An oversized body

- **WHEN** a client posts 1 MB to `/otel/v1/traces`
- **THEN** the BFF answers 413 and forwards nothing
