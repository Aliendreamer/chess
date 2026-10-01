## Why

Lichess feels lively because colour carries meaning: you see a game's type before you read it, and the icons make the
navigation scannable. Our UI is one brown-and-brass palette, dark only, with text-only links. The owner accepted
proposal P7 on 2026-10-01: other site themes are allowed, and **dark stays the default**.

Part 5 (look and feel), fifth change. Depends on `user-preferences` (the `siteTheme` setting). Relaxes the "dark only"
line in CLAUDE.md's UI note.

## What Changes

For a player:

- **A light site theme (Parchment)**, chosen on `/settings`. Dark (today's Club) stays the default and is unchanged.
- **A colour per game type**: bullet red, blitz amber, rapid green, classical blue, correspondence violet, against the
  computer slate. Shown on the quick-pairing tiles (a top bar and the category name), on history and "Your turn" rows
  (a small marker), and in the game page header. Brass remains the brand accent.
- **Icons** (Lucide, ISC licence) on the rail navigation (Home, History, Studies, Settings), on the game-type tiles,
  and on the main game actions (resign, offer draw, flip, analyse). Every icon sits next to a text label or has an
  accessible name.
- Out of scope: background photos (the lichess "transparent" theme), more than one light theme, custom colours.

## Capabilities

### New Capabilities

- `site-themes`: the site themes, the game-type colours, and the icon rule.

### Modified Capabilities

- `play-ui`: "The UI uses the Club design tokens only" now allows a theme to redefine the semantic tokens, and adds
  the game-type tokens.
- `user-preferences`: `siteTheme` accepts `light`.

## Impact

- **Frontend:** `styles.css` (a `[data-theme=light]` block that redefines the semantic tokens; `--color-tc-*` tokens),
  `lib/games.ts` (`categoryOf(timeControl)` returning a key, not just a label), `components/ui.tsx` (`OptionTile`
  colour bar and icon), `components/layout.tsx` (icons), `components/games.tsx` (markers), `/settings` (Light
  option). Dependency `lucide-react` 1.49.0 (exact pin, ISC), imported per icon so only the icons used are bundled.
- **Backend:** `Users/Preferences.cs` accepts `light`.
- **Docs:** CLAUDE.md UI note ("dark only" becomes "dark by default, light optional").
