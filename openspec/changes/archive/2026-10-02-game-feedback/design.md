## Context

Invites (`Akka/Matchmaking/InviteActor`, sharded `invites`, persistence id `invite-{id:N}`) are journal-only: their
events are not tagged for Kafka. Each invite has a live topic `invite:{id}` whose snapshot is the `InviteView`, and the
creator's page navigates when the frame names a game. Game ids are Guid v7 and invite ids Guid v4. A finished game's
reads come from `rm_games` (`IEndedGameReader`), so its actor is not woken.

## Goals / Non-Goals

**Goals:** tab signals, the game-over card, rematch, the found flash and the draw emphasis, reusing invites for
rematch instead of adding a new aggregate.

**Non-Goals:** sound, chat, notifications outside the page (mail stays for correspondence only), browser
notifications.

## Decisions

1. **The rematch is an invite whose id is the game's id.** Both pages already know that id, so the game page can
   subscribe to `invite:{gameId}` the moment the game ends, and no lookup or new topic is needed. Ids cannot collide:
   invites live in their own region and persistence-id prefix, and v4 and v7 never overlap.
   _Alternative:_ a `RematchOffered` event on the game. Rejected: it would wake ended (passivated) game actors, and
   it would need a Kafka tag and mapper for an event no read model needs.
2. **`OfferRematch(InviteId, UserId, OpponentId, TimeControl, Color)`** on `InviteActor`. If no invite exists, it
   creates one with `ForId = OpponentId` and `RematchOf = InviteId`. If `UserId` is the reserved guest, it behaves as
   `AcceptInvite`. If `UserId` is the creator, it returns the current view. One actor call makes the endpoint
   idempotent and race-free: both players pressing at once produce one create and one accept.
3. **`InviteCreated` gains `forId` and `rematchOf`**, both optional and nullable on the wire, so old journal rows
   deserialise with nulls. `AcceptInvite` checks `ForId` (Forbidden otherwise).
4. **The endpoint** (`WebApi/Matchmaking/Rematch/`) reads the ended game from `rm_games` (players, time control, colours,
   engine flag), checks the caller, then asks the invite region. 409 while playing, 403 for non-players, 400 for an
   engine game. `ClearDefaultAccepts()` (body-less POST), `no-store`.
5. **Engine rematch stays in the frontend.** The card calls the existing `POST /api/engine-games` with the same level
   and the other colour.
6. **Tab signals are pure.** `lib/feedback.ts#tabState(view, meId, names)` returns `{ title, turn }`. A small
   `useTabSignals` hook writes `document.title` and swaps `link[rel=icon]` between `/favicon.svg` and
   `/favicon-turn.svg` (both new, a knight silhouette in brass). The hook restores both on unmount.
7. **The card shows only on a live transition.** The page remembers the status it was loaded with. The card opens
   when a frame changes `playing` to `ended`.

## Risks / Trade-offs

- [A rematch invite outlives interest (24 h)] → Same as any invite. The creator can cancel it, and it expires.
- [An old journal with the new optional fields missing] → Covered by a deserialisation test on an `InviteCreated`
  JSON without them.
- [Correspondence rematch after 24 h is impossible because the invite expired] → Accepted. A new invite works as
  today.

## Migration Plan

Backend first (the new fields are optional, so older nodes can still read the events), then the frontend. Rolling
back the frontend leaves the endpoint unused.
