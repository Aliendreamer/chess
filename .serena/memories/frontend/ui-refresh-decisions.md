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

Round 3 (2026-10-02): owner approved the design for an open analysis board, a famous-games library (WC + classics,
search by details/opening/position) and chess news. Written as OpenSpec changes `analysis-board`, `game-library`,
`chess-news` (ROADMAP Part 6), not implemented yet; build in that order. Source research (licences, working feeds)
is in `game-library`/`chess-news` design.md. "Events now" (lichess broadcasts) is IN `chess-news` (owner, 2026-10-02).
Owner will check PGN Mentor and Caissabase licences later (1993–2004 gap waits on Caissabase).
