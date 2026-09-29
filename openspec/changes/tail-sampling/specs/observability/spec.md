## ADDED Requirements

### Requirement: Production sampling keeps what matters and whole traces

In the sampling setup the collectors SHALL keep every trace that has an error span, every trace with a slow
operation — a SERVER span over 1 s, an actor handling one message over 500 ms, or a projection record over 2 s — and
10 % of the others. The engine's think time MUST NOT make a trace slow. All spans of one trace MUST be sampled
together, however many collectors receive them.

#### Scenario: Errors and slow requests are kept

- **WHEN** traces with an error span and traces with a 2 s server span pass through the sampling setup among many
  fast ones
- **THEN** every error and slow trace is in Tempo, and about a tenth of the fast ones

#### Scenario: A move against the engine is not slow

- **WHEN** a trace holds an `engine move` span of 7 s and nothing else slow
- **THEN** it is kept only by the 10 % share

#### Scenario: Whole traces

- **WHEN** a trace's spans arrive at a gateway that routes to two samplers
- **THEN** a kept trace has all of its spans

### Requirement: Span metrics and the service graph count every trace

Span metrics and the service graph SHALL be derived from every span before sampling, under the names Grafana's service
map reads, and Tempo MUST NOT derive them again from the sampled traces.

#### Scenario: Counts are exact under sampling

- **WHEN** 200 fast traces of one service pass through the sampling setup
- **THEN** its span-metric call count is 200 while Tempo holds about 20 of them
