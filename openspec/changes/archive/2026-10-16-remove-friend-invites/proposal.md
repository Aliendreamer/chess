## Why

In a club the members find each other through quick pairing; a shareable invite link for a friend is a public-site
feature. Rematch, which is built on the invite machinery, stays.

## What Changes

- **BREAKING** `POST /api/invites`, `GET /api/invites/{id}`, `POST /api/invites/{id}/accept` and `…/cancel` are removed;
  `InviteActor` keeps only the rematch path (`OfferRematch`, the `invite:{id}` live topic) and still recovers
  journaled invites.
- Home loses "Play a friend" (its middle column keeps Recent games, now 12); the `/invites/$id` page is removed.
- e2e and the verify scripts create two-player games through quick pairing (`pairedGame`, `queue_game`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `game-matchmaking`: invite links removed; the rematch requirement carries the invite rules it still needs.

## Impact

- Backend: `WebApi/Matchmaking/` (four invite endpoint folders deleted, `Rematch` on `GameRouteRequest`),
  `Akka/Matchmaking/InviteActor.cs`, tests.
- Frontend: `routes/_authenticated/{index,invites.$id}.tsx`, `lib/server/{api,play}.ts`, `lib/play.ts`, e2e
  (`support.ts#pairedGame`, play/review/abandon specs).
- `tools/localdev/verify-part1.sh`, `verify-part4a.sh`.
