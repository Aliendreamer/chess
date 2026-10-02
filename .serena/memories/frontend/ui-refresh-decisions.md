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

Next (owner, 2026-10-02): more UI, an open analysis board, chess news feeds. Being brainstormed; first question asked
was what "more UI" means (Live home/Club TV P6, screens for API-only features, polish, other).
