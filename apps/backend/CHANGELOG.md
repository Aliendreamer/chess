## 0.2.0 (2026-09-29)

### 🚀 Features

- **backend:** continuous profiling ([50a9e7f](https://github.com/Aliendreamer/chess/commit/50a9e7f))
- **backend:** actor, cluster and pipeline metrics ([95b5037](https://github.com/Aliendreamer/chess/commit/95b5037))
- **backend:** trace context over kafka and the relay ([acc57c7](https://github.com/Aliendreamer/chess/commit/acc57c7))
- **backend:** trace commands through the actors ([e86d1ea](https://github.com/Aliendreamer/chess/commit/e86d1ea))
- **backend:** events carry their trace context ([0e94b2f](https://github.com/Aliendreamer/chess/commit/0e94b2f))
- **backend:** export telemetry over otlp ([0e59477](https://github.com/Aliendreamer/chess/commit/0e59477))
- **backend:** analyse one position per request ([d5b3b1e](https://github.com/Aliendreamer/chess/commit/d5b3b1e))
- **backend:** analyse at most ten positions per request ([c64cb44](https://github.com/Aliendreamer/chess/commit/c64cb44))
- **backend:** shared position analysis ([983e642](https://github.com/Aliendreamer/chess/commit/983e642))
- **backend:** study endpoints ([d304178](https://github.com/Aliendreamer/chess/commit/d304178))
- **backend:** studies with validated move trees ([5006d34](https://github.com/Aliendreamer/chess/commit/5006d34))
- **backend:** your turn list ([974f7e6](https://github.com/Aliendreamer/chess/commit/974f7e6))
- **backend:** email notifications for correspondence games ([1d6520e](https://github.com/Aliendreamer/chess/commit/1d6520e))
- **backend:** correspondence deadlines from the database ([a99e950](https://github.com/Aliendreamer/chess/commit/a99e950))
- **backend:** correspondence games ([eb4082c](https://github.com/Aliendreamer/chess/commit/eb4082c))
- **backend:** engine levels named casual to maximum ([d60e9be](https://github.com/Aliendreamer/chess/commit/d60e9be))
- **backend:** engine game endpoints ([0a6482f](https://github.com/Aliendreamer/chess/commit/0a6482f))
- **backend:** engine moves over kafka ([1e7668f](https://github.com/Aliendreamer/chess/commit/1e7668f))
- **backend:** games against an engine player ([a39b414](https://github.com/Aliendreamer/chess/commit/a39b414))
- **backend:** untimed games ([77a24d6](https://github.com/Aliendreamer/chess/commit/77a24d6))
- **backend:** every operational value from validated configuration ([e489641](https://github.com/Aliendreamer/chess/commit/e489641))
- **backend:** startup logging with steps, summary and fatal reason ([14841a8](https://github.com/Aliendreamer/chess/commit/14841a8))
- **backend:** presence on the hub and the claim endpoint ([cdd288a](https://github.com/Aliendreamer/chess/commit/cdd288a))
- **backend:** abandonment claims from player presence ([53079d4](https://github.com/Aliendreamer/chess/commit/53079d4))
- **backend:** me returns the display name ([9a55921](https://github.com/Aliendreamer/chess/commit/9a55921))
- **backend:** route ids accept guids with or without dashes ([f81cae0](https://github.com/Aliendreamer/chess/commit/f81cae0))
- **backend:** matchmaking and invite endpoints with live kinds ([1370629](https://github.com/Aliendreamer/chess/commit/1370629))
- **backend:** matchmaking queues per time control ([2dbe89a](https://github.com/Aliendreamer/chess/commit/2dbe89a))
- **backend:** game lists, history and pgn from the replica ([55eeb96](https://github.com/Aliendreamer/chess/commit/55eeb96))
- **backend:** project games into rm_games, rm_game_players and rm_moves ([842c282](https://github.com/Aliendreamer/chess/commit/842c282))
- **backend:** pgn builder from san ([6943197](https://github.com/Aliendreamer/chess/commit/6943197))
- **backend:** game commands over http, kafka and the live relay ([4869bfc](https://github.com/Aliendreamer/chess/commit/4869bfc))
- **backend:** game clocks, flag fall and abort ([cabf46a](https://github.com/Aliendreamer/chess/commit/cabf46a))
- **backend:** game actor with moves, draws and endings ([60d55f1](https://github.com/Aliendreamer/chess/commit/60d55f1))
- **backend:** chess rules adapter over gera.chess ([9652a0d](https://github.com/Aliendreamer/chess/commit/9652a0d))
- **backend:** generic relay-only live hub with snapshot on subscribe ([3b9ac42](https://github.com/Aliendreamer/chess/commit/3b9ac42))
- **backend:** enforce chess_api audience on api tokens ([bdaf5ec](https://github.com/Aliendreamer/chess/commit/bdaf5ec))
- **backend:** park failing projection events and quarantine the aggregate ([3ae6fdc](https://github.com/Aliendreamer/chess/commit/3ae6fdc))
- **backend:** projection dead-letter store ([076ff81](https://github.com/Aliendreamer/chess/commit/076ff81))
- **backend:** lastseq concurrency token on projection watermarks ([96a3062](https://github.com/Aliendreamer/chess/commit/96a3062))
- ⚠️ **backend:** keyset cursor pagination for list endpoints ([a42e1f1](https://github.com/Aliendreamer/chess/commit/a42e1f1))
- **backend:** publisher lag health detail ([641f6d3](https://github.com/Aliendreamer/chess/commit/641f6d3))
- **backend:** idempotency guard and consumer positions for kafka projections ([4904efb](https://github.com/Aliendreamer/chess/commit/4904efb))
- **backend:** journal-tailing kafka publisher as a fenced cluster singleton ([a67683f](https://github.com/Aliendreamer/chess/commit/a67683f))
- **backend:** postgres advisory lock fencing for the journal publisher ([4957bcc](https://github.com/Aliendreamer/chess/commit/4957bcc))
- **backend:** outbox offset table and journal event mappers ([042ed47](https://github.com/Aliendreamer/chess/commit/042ed47))
- **backend:** tag journal events with their kafka topic ([d4c23f7](https://github.com/Aliendreamer/chess/commit/d4c23f7))

### 🩹 Fixes

- **backend:** an uncreated game never journals an abort ([5524ef3](https://github.com/Aliendreamer/chess/commit/5524ef3))
- **backend:** a waiting answer carries the queue seq so old pairings are ignored ([c7053d6](https://github.com/Aliendreamer/chess/commit/c7053d6))
- **backend:** a fresh queue join never answers with a finished game ([8112b04](https://github.com/Aliendreamer/chess/commit/8112b04))
- **backend:** replica health no longer degrades when the primary is idle ([ab4c4f0](https://github.com/Aliendreamer/chess/commit/ab4c4f0))

### ⚠️ Breaking Changes

- **backend:** keyset cursor pagination for list endpoints ([a42e1f1](https://github.com/Aliendreamer/chess/commit/a42e1f1))
  api/pings no longer accepts page/pageSize and its response shape changed.
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>

### ❤️ Thank You

- Aliendreamer @Aliendreamer
- Claude Opus 5.5 (1M context)

## 0.1.1 (2026-09-22)

### 🚀 Features

- **backend:** pings signalr hub fed by distributedpubsub fan-out ([9258096](https://github.com/Aliendreamer/chess/commit/9258096))
- **backend:** kafka publisher, akka.streams consumer host, rm_pings projection ([ead5220](https://github.com/Aliendreamer/chess/commit/ead5220))
- **backend:** replica-bound readdbcontext, rm_pings read model, list endpoint, replica health ([34df08b](https://github.com/Aliendreamer/chess/commit/34df08b))
- **backend:** ping sharding region and command/live endpoints ([d48c05c](https://github.com/Aliendreamer/chess/commit/d48c05c))
- **backend:** pingactor — persist, publish-after-persist, pubsub, snapshots ([da4fdb2](https://github.com/Aliendreamer/chess/commit/da4fdb2))
- **backend:** versioned event envelope and pinged event ([8131802](https://github.com/Aliendreamer/chess/commit/8131802))
- **backend:** akka.net actor system — single-node cluster, sbr, sql persistence, pubsub ([8089942](https://github.com/Aliendreamer/chess/commit/8089942))
- **backend:** redis as fusioncache l2 + backplane, distributed rate limiting, trusted proxies ([1792424](https://github.com/Aliendreamer/chess/commit/1792424))

### 🩹 Fixes

- **backend:** three faults that stopped the part 0 backend from running ([fd7867c](https://github.com/Aliendreamer/chess/commit/fd7867c))
- **backend:** point the integration tests at their own containers, wait for the node ([75aa784](https://github.com/Aliendreamer/chess/commit/75aa784))
- **backend:** log signalr push failures from the pings fan-out actor ([ad7becb](https://github.com/Aliendreamer/chess/commit/ad7becb))
- **backend:** honest kafka health-check test, retry any exception in consumer host ([c25ddcd](https://github.com/Aliendreamer/chess/commit/c25ddcd))
- **backend:** drop shadowing route constraint, handle ping ask timeout ([cd442de](https://github.com/Aliendreamer/chess/commit/cd442de))
- **backend:** pascal-case const fields in editorconfig, strip migration bom, release config ([a988578](https://github.com/Aliendreamer/chess/commit/a988578))

### ❤️ Thank You

- Aliendreamer @Aliendreamer
- Claude Haiku 4.5
- Claude Opus 5 (1M context)
- Claude Sonnet 5
