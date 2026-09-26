## Context

The frontend is still the Part 0 shell: zinc Tailwind, a `Dashboard` of tiles, and the `/pings/$id` page that
proves the BFF, the relay and the actors end to end. The BFF contract is fixed:

- the browser talks only to `app.`;
- server functions forward the `mp_sid` cookie;
- live state arrives over `/api/ws/live/{kind}/{id}` and is applied by `seq` (`lib/live.ts`).

The backend now serves matchmaking (`queue:{tc}`), invites (`invite:{id}`) and games (`game:{id}`), plus the
read side (`/api/games…`, `/api/me/games`, PGN).

The owner's "Club" design (`Design/`, untracked) is a small React kit written with inline styles: about 480
lines of tokens, components and screens. It's the visual source of truth, not code to import.

## Goals / Non-Goals

**Goals:**

- A player can queue or invite, play a full game with clocks, and see the result and PGN, entirely in the browser.
- Everything is TypeScript, with the Club tokens as the single source of colour, type and spacing.
- Moves feel instant, but the backend stays the only authority on legality and clocks.

**Non-Goals:**

- The screens and features listed as out of scope in the proposal.
- Pixel parity with every alternative in `Design/`: only `Chess A Club` counts.

## Decisions

### D1. Tokens become CSS variables plus Tailwind `@theme`. Components use utilities, not inline styles

`styles.css` defines the Club ramps and semantic tokens on `:root`, and maps the semantic ones into
`@theme`, for example `--color-surface-card`, `--color-text-muted` and `--font-display`. Components are then
written with ordinary Tailwind classes (`bg-surface-card text-text-muted font-display`). The app is dark-only,
as the design is. The `zinc` classes go away with the old components.

_Alternative:_ port the kit's inline styles as they are. Rejected because hover states would need JS state
(the kit uses `useState` for hover), and styles couldn't be shared or overridden.

### D2. Self-hosted fonts via `@fontsource`

`@fontsource/newsreader`, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` provide the latin
subset, in only the weights the design uses. There's no request to Google Fonts, which is no third party
seeing our users and nothing to allow in a future CSP.

### D3. chess.js in the browser is for feedback only. The server decides

The game page keeps a `Chess` instance built from the server's FEN in the latest `game` frame. It's used to:

- mark legal target squares when a piece is picked up;
- apply a move optimistically (the board updates at once);
- ask for promotion when a pawn reaches the last rank.

The move is always posted, and the answer (or the next frame) replaces the local position. A 409 or 422 reverts
to the last server view and shows the server's reason. chess.js never ends a game and never judges draws or
repetition, since FEN has no history; those come only from the server's `status`, `result` and `reason`.

### D4. The game page loads three things, and the live socket keeps it current

The SSR loader runs these in parallel:

- `GET /api/games/{id}/live` (the actor: position, clocks, status);
- `GET /api/games/{id}` (the replica: player names; right after a game starts it can 404 briefly, so the page
  falls back to `Player {id}`, D23);
- `GET /api/games/{id}/moves` (the replica: the SAN list).

The `game:{id}` frames then drive the page:

- a frame whose `ply` is one past the list appends `lastSan`;
- any other jump refetches `/moves` once.

Orientation is Black when `me.id === blackId`. Spectators see White's side and no controls (D20).

### D5. Clocks count down locally from the moment a view arrives

Each view carries `whiteMs`, `blackMs` and `clockAt`. The page counts down only the side to move, only while
`Playing` and after both first moves (ply ≥ 2, D13), using `performance.now()` since the view arrived rather
than `clockAt`, so a skewed browser clock can't shift it. The next frame corrects any drift. Flag fall shows
only when the server says so, never when a local clock hits zero; the display just stops at 0:00.

### D6. Matchmaking is waited on through the `queue:{tc}` frame, with the heartbeat as a fallback

Choosing a tile does the following:

- `POST /api/matchmaking/{tc}` is sent;
- if the answer is `matched`, go to the game;
- otherwise open `queue:{tc}` (its frame carries the waiting count and `lastPairing`) and re-POST with
  `?heartbeat=true` every 25 s (only a heartbeat may be answered with a recent pairing; a plain POST always seeks
  a new game);
- the first of the frame naming this user or a heartbeat answering `matched` navigates to the game;
- Cancel, or leaving the page, sends `DELETE`.

The tiles don't show live counts on Home. That would take one socket per preset for every visitor, so the
count shows only on the tile being waited on.

### D7. Invites use a page and the `invite:{id}` frame

"Play a friend" sends `POST /api/invites` and opens `/invites/{id}`:

- the creator sees a copyable link (`app.…/invites/{id}`), the status and Cancel;
- anyone else sees the time control, their colour and Accept;
- an `accepted` frame, or the accept answer, navigates both of them to the game.

Anonymous visitors already bounce through login with `returnTo` (the `_authenticated` guard), which is D17's
flow.

### D8. Commands return outcomes; they don't throw

Command server functions return `{ ok: true, view } | { ok: false, status, error }`, so a 409, 422 or 403 is
shown in the page. A 401 still redirects to login, and a 5xx throws to the route's error boundary. The loaders
keep the Part 0 behaviour: 401 redirects and everything else throws.

### D9. A shared `useLiveTopic` hook replaces the socket code in `PingFeed`

`useLiveTopic(kind, id, initial, isPayload)` opens the same-origin socket, applies frames with `applyFrame`, and
returns `{ view, status, error }`. `PingFeed` moves onto it, and its test ids stay the same. The pure helpers go
in `lib/games.ts` (clock text, move pairing, result glyphs, orientation, which side is "me") and are unit-tested
with fixed literals.

## Risks / Trade-offs

- [The replica lags just after a game starts, so names are missing for a moment] → Fall back to `Player {id}`,
  then use the names from the next load of the page. It's cosmetic only.
- [chess.js and the server disagree, which should never happen with standard chess] → The server wins, and the
  board reverts with its reason. The optimistic move is at most one frame of wrong display.
- [Local clocks drift or the tab sleeps] → Every frame resets them, and flag fall is decided by the server.
- [chess.js adds about 45 kB to the game route's chunk] → It's loaded only on the game route, and nothing else
  in the app needs it.
- [Heartbeats stop in a hidden tab (browsers throttle timers)] → Throttling keeps timers at least once a minute
  within the 60 s TTL only in some browsers. If you're dropped, the page shows "left the queue" with a rejoin
  button. Change 4's presence work revisits this.

## Migration Plan

This is frontend-only apart from the additive `username` on `/api/me`. The Part 0 e2e keeps passing because
the pings page keeps its test ids. Rollback means the previous frontend image.
