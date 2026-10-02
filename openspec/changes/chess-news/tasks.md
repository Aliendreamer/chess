## 1. Parsing

- [ ] 1.1 Save one sample of each feed under `Chess.Backend.Tests/News/Samples/` (fetched once, trimmed to 3 items) plus
      hostile samples (entity declaration, `javascript:` link, HTML in a title, 3 MB body). Failing unit tests for
      `News/FeedParser`: each sample's items (title, link, date incl. TWIC's format), the hostile cases refused or
      cleaned. Implement.

## 2. Fetching and storing

- [ ] 2.1 `NewsOptions` (Feeds default `[]`, FetchMinutes 30, KeepDays 30, MaxFeedBytes, TimeoutSeconds) and the five
      feeds in `Config/appsettings.json` (`SettingsTests` green); `news_items` entity + migration
      (`./build_migration.sh "AddNewsItems"`).
- [ ] 2.2 Failing TestKit tests for `NewsFetcher`: a round fetches every enabled feed through a fake client, one
      failing feed does not stop the others, items upsert on `(source, url)`, old items are pruned, conditional
      requests send the stored ETag. Implement as a cluster singleton with `ActorTracing` and the
      `chess.news.fetch` metric. Commit: `feat(backend): chess news from configured feeds`.
- [ ] 2.3 🐳 Integration test: a fake feed served by the test host is fetched, stored and listed by `GET /api/news`.

## 3. Reads and frontend

- [ ] 3.1 `WebApi/News/ListNews/` and `ListSources/` (SignedIn, keyset, cache header).
- [ ] 3.2 Failing vitest for `lib/server/news.ts` and `NewsList` (link, `target=_blank`, `rel`, source, relative age,
      empty state). Implement; home panel (8, "All news" link) and `/news` (source chips, Load more); News in the
      navigation. Commit: `feat(frontend): chess news on home`.
- [ ] 3.3 🐳 Playwright `e2e/news.spec.ts` against the stack (live feeds): home shows a News panel with at least one
      headline linking to an `https:` site, or its empty state if every feed is unreachable from the stack.
- [ ] 3.4 🐳 `tools/localdev/verify-observability.sh` still green; a `News` row on the backend dashboard (fetches per
      source and outcome).

## 4. Docs

- [ ] 4.1 CLAUDE.md (News note: sources, never article text or images, singleton fetcher, config), ROADMAP. Commit:
      `docs(repo): chess-news`.
