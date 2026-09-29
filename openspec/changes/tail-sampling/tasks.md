Each group ends in one commit that passes its gate. 🐳 = needs Docker.

## 1. Owner review

- [x] 1.1 The owner's answers of 2026-09-29 (proposal, decisions 1–6).

## 2. Metrics before sampling (local)

- [x] 2.1 The single collector derives span metrics and the service graph (connectors); Tempo keeps only
      `local-blocks`. 🐳 Proof: `verify-stack.sh`, the Grafana service map shows edges, `verify-observability.sh`.
      Commit `feat(repo): span metrics and the service graph from the collector`.

## 3. The sampling setup

- [x] 3.1 The gateway and sampler configurations (per-operation "slow", errors, 10 %), the compose override with two
      samplers, `stack.sh up --tail-sampling`. 🐳 `verify-tail-sampling.sh` with synthetic traces (telemetrygen):
      every error and slow trace kept, about 10 % of fast ones, a 7 s `engine move` not kept by the slow rules,
      kept traces complete, span-metric counts exact. Then back to the single collector. Commit
      `feat(repo): tail sampling behind a load-balancing tier`.

## 4. Docs

- [ ] 4.1 CLAUDE.md, architecture, the observability note (including dangling links, known, and how to adjust);
      archive. Commit `docs(repo): tail sampling`.
