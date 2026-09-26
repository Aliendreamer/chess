Each group ends in one commit that passes `pnpm exec nx run-many -t lint test build` for the projects it
touches. 🐳 marks steps that need Docker or the live stack. Expected values in tests are fixed literals.
Components stay presentational; the logic they show lives in pure, tested helpers.

## 1. Foundation: tokens, fonts, shell

- [x] 1.1 Backend: failing `MeResponseFactory` test expecting `Username` (from `ICurrentUser`, the D23 name);
      then add it to `MeResponse`. Commit: `feat(backend): me returns the display name`.
- [x] 1.2 `styles.css`: the Club ramps and semantic tokens on `:root`, the `@theme` mapping (D1), base body
      styles; `@fontsource` packages for the three families (D2). Drop the zinc classes.
- [x] 1.3 Components in TS (`src/components/core`, `navigation`): `Button`, `Badge`, `Chip`, `OptionTile`,
      `Panel`, `SectionHeading`, `Wordmark`, `NavGroup`, `NavItem`. Render tests only where there is behaviour
      (variants, `selected`, `disabled`).
- [x] 1.4 The shell: `_authenticated.tsx` renders the 248px sidebar (wordmark, Play / Games nav, name from
      `me.username`) and the content column. `Dashboard`, `IdentityBar` and `Tile` go. The auth e2e's
      `identity-*` test ids move to the sidebar. Commit: `feat(frontend): club design tokens, fonts and shell`.

## 2. The game page

- [x] 2.1 Failing tests for `lib/games.ts`: clock text (`183000 → "3:03"`, `9500 → "0:09.5"` under 10 s,
      negative → `"0:00"`), move pairing (`["e4","e5","Nf3"] → [["e4","e5"],["Nf3"]]`), orientation and "my
      colour" from ids, result glyphs (`1-0 → "1–0"`, `1/2-1/2 → "½"`), the local countdown (D5) as a pure
      function of view + elapsed ms, and the frame-merge rule for the move list (append on ply+1, refetch
      otherwise).
- [x] 2.2 `useLiveTopic` (D9) with tests against the `live-fakes` socket; move `PingFeed` onto it (its test ids
      unchanged).
- [x] 2.3 `Board` in TS: FEN → squares, orientation, last-move and selection highlights, legal-target dots,
      click-to-move, promotion picker; `Clock`, `PlayerStrip`, `MoveList`. Tests: a click on a piece then a legal
      square calls `onMove("e2e4")`; an illegal square does not; Black orientation puts `a1` top-right.
- [x] 2.4 Server functions and loaders (D8): game live/summary/moves, move, resign, draw offer/accept/decline,
      abort; loader tests with a fake fetch (401 redirects, 409 is an outcome, 5xx throws).
- [x] 2.5 Route `/games/$id`: loader (D4), chess.js optimistic move and revert (D3), live frames, controls for
      players only, result + PGN link when ended. Add `chess.js`.
      Commit: `feat(frontend): the game page with live board and clocks`.

## 3. Home, matchmaking and invites

- [x] 3.1 Server functions: join/leave queue, create/get/accept/cancel invite, my games; loader tests.
- [x] 3.2 Home (`/`): greeting, quick-pairing tiles from the D12 presets with the waiting state (D6: live
      `queue:{tc}` count, 25 s heartbeat, Cancel, navigate on pairing), "Play a friend" (time control + colour →
      invite), recent games from `/api/me/games`.
- [x] 3.3 Route `/invites/$id` (D7): creator view (link, status, Cancel), guest view (Accept), navigate on
      `accepted`. Commit: `feat(frontend): quick pairing, invite links and home`.

## 4. History and PGN

- [ ] 4.1 Route `/games` (history, keyset "Load more") and a BFF server route `/games/$id/pgn` that streams the
      API's PGN as a download (cookie forwarded, never the API host). Commit:
      `feat(frontend): game history and pgn download`.

## 5. End to end and docs 🐳

- [ ] 5.1 🐳 Playwright `play.spec.ts`: two browser contexts (testuser, player) — create an invite as white,
      accept it in the other context, play the fool's mate by clicking squares, both see `0–1` and the PGN link.
      Proof: `tools/e2e.sh`.
- [ ] 5.2 Update `openspec/architecture.md` (the frontend section) and CLAUDE.md (screens, tokens, chess.js rule).
      Commit: `docs(repo): part 1 ui in architecture`.
