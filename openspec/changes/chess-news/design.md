## Context

Feeds checked on 2026-10-02 (fetched that day):

| Source                   | URL                                      | Format  | Notes                                                                                                    |
| ------------------------ | ---------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| FIDE                     | https://www.fide.com/feed                | RSS 2.0 | several a day                                                                                            |
| ChessBase                | https://en.chessbase.com/feed            | RSS 2.0 | ~100 items, several a day                                                                                |
| Lichess blog             | https://lichess.org/@/Lichess/blog.atom  | Atom    | about monthly                                                                                            |
| The Week in Chess        | https://theweekinchess.com/twic-rss-feed | RSS 2.0 | needs `Accept: application/rss+xml` (406 without); `pubDate` is not RFC-822 (`Thu Sep 17 20:10:00 2026`) |
| English Chess Federation | https://www.englishchess.org.uk/feed/    | RSS 2.0 | ~10 items                                                                                                |

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
6. **Courtesy.** Requests send `User-Agent: ChessClub/<version> (+https://app.chess.localhost)` and honour
   `ETag`/`Last-Modified` (`If-None-Match` / `If-Modified-Since`, stored per feed in memory), so an unchanged feed is a 304.

## Risks / Trade-offs

- [Feeds change URL or start blocking] → a failing source is visible in the metric and the logs; switching it off is
  configuration. The home panel shows whatever the other sources have.
- [Terms change] → only headline + link are stored; removing a source deletes its rows (`DELETE … WHERE source`).
- [Clock-less dates] → TWIC's lenient format is parsed explicitly; anything unparseable takes the fetch time, so it
  still sorts sensibly.

## Open Questions

- "Events now" from the lichess broadcast API (current tournaments, CC BY-SA games): owner to decide whether it joins
  this change or comes later.
