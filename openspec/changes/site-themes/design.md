## Context

`styles.css` defines raw ramps (ink, parchment, brass, moss, clay) and maps them onto semantic tokens (`surface-*`,
`fg-*`, `line-*`, `status-*`) in `@theme`. Components use only the semantic names, which is what makes a second
theme a pure CSS change. `user-preferences` puts `data-theme` on the Shell root. `category(tc)` in `lib/games.ts`
returns a label ("Blitz").

## Goals / Non-Goals

**Goals:** a light theme with no component changes, game-type colours, and icons with names.

**Non-Goals:** background images, user-defined colours, theming the board (that is the board theme, `board-look`).

## Decisions

1. **The light theme redefines semantic tokens only.** `[data-theme=light] { --color-surface-page: …; … }`, using a
   parchment ramp (backgrounds) and the ink ramp (text). The brass accent darkens to `oklch(0.5 0.09 75)` for
   contrast on light surfaces. Tailwind v4 utilities read the variables at runtime, so `bg-surface-card` follows the
   theme without new classes.
2. **Game-type tokens**: `--color-tc-bullet`, `-blitz`, `-rapid`, `-classical`, `-correspondence`, `-computer`, each
   redefined for light where needed. `lib/games.ts#categoryOf(tc)` returns a key (`'blitz'`) and the label comes from
   a map, so the colour class and the label never disagree. Static class map
   (`TC_BAR = { blitz: 'bg-tc-blitz', … }`) so Tailwind sees every class.
3. **lucide-react 1.47.0** (1.49.0 is younger than the workspace's `minimumReleaseAge`), imported per icon (`import { House } from 'lucide-react'`). Tree-shaking keeps the bundle
   to the icons used. _Alternative:_ an inline SVG sprite. Rejected: hand-maintained paths for about a dozen icons.
4. **Contrast is checked in a test**: a vitest computes the OKLCH → sRGB contrast of `fg-body` on `surface-page` and
   `surface-card` for both themes from the values in `styles.css`, and fails below 4.5.

## Risks / Trade-offs

- [The Club design files (`Design/`, untracked) describe dark only] → The light palette is defined here and should be
  reflected in `Design/` by the owner.
- [Colour-only meaning] → Every colour sits next to its text label (spec).
