## Context

Feeds checked on 2026-10-02 (fetched that day):

| Source                   | URL                                      | Format  | Notes                                                                                                    |
| ------------------------ | ---------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| FIDE                     | https://www.fide.com/feed                | RSS 2.0 | several a day                                                                                            |
| ChessBase                | https://en.chessbase.com/feed            | RSS 2.0 | ~100 items, several a day                                                                                |
| Lichess blog             | https://lichess.org/@/Lichess/blog.atom  | Atom    | about monthly                                                                                            |
| The Week in Chess        | https://theweekinchess.com/twic-rss-feed | RSS 2.0 | needs `Accept: application/rss+xml` (406 without); `pubDate` is not RFC-822 (`Thu Sep 17 20:10:00 2026`) |
| English Chess Federation | https://www.englishchess.org.uk/feed/    | RSS 2.0 | ~10 items                                                                                                |

Lichess broadcasts, checked the same day: `GET https://lichess.org/api/broadcast/top?page=1` answers JSON
`{ active, upcoming, past }` (56 active tournaments that day). Each entry has `tour` (`id`, `name`, `url`, `tier`,
`dates`, `info.location`, `info.tc`, `info.fideTC` standard/rapid/blitz, `image`) and `round` (`name`, `ongoing`,
`startsAt`, `url`). The API asks for one request at a time and a minute's pause after a 429; unauthenticated use is
"heavily rate-limited and might stop functioning", so a personal token is recommended. Broadcast games are CC BY-SA
4.0 — this change shows only tournament names and links, no games.

Left out: chess.com (user agreement forbids publicly displaying its content and automated retrieval), US Chess (403
behind Cloudflare), New in Chess (human verification), Chessdom (unreachable), chess24 (merged into chess.com).

The backend already runs periodic cluster singletons (`DeadlineSweeper`), named `HttpClient`s with timeouts, settings
classes validated at startup, and OTel spans and metrics per operation.

## Goals / Non-Goals

**Goals:** fresh headlines on home within the hour, from sources that allow it, without any request from the browser to
a third party and without trusting feed content.

**Non-Goals:** article bodies, images, per-user source choice, push updates.

## Decisions

1. **Fetch on the server, on a timer, as a singleton.** `NewsFetcher` (cluster singleton, like `DeadlineSweeper`) runs
   every `News:FetchMinutes` (30), one feed at a time, and upserts `news_items(id, source, title, url, published_at,
fetched_at)` unique on `(source, url)`; rows older than `News:KeepDays` (30) are deleted on each round. One node
   fetches, so the sources see one client however many backend nodes run.
2. **Feeds in configuration.** `News:Feeds` is a list of `{ id, name, url, accept?, enabled }`; the defaults in
   `appsettings.json` are the five above. `NewsOptions.Feeds` defaults to `[]` in code (the binder appends to non-empty
   array defaults — `AkkaOptions.Roles` rule), and `SettingsTests` keeps the file and class in step.
3. **Parsing that trusts nothing.** `FeedParser` (pure, unit-tested on saved samples of each feed):
   - `XmlReaderSettings { DtdProcessing = Prohibit, XmlResolver = null }` — no DTDs, no external entities;
   - the response body is capped (`News:MaxFeedBytes`, 2 MB) and the request times out (`News:TimeoutSeconds`, 10);
   - RSS `item` and Atom `entry`; title as plain text (HTML tags stripped, entities decoded, trimmed to 300 chars);
     link only if it is an absolute `https:` URL (else the item is dropped); date from RFC-822, RFC-3339, then a
     lenient `ddd MMM d HH:mm:ss yyyy` (TWIC), else `fetched_at`;
   - a feed that fails (HTTP error, timeout, bad XML) is logged with its source, counted in
     `chess.news.fetch{source,outcome}`, and the others carry on; the next round tries again.
4. **Reading.** `GET /api/news?source&cursor&limit` (SignedIn, primary is fine but the replica is used like every
   list; keyset by `(published_at, id)`), `private, max-age=300`. Home asks for 8.
5. **Frontend.** `NewsList` renders headline (an `<a target="_blank" rel="noopener noreferrer">`), source name and
   relative age; the source filter on `/news` is chips from the feeds the API reports (`GET /api/news/sources`). An
   outbound link says so for screen readers ("opens chessbase.com").
6. **Events now.** The same singleton asks `api/broadcast/top?page=1` every `News:EventsMinutes` (10), never in
   parallel with itself, and replaces the stored set `chess_events(id, name, url, round_name, round_url, ongoing,
location, fide_tc, tier, starts_at, ends_at, fetched_at)` with the `active` list (a whole snapshot, not a merge).
   `BroadcastParser` (pure, tested on a saved sample) keeps only those fields; URLs must be `https://lichess.org/…`;
   `image` is ignored (no third-party requests from the browser). A 429 pauses the next request by 60 s;
   `News:LichessToken` (a secret, env var only, empty by default) is sent as a bearer token when set. Home shows the
   top `News:EventsShown` (5): ongoing rounds first, then by tier (higher first), then start time — "live" on an
   ongoing round, otherwise the round's start; place and time control (`fideTC` mapped to Classical/Rapid/Blitz);
   each linking to the round on lichess (new tab, "opens lichess.org"). When the last snapshot is older than an hour
   (lichess unreachable), the box hides rather than showing stale events.
7. **Courtesy.** Requests send `User-Agent: ChessClub/<version> (+https://app.chess.localhost)` and honour
   `ETag`/`Last-Modified` (`If-None-Match` / `If-Modified-Since`, stored per feed in memory), so an unchanged feed is a 304.

## Risks / Trade-offs

- [Feeds change URL or start blocking] → a failing source is visible in the metric and the logs; switching it off is
  configuration. The home panel shows whatever the other sources have.
- [Terms change] → only headline + link are stored; removing a source deletes its rows (`DELETE … WHERE source`).
- [lichess rate-limits or changes the broadcast API] → one request per 10 minutes from one node, a token when
  configured, a 60 s back-off on 429, and the box hides when the snapshot is stale; nothing else depends on it.
- [Clock-less dates] → TWIC's lenient format is parsed explicitly; anything unparseable takes the fetch time, so it
  still sorts sensibly.

## Open Questions

(none — the owner added Events now to this change on 2026-10-02)
