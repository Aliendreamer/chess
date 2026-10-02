# UI refresh (lichess-inspired) — decisions of 2026-10-01

Roadmap: ROADMAP.md §6 Part 5. Changes: board-look, game-page-navigation, game-feedback, user-preferences,
site-themes, responsive-layout (openspec/changes/). Proposals page: https://claude.ai/artifact/Ufvj6x1aLY36pTHTJfk9ii (P1–P10). User's answers:

- P1 pieces: YES — Cburnett SVGs, taken from Wikimedia Commons under the 3-clause BSD option (NOT the lichess copy,
  which is GPLv2+). Needs an attribution line.
- P2 board themes + lichess highlights (check glow, dest dots/rings): YES; default theme = lichess **Brown**
  (#f0d9b5 / #b58863).
- P3 living board (slide, drag, premove, arrows): YES via **react-chessboard** 5.x (MIT, maintained; owner's
  condition), rendered browser-only with a same-size placeholder (owner finds the SSR board odd). chessground is out:
  GPL-3.0 vs the planned **MIT** licence. react-chessboard has no premove — we add it.
- P4 sound: NO. Don't add sounds.
- P5 game page: YES to captured pieces/material, move navigation, flip board; NO to clock changes (no tenths, no red).
- P6 live home (counters, Club TV mini boards, `lobby` live kind): YES but to be discussed first. Spectating other
  members' games is wanted anyway.
- P7 colour: other themes allowed, **dark stays the default** (relaxes CLAUDE.md "dark only").
- P8 feedback moments (tab title, game-over card, rematch): YES.
- P9 preferences saved to the account (SSR, no flash): YES.
- P10 phone: YES, as its own OpenSpec change; responsive design throughout.

## Status (2026-10-02)

Verified on the live stack: backend integration 37/37, Playwright 32/32 (chromium + mobile), verify-part1.sh. Archived
board-look, game-page-navigation, game-feedback, user-preferences, site-themes (specs synced: new `chessboard`,
`game-feedback`, `user-preferences`, `site-themes`; `play-ui` and `game-matchmaking` extended). **responsive-layout
stays open** only for its real-phone check (task 5.1, the owner's to do); archive it after that.

Found on the way: Playwright `dragTo` needs `steps` (`e2e/support.ts#DRAG_STEPS`) — dnd-kit spends the activating move.
And a real bug: the API's rate limiter keyed on the remote IP, which for every BFF call is the BFF itself, so the whole
site shared 300/min (e2e hit 429). Owner's decision: key on the validated user (`user:{sub}`, limiter after
authentication; a forged cookie falls back to the IP), and the BFF forwards the real client IP on every upstream call
(rightmost X-Forwarded-For, one edge hop) — per-IP alone is not enough with CGNAT.

## Round 2 (2026-10-02): "more UI" options 1–3, under a /goal

Owner asked for UI work, open analysis tools and chess news feeds; then set the goal "do 1-3" = (1) finish Part 5's
open items, (2) screens for API-only features, (3) polish. Built as four OpenSpec changes, every task done and
verified (unit gates, 36/36 Playwright, integration tests):

- `live-home` (P6, defaults for the owner to confirm): `GET /api/lobby` (cached 2 s, `GetQueues` on the singleton),
  counters + "n waiting" on preset tiles, Club TV (6 latest games, no correspondence) as static `MiniBoard`s, `/watch`.
  Polling, not a live kind. OPEN: untimed games abandoned against the computer stay "in play" forever (55 from e2e).
- `player-profiles`: `GET /api/players/{id}` + `/games`, `/players/$id`, names are `PlayerLink`s everywhere, Profile
  in the nav. Replica reads users via `PlayerIdentity` only (ProjectDbContext skips its configuration).
- `admin-screens`: `/admin` dead letters (filter, replay, whole error) for the Admin role only; others get not-found.
- `ui-polish`: `pageTitle` on every route, router pending/error/not-found screens, catch-all `_authenticated/$.tsx`,
  `useLoadMore`/`LoadMore`, audit fixes (Maximum tile, study `*`, reason capitalised, file picker, a11y bits).

Round 3 (2026-10-02): built, owner said "build them": `analysis-board` (/analysis; shared AnalysisBoard +
useMoveTree; Analyse opens the board for FINISHED games only — judged by the live view, the replica lags),
`game-library` (library_games/positions/openings; openings = lichess chess-openings CC0 embedded and seeded; admin
import on /admin; /library search with pg_trgm; "In the library" + opening name on the board), `chess-news`
(news-fetcher singleton: 5 feeds every 30 min, lichess broadcasts every 10 min for Events now; News__Enabled=false in
tests). All verified on the stack (e2e 40/40, observability green). OPEN, owner's, left "for the end": PGN Mentor terms
and Caissabase CC0 check → then the first real library imports (game-library task 5.2; tools/library/SOURCES.md).
Lessons: python str.replace without assert silently skipped an edit; gate commits on the gate's exit code
(scratchpad fe-commit.sh); in-memory EF test stores need one name per test, not per scope.
