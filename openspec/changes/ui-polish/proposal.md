## Why

A pass over every page on 2026-10-02 (desktop 1366 px and phone 390 px screenshots, plus a read of the routes) found
rough edges the Part 5 changes did not cover: every tab is titled "Chess", a failed load shows the framework's raw
error screen, "Load more" fails silently, an engine level's name is clipped, and a study shows a stray `*`. The owner
asked for polish of the existing pages as part of "more UI".

## What Changes

For a player:

- Each page has its own tab title ("History · Chess", "testuser vs player · Chess", a study's title, …).
- A slow navigation shows a thin progress bar; a failed one shows a Club-styled error panel with "Try again" and a way
  home; an unknown address shows a not-found page in the shell.
- "Load more" on History and Studies says when it is loading and shows an error when it fails.
- Home: "Recent games" gets a "View all" link to History and an empty state that points at Quick pairing.
- The engine level tiles fit their names ("Maximum" is no longer clipped).
- A study without a known result no longer shows `*`; the PGN file picker looks like the rest of the form.
- The navigation highlights Studies on a study and Settings/Profile/Admin on their sub-pages.
- The result panel writes the end reason as the game-over card does ("Checkmate").
- Accessibility: errors are announced as alerts, the board placeholder is a named group, the mobile menu closes with
  Escape, the avatar colour no longer follows the board theme.

In the code: `head` on each route, `defaultPendingComponent` / `defaultErrorComponent` / `defaultNotFoundComponent` in
`router.tsx` built from `components/layout.tsx`, small fixes in `components/{ui,games,layout,studies}.tsx`.

Part: 5 (look and feel). Out of scope: History filters (they need API parameters), new pages, visual redesigns.

## Capabilities

### New Capabilities

- `page-shell`: per-page titles, the pending/error/not-found screens, and the shared list behaviours (load-more states,
  empty states, navigation highlighting).

### Modified Capabilities

(none)

## Impact

- Frontend only: `router.tsx`, every file in `routes/_authenticated/`, `components/{layout,ui,games,studies}.tsx`, their
  tests, `e2e/responsive.spec.ts` (title and not-found checks).
