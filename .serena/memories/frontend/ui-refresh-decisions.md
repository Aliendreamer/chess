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

## Status (2026-10-01, end of day)

All six changes implemented on main (commits b43d92b … ede3074); every task done except the 🐳 ones: Playwright
(`play.spec.ts` drag/premove/navigation/rematch, `settings.spec.ts`, `responsive.spec.ts` + the `mobile` project) and
the backend integration tests (`MatchmakingFlowTests` rematch, `PreferencesFlowTests`) are written but were never run
— no Docker in that session. Run `tools/e2e.sh` and `pnpm exec nx integration-test backend`, then archive the six
changes. Deviations from the first proposals: material is lichess's surplus rule (not captured pieces);
lucide-react pinned to 1.47.0 (workspace `minimumReleaseAge`); rematch endpoint lives in `WebApi/Matchmaking/Rematch/`;
preferences code in `Authentication/Preferences.cs` + `lib/auth.ts` (no tiny files). Found and fixed on the way: the
old board coloured a1 light.
