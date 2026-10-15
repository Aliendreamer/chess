## Context

Reused: the BFF's presence reports for `game:` topics (`LiveRelay.Present/Absent`, per-process instance id, 30 s
refresh), `InviteActor` (sharded `invites`, an invite reserved for one member through `ForId`, `invite:{id}` live kind),
`IGameStarter`, `MatchmakingActor` (queue places), `ISessionStore` (opaque `mp_sid` sessions), the `chess_api` service
account (already granted `manage-users`, `view-users`, `query-users` by `keycloak-init`), the Admin role and `/admin`.

## Decisions

### D1 Presence

- The Shell subscribes to `user:{me}` on every page. The BFF reports `Present`/`Absent` for `user:` topics as it does
  for `game:` ones; `LiveRelay` routes them to `PresenceActor` (cluster singleton `presence`), which keeps
  `(userId, instance) → lease` with the game lease's length (`Akka:PresenceLeaseSeconds`). Online = at least one live
  lease. The BFF only reports presence for the signed-in member's own `user:` topic.
- Playing: `PresenceActor` reads `GameStarted`/`GameEnded` for games against a person from DistributedPubSub topic
  `presence` (published by `GameActor` on start and end, untraced fire-and-forget); a member with a live game against a
  person is `playing`. Games against the computer do not count.
- `users."LastSeenAt"` is written when a member's last lease ends (once per going offline, not per heartbeat).
- `GET /api/members` (signed in): active members `{id, username, state: online|playing|offline, lastSeenAt}`, online
  first then by name; states from `GetPresence` on the singleton (null → every member `offline`, the list still loads).
- Live kind `members`: the singleton publishes a frame when anyone's state changes; `/members` subscribes and re-reads.

### D2 Challenges

- `POST /api/challenges {opponentId, timeControl, color}` (signed in, preset only, color `white|black|random`):
  refused with 409 when the opponent is offline, playing, already has an open challenge to them, is the challenger,
  is deactivated, or when the challenger already has an open challenge out. The checks ask `PresenceActor`
  (`TryReserveChallenge` → reserves both ends atomically, released on any end).
- It creates an invite with a new id: `InviteCreated` gains an optional `Lifetime` (seconds; absent = 24 h, so old
  rows read) and `Kind` (`rematch|challenge`, absent = rematch). Challenge lifetime is 60 s (`Challenge.Lifetime`, a
  game rule, in code). The expiry is an actor timer, so the frame `expired` is pushed when it runs out.
- `InviteActor` gains `Decline` (only the `ForId` member) → status `declined`; `Cancel` (only the creator) →
  `cancelled`; the existing accept path starts the game through `IGameStarter` with the creator's colour choice.
- The challenged member's `user:{id}` snapshot lists open challenges to them (`{inviteId, from, timeControl, color,
expiresAt}`); the singleton publishes a `user:` frame on every challenge change. The challenger follows
  `invite:{id}`.
- Endpoints: `POST /api/challenges`, `POST /api/challenges/{id}/accept|decline|cancel`. Accept answers `{gameId}`; the
  BFF navigates both browsers to `/games/{id}` (the challenger from the `invite:` frame).

### D3 Member admin

- `Authentication/KeycloakAdmin.cs`: `IKeycloakAdmin` over the admin REST API with a client-credentials token for
  `chess_api` (cached until shortly before expiry): create user (username, first/last name from the full name, email,
  enabled, a temporary password with `UPDATE_PASSWORD` required), set enabled, reset the password (temporary), add or
  remove the realm role `Admin`, list users.
- `users` gains `Active` (default true) and `LastSeenAt`. Create also inserts the `users` row (by the Keycloak id as
  `Sub`, username), so the member is listed before first sign-in; JIT provisioning finds it by `Sub`.
- Deactivate: Keycloak `enabled=false`, `users.Active=false`, `ISessionStore.RevokeAllAsync(sub)` (and its cache
  entries), challenges to and from them cancelled, queue places dropped (`LeaveAllQueues`). `UserProvisioningPreProcessor`
  answers 401 for an inactive user even with a live token (defence in depth).
- Temporary password: 16 characters from a URL-safe alphabet (`RandomNumberGenerator`), returned once in the answer,
  never logged or stored by us.
- `GET /api/admin/members`, `POST /api/admin/members`, `POST …/{id}/deactivate|reactivate|reset-password`,
  `PUT …/{id}/admin {admin: bool}`; all `Roles(Admin)`. An admin cannot deactivate themselves or remove their own role
  (400). Keycloak failures answer 502 with a message; nothing in our database changes then.

### D4 Studying club games

- `GET /api/players/{id}/games` already lists a member's games; the profile and `/members` rows link Analyse
  (`/analysis?game={id}`) for finished games. The game page shows the review panel for any finished game, whoever opens
  it (the read is already open).

### D5 Frontend

- `components/layout.tsx#Shell`: `useLiveTopic('user', me)`; `ChallengeBanner` (fixed, top) lists open challenges with
  a countdown and Accept/Decline; Accept navigates to the game.
- `/members` (`wide fill`): a list with state dots, last seen, Challenge (a popover: presets as chips, colour, Send);
  while out, "Waiting for {name}… 0:42" with Cancel, then "Declined"/"No answer".
- `/admin`: a Members tab: create form, the one-time password panel with Copy, the list with actions.
- `lib/members.ts` (types, countdown, state order), `lib/server/members.ts`, `lib/server/api.ts` entries; `live-relay.ts`
  `KINDS` gains `user` (own id only) and `members`.

## Risks

- Presence after a BFF restart: leases expire after `PresenceLeaseSeconds`, so a member may show online that long.
- A challenge accepted at the last second races its timer; the actor decides (accepted wins if it arrives first).
- Keycloak admin API changes between versions: pinned to the stack's 26.0, covered by integration tests.
