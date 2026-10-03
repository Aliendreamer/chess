## Why

The layout is a fixed 248 px rail next to the content, and the game page is a two-column grid. On a phone the board
gets squeezed and the rail eats a third of the screen. Correspondence games are exactly the kind people answer from a
phone, right after the "your move" mail arrives. The owner accepted proposal P10 on 2026-10-01, as its own spec, with
the rule that the whole UI is responsive.

Part 5 (look and feel), sixth change. Builds on `board-look` (drag makes phone play comfortable) and
`game-page-navigation` (the nav bar under the board).

## What Changes

For a player:

- **Below 900 px** the rail becomes a top bar: the wordmark, a menu button that opens the navigation and the account
  links, and the user's initial. It works without JavaScript (`<details>`).
- **The game page stacks**: opponent strip, board (full width), your strip, the nav bar, then controls, then the move
  list (horizontal and scrolling on a phone, as on lichess).
- **Every page** works from 360 px wide with no horizontal scroll: home tiles reflow, history rows become two-line
  cards, and the study page stacks the board above the move tree.
- **Touch**: controls are at least 44 px tall on touch screens.
- Out of scope: a native app (still parked, ROADMAP §8), landscape-specific phone layouts.

## Capabilities

### New Capabilities

- `responsive-layout`: the breakpoints, the top bar, page stacking, minimum width and touch sizes.

### Modified Capabilities

None.

## Impact

- **Frontend:** `components/layout.tsx` (rail ↔ top bar), the page grids in `routes/_authenticated/*.tsx`,
  `components/games.tsx` (`MoveList` horizontal variant, `RecentGames` card rows), `components/studies.tsx`, and
  `styles.css` (breakpoint tokens).
- **Tests:** a Playwright project at 390×844 (iPhone 14 size) running the existing play specs, plus a check that no
  page scrolls horizontally.
