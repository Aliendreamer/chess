## Why

The owner wants chess news on the site (2026-10-02: "find news feeds for chess"). Members currently leave the club to
see what is happening in the chess world. Research the same day found five feeds that work today and whose terms allow
showing a headline with a link back.

## What Changes

For a member:

- Home gets a **News** panel: the latest headlines from several chess news sites, each with its source and age,
  opening the article on the source's site in a new tab.
- A **News** page (`/news`) lists more, filterable by source, page by page.
- The club shows headlines and links only — never article text — and says where each comes from.

In the code:

- Backend: a `NewsFetcher` cluster singleton fetches each configured RSS/Atom feed every 30 minutes, parses it safely,
  and keeps title, link, date and source in `news_items` for 30 days; `GET /api/news`.
- Sources in configuration (`News:Feeds`): FIDE, ChessBase, the Lichess blog, The Week in Chess and the English Chess
  Federation. chess.com is left out (its user agreement forbids displaying its content). A source can be switched off
  without a deploy.
- Frontend: the home panel and `/news`.

Part: cross-cutting (home). Out of scope: article text, images (they would make the browser call third-party hosts,
which the site avoids — fonts are self-hosted for the same reason), the lichess broadcast "Events now" box (left for
later; owner to decide), comments, notifications of news.

## Capabilities

### New Capabilities

- `chess-news`: fetching configured feeds, what is kept and for how long, the news read, the home panel and the news
  page.

### Modified Capabilities

(none)

## Impact

- Backend: `News/` (`NewsOptions`, `FeedParser` — pure, RSS 2.0 + Atom, `NewsFetcher` singleton, `NewsService`), a
  migration for `news_items`, `WebApi/News/ListNews/`, a named `HttpClient` with timeout and size cap,
  `Config/appsettings.json` `News` section (feeds listed there, but `NewsOptions.Feeds` must default to an empty array:
  the binder appends to a non-empty default).
- Frontend: `lib/news.ts`, `lib/server/news.ts`, `components/news.tsx`, the home panel, `routes/_authenticated/news.tsx`,
  navigation.
- Observability: one span and metric per fetch (`chess.news.fetch` with source and outcome), so a silent feed shows up
  in Grafana.
