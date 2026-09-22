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
