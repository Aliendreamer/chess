## Why

Today the site only tells you something happened through a line of text. If you are in another tab you do not know
that it is your move. A game ends with a small panel, and getting a second game against the same person means sending
a new invite link. Lichess makes these moments obvious. The owner accepted proposal P8 on 2026-10-01, without sound
(P4 was declined).

Part 5 (look and feel), third change. Builds on `board-look` (the board the card sits on). Leans on D20 (spectators)
and the invite rules from Part 1 (game-matchmaking).

## What Changes

For a player:

- **The tab tells you.** While it is your move, the title reads `● Your move · vs {opponent}` and the favicon gets a
  brass dot. When a draw is offered to you, the title reads `● Draw offered · vs {opponent}`. Both go back once you
  have moved or answered.
- **Game-over card.** When a game ends while you watch, a card over the board shows the result and the reason, with
  **Rematch**, **New opponent** (the same quick-pairing queue, presets only) and **Analyse**. It can be dismissed,
  and the result panel stays beside the board as today.
- **Rematch.** The first player to press Rematch offers it. The other player sees "{name} wants a rematch" with Accept
  and Decline. When they accept, both go to the new game with the colours swapped and the same time control.
  Against the computer, Rematch simply starts a new engine game at the same level with the colours swapped.
- **Opponent found.** In quick pairing, the waiting tile flashes "Opponent found" for about half a second before the
  game opens.
- **A draw offer stands out**: the Accept / Decline row pulses gently (not with reduced motion).
- Out of scope: sound, chat, rematch in correspondence games once the invite has expired (24 h, as for every invite).

## Capabilities

### New Capabilities

- `game-feedback`: tab title and favicon signals, the game-over card, the opponent-found flash and the draw-offer
  emphasis.

### Modified Capabilities

- `game-matchmaking`: an invite can be reserved for one user, and a finished game has a rematch invite whose id is the
  game's id (`POST /api/games/{id}/rematch`).

## Impact

- **Backend:** `InviteActor` (optional `ForId` and `RematchOf` on `InviteCreated`, which are nullable so old journal
  rows still read; `OfferRematch` command; a reserved invite refuses other users), new endpoint
  `WebApi/Games/Rematch/` (players of an ended, non-engine game only). Invite events are journal-only and not tagged
  for Kafka, so there is no outbox or mapper change.
- **Frontend:** `lib/feedback.ts` (pure title and favicon decisions), `public/favicon.svg` + `favicon-turn.svg`,
  `components/games.tsx` (`GameOverCard`, `RematchOffer`), game page (subscribes to `invite:{gameId}` after the end),
  home `Seek` (found flash), `lib/server/games.ts` + `api.ts` (`postRematch`).
- **Tests:** InviteActor TestKit for reserved and rematch invites; endpoint integration test; vitest for
  `lib/feedback.ts` and the card; a two-browser Playwright rematch.
