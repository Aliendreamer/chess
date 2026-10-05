## Why

A game against the computer is untimed and ignores presence (engine-play: "no abandonment"), so a member who closes the
tab mid-game leaves it "in play" for ever: on home's games-in-play count, Club TV and `/watch` (the open note under
`live-home` in ROADMAP Part 5). The owner decided on 2026-10-05: "untimed if player leave we finish them after 1 min".

## What Changes

For a member playing the computer:

- **Leaving ends the game.** Once the member has made a move, if they are away from the game (no open game page) for
  one minute, the game ends: the computer wins with reason **Abandonment**. Coming back within the minute changes
  nothing. Nobody is offered a claim: the computer does not claim, the game simply ends.
- **Before the member's first move** nothing changes: the existing first-move abort (one minute while the member is to
  move) aborts it.
- **Games already stuck "in play"** against the computer end by the same rule, so home, Club TV and `/watch` stop
  showing them; this also covers a game whose node went down while nobody had it open.
- Games between people are unchanged (absence offers the claim to the opponent), and so are correspondence games (the
  missed deadline is their only abandonment).

In the code: `GameActor` tracks presence in engine games from the member's first move, without waiting for a BFF report,
and ends the game itself once the member has been away for `Akka:AbandonAfterSeconds`; the `DeadlineSweeper` singleton
also wakes untimed games in play that have been quiet for `Akka:UntimedIdleMinutes`, so a game with no live actor gets
judged.

Part: 2 (games against the engine), settling the Part 5 `live-home` open note. Out of scope: a configurable grace per
member, pausing a game against the computer, any change to games between people or correspondence games, ratings.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `engine-play`: "No abandonment or draw offers in engine games" becomes "abandonment ends an engine game, draw offers
  still refused"; a new requirement for quiet engine games to be woken and judged.

## Impact

- Backend: `Akka/Games/GameActor.cs` (presence in engine games, the automatic end), `Correspondence/Deadlines.cs`
  (`DeadlineSweeper` asks quiet untimed games too, through `IDueDeadlines`), tests in
  `Chess.Backend.Tests/Games/{EngineGameTests,GamePresenceTests}.cs` and `Correspondence/DeadlineTests.cs`. No
  migration, no new event type (the end is the existing `GameEnded` with `Abandonment`), no new setting.
- Frontend: none needed (the BFF already reports presence for every `game:` topic; `abandonment` already has its text).
  The ended game reads "0-1 · Abandonment" like any other.
- Read side: the end reaches `rm_games` through the existing projection; the lobby's in-play count drops it.
