## Context

`components/layout.tsx#Shell` is a CSS grid `248px | 1fr`. Pages use `grid-cols-[repeat(auto-fit,minmax(320px,1fr))]`,
which already wraps but leaves the board column too narrow before it wraps. `--board-max` is 600 px. Tailwind v4 is
mobile-first with `@media` variants. There is no viewport-specific e2e project yet.

## Goals / Non-Goals

**Goals:** usable from 360 px, one breakpoint for the shell, no-JS menu, a stacked game page.

**Non-Goals:** a separate mobile site, gestures beyond drag (which `board-look` provides), landscape tuning.

## Decisions

1. **One shell breakpoint: 900 px** (`--breakpoint-shell` in `@theme`, used as the `shell:` variant). Below it, a
   sticky top bar. The menu is `<details><summary>`, so it works before hydration and without JS (same reasoning as
   the plain logout link). _Alternative:_ a drawer with JS. Rejected: SSR-first.
2. **Page grids are explicit.** The game and study pages use `grid-cols-1 shell:grid-cols-[minmax(0,var(--board-max))_minmax(0,380px)]`,
   so the board takes the full width until the breakpoint instead of waiting for `auto-fit` to wrap.
3. **Move list variant.** `MoveList` takes `layout: 'grid' | 'line'`. The page picks `line` below the breakpoint
   with a container query, which keeps the component pure. `scrollIntoView({ inline: 'end' })` keeps the latest move
   in view.
4. **Touch sizes** through `@media (pointer: coarse)` in `styles.css` on the shared `buttonClass`, `Chip` and form
   controls, so the rule is in one place.
5. **A Playwright `mobile` project** (390×844, `hasTouch`, `isMobile`) runs the play, invite and history specs, plus a
   generic "no horizontal scroll" check over every route.

## Risks / Trade-offs

- [The board under 360 px (very small phones)] → It shrinks with the width (the library sizes to its container), and
  coordinates scale down.
- [Two layouts double the e2e time] → The mobile project runs only a subset of the specs.
