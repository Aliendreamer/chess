## Context

Presence (presence-and-abandonment) lives in `Akka/Games/GameActor.cs`: the BFF's `lib/server/live-hub.ts` reports
`Present` for every `game:` topic a signed-in player has open (refreshed every 30 s) and `Absent` as soon as their last
socket on it closes. The actor keeps a lease per BFF instance (`Akka:PresenceLeaseSeconds`, 75 s), persists
`PlayerLeft`/`PlayerReturned`, and once one player has been away `Akka:AbandonAfterSeconds` (60 s) persists
`AbandonmentOffered` so the other may `ClaimAbandonment` (win or draw). `HandlePresence` drops every report in a game
against the engine (`_engine is not null`) and in a correspondence game, and `PresenceActive` also needs `_tracking`
(set by the first report) and `Ply >= 2`.

Games against the engine are `untimed`: no clock, the first-move abort only while the person is to move
(`HandleAbortCheck`), and idle passivation while playing after `Akka:UntimedIdleMinutes` (30). Sharding runs with
`RememberEntities = false`, so a passivated game, or one whose node went down, has no actor until a message arrives —
and in an engine game nothing arrives once the person has gone. Those are the games left "in play" on home, Club TV and
`/watch` (`WebApi/Lobby/LobbyReads.InPlay`: `rm_games.Status == playing`).

`Correspondence/Deadlines.cs` already has a cluster singleton, `DeadlineSweeper`, that every `Correspondence:SweepSeconds`
(60) reads `IDueDeadlines.DueAsync` and sends `CheckDeadline(gameId)` to the `games` region; the actor judges.

## Goals / Non-Goals

**Goals:** a member who leaves a game against the computer loses it after a minute away; no engine game stays in play
with nobody at it, including the ones already stuck and those that lost their node.

**Non-Goals:** changing games between people or correspondence games; a claim UI for the engine; new settings; a
migration.

## Decisions

1. **The person's presence is tracked in engine games; the engine counts as always present.** `HandlePresence` accepts
   reports in engine games (still not in correspondence games), only for the person's id. Presence there is active
   from the person's first move (`Ply >= 1` with the engine black, `Ply >= 2` with it white — i.e. the person has
   moved), and does not wait for a first BFF report: an engine game with nobody reporting must still be judged. The
   existing rules then apply unchanged: a closed tab is `Absent` at once → `PlayerLeft`; a dead BFF is absent when its
   lease runs out; a freshly recovered actor presumes the person present for one lease (D4 of presence-and-abandonment).
2. **At one minute away the actor ends the game itself.** Where a game between people persists `AbandonmentOffered`,
   an engine game persists `GameEnded(engine side wins, Abandonment)` — the event every consumer already handles, so
   the projection, PGN, lobby and live frame need nothing new. `ClaimableBy` stays null in engine games (no claim
   panel; the engine never claims). Returning within the minute persists `PlayerReturned` as today.
   Considered: aborting instead of a loss once moves were made — rejected by the owner's rule (the computer wins).
3. **Before the person's first move, the abort stays the only rule.** The first-move abort (`HandleAbortCheck`, one
   minute while the person is to move, no result) already covers "left before playing"; presence is not active then,
   so the two never race.
4. **Quiet engine games are woken by the deadline sweeper.** `IDueDeadlines.DueAsync` also returns untimed games with
   `rm_games.Status = playing` and `UpdatedAt` older than `Akka:UntimedIdleMinutes`, up to the same `MaxPerSweep`
   after the correspondence rows. The sweeper sends them the same `CheckDeadline`; for an untimed game it is a wake-up
   (no deadline to judge), the actor recovers, presence is active (decision 1), nobody reports, and the game ends one
   lease plus one minute later (≈ 2¼ min). A game whose person is in fact there (thinking for half an hour) is woken
   harmlessly: the BFF's reports keep them present. This one path heals the games stuck today (no one-off script, no
   migration) and every future node loss. Read on the primary (`ProjectDbContext`, where `rm_games` is projected), so
   the replica's lag never re-wakes an ended game; a game is asked each sweep until its end reaches `rm_games`, like a
   correspondence deadline.
   Considered: a startup one-off (misses node losses after it), a new singleton (duplicates the sweeper), deadline rows
   for engine games (writes on every move for a value derived from `UpdatedAt`).
5. **Passivation.** Every presence report re-arms the actor's timers, so a present person's game is not passivated
   under them; an absent person's game ends long before `UntimedIdleMinutes`. After the end the existing after-end
   passivation applies.

## Risks / Trade-offs

- A member whose connection drops for over a minute loses to the computer → the same rule people games already have
  (there the opponent may claim); the minute is `Akka:AbandonAfterSeconds`, shared on purpose.
- Up to `MaxPerSweep` (100) wake-ups a minute when many engine games are quiet → each costs one recovery; the stuck
  backlog drains in a few sweeps and then only genuinely quiet games appear.
- `rm_games` has no index for `(TimeControl, Status, UpdatedAt)` → untimed games in play are few; the query plan is
  checked in the integration test run and an index added only if it scans.

## Migration Plan

Deploy the backend; within a few sweeps every stuck engine game ends with `0-1`/`1-0 · Abandonment` (or is aborted if
the person never moved). Rollback = the previous image; games already ended stay ended.

## Open Questions

(none)
