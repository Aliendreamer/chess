## Why

The Part 1 backend can pair players, start games from invite links, play them with clocks and serve the
history, but a player can only reach any of it with curl. The owner's "Club" design (kept untracked in
`Design/`) defines the look. This change gives Part 1 its first playable UI with the smallest set of screens
that covers what the backend already does.

## What Changes

For a player:

- The app takes the Club look: a dark, warm palette with one brass accent, Newsreader, IBM Plex Sans and Plex Mono,
  hairlines instead of shadows, and a 248px left sidebar with the wordmark, navigation and their name.
- **Home** has "Quick pairing" tiles for the preset time controls. Choosing one waits in that queue, shows how
  many are waiting and has Cancel, and moves them into the game once they're matched. Home also has "Play a
  friend", which creates an invite link (time control plus colour), and a list of their recent games.
- **Invite page** (`/invites/{id}`): the creator sees the link and its status, a friend sees Accept, and both go
  to the game when it starts.
- **Game page** (`/games/{id}`): the board from their side, with player strips and clocks counting down locally.
  It also has the move list, and resign, draw (offer, accept or decline) and abort. Moves are made by clicking a piece then a square,
  with instant feedback for legal moves. The server stays the judge: a rejected move snaps back. Spectators
  see the same page read-only. An ended game shows the result, the reason and a PGN download.
- **History** (`/games`): their games, newest first, with a PGN link for each.

In the code:

- The design tokens become CSS variables and Tailwind v4 `@theme` entries in `apps/frontend/src/styles.css`.
  Fonts are self-hosted (`@fontsource`), with no third-party request.
- The design's components are rewritten in TypeScript under `src/components/`: core, navigation and chess. They
  stay presentational, and the pure logic is unit-tested.
- `chess.js` is used in the browser only, for legal-move hints, the optimistic board and SAN for the move list.
  Every move is still posted to `POST /api/games/{id}/moves` and the backend's answer wins (D6).
- New server functions cover matchmaking, invites, game commands and game reads. The live sockets for the
  `game`, `queue` and `invite` kinds reuse `lib/live.ts`.
- Backend: `GET /api/me` also returns `username` (D23) for the sidebar.

Part: 1. Depends on D5 (the live relay), D12 (presets), D16 and D17 (matchmaking and invites), D18 (endings),
D20 (spectators), D22 (PGN) and D23 (display names). It settles no new ROADMAP decision.

Out of scope: vs Computer, correspondence, study and analysis, ratings, the lobby list of open seeks, the admin
StatusPanel and EventLog, mobile-specific layouts beyond the design's wrapping grids, a light theme,
presence and abandonment (change 4), drag-and-drop moves, and sounds and premoves.

## Capabilities

### New Capabilities

- `play-ui`: the Part 1 screens (shell, home, invite, game, history) and their contract with the BFF, meaning
  which server functions and live kinds each screen uses, and the rule that the client never decides legality.

### Modified Capabilities

<!-- none: /api/me gaining `username` is additive and not a spec-level requirement change -->

## Impact

- `apps/frontend`: `styles.css`, new `src/components/{core,navigation,chess}`, new routes under
  `src/routes/_authenticated/`, `lib/server/api.ts` and `api-loaders.ts`, and new `lib/games.ts` (pure helpers).
  The old zinc `Dashboard`, `IdentityBar` and `Tile` are replaced. The `/pings/$id` page keeps its test ids so the
  Part 0 e2e still passes.
- New npm dependencies: `chess.js`, `@fontsource/newsreader`, `@fontsource/ibm-plex-sans` and
  `@fontsource/ibm-plex-mono`. `lucide-react` is removed if nothing uses it any more, since the design has no icon
  set.
- `apps/backend`: `MeResponse` gains `Username`.
- `Design/` is read, never copied wholesale and never committed.
