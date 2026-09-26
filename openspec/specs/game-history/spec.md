# game-history Specification

## Purpose

What the game read side guarantees. It covers the projection of `game.events` into `rm_games`,
`rm_game_players` and `rm_moves`; lists of games being played or ended; "my games"; a game's summary and moves;
a finished game's PGN; players shown by the username they had at the time; and finished games served from the
read side without waking their actor. Established by change `game-read-side` (2026-09-26).

## Requirements

### Requirement: Games are projected into read models from Kafka

The `GameProjection` (group `chess.rm-games`) SHALL maintain `rm_games`, `rm_game_players` and `rm_moves` from
`game.events`. Each event is applied exactly once per game, in `seq` order, under the `event-publishing`
guarantees: the per-game watermark (`rm_games.LastSeq`) is a concurrency token, duplicates are skipped, a gap
stalls the consumer, and a repeatedly failing event is parked. All rows an event touches MUST be written in one
transaction.

#### Scenario: A move is projected once

- **WHEN** `MoveMade` with seq 5 is delivered twice
- **THEN** `rm_moves` holds one row for that ply, and `rm_games.Ply` and `LastSeq` reflect it once

#### Scenario: Out-of-order delivery stalls

- **WHEN** seq 7 arrives for a game whose `LastSeq` is 5
- **THEN** nothing is written and the consumer stalls on the gap

### Requirement: Games being played can be listed

`GET /api/games?status=playing` SHALL list games in progress, most recently active first (by the time of their
last event), keyset-paged with an opaque cursor. `status=ended` MUST list finished and aborted games, most
recently ended first. The list MUST be served from the replica and MAY lag the write side.

#### Scenario: Watching list

- **WHEN** three games are being played and one has just had a move
- **THEN** that game is first, and paging with `limit=1` walks all three exactly once

### Requirement: A player can list their own games

`GET /api/me/games` SHALL list every game the signed-in user plays or played, as either colour, newest first,
keyset-paged. Each item MUST show the user's colour, the opponent, the time control, the status and the result.

#### Scenario: Games as both colours

- **WHEN** a user played one game as White and one as Black
- **THEN** both appear, each with the user's colour, and no other user's games appear

### Requirement: A game's summary and moves can be read

`GET /api/games/{id}` SHALL return the game's summary (players, time control, status, result, reason, ply, last
FEN, timestamps). `GET /api/games/{id}/moves` SHALL return every move in ply order with UCI, SAN, FEN after, and
both clocks. An unknown game MUST be 404. Any signed-in user MAY read any game (D20).

#### Scenario: Replay a game

- **WHEN** a finished 4-move game is read
- **THEN** the moves come back as plies 1–4 with SAN `f3, e5, g4, Qh4#` and a FEN after each

### Requirement: A finished game has a PGN

When `GameEnded` is projected, the game's PGN SHALL be built from its moves' SAN and stored on `rm_games`.
`GET /api/games/{id}/pgn` MUST return it as `application/x-chess-pgn`, with the seven-tag roster (Event, Site,
Date, Round, White, Black, Result) plus `TimeControl` and `Termination`, and movetext ending in the result. An
unfinished game's PGN MUST be 404.

#### Scenario: Fool's mate

- **WHEN** the fool's-mate game has ended
- **THEN** its PGN movetext is `1. f3 e5 2. g4 Qh4# 0-1` and the `Result` tag is `0-1`

### Requirement: Finished games are served without waking their actor

A `game` live subscription to an ended game SHALL be answered from `rm_games` on the replica when the replica
already has the ending, and from the actor otherwise. That covers the moments right after the end, before the
projection has caught up.

#### Scenario: Old game opened

- **WHEN** a signed-in user opens the live page of a game that ended yesterday
- **THEN** the snapshot is the ended view and the game's actor is not started

### Requirement: Players are shown by their username, as it was when the game was played

Each user SHALL have a display name taken from the Keycloak `preferred_username` claim. It's set when the user
is first provisioned and backfilled on a later login if missing. When a game is projected as created, both
players' display names MUST be stored with the game and used in every list, summary and PGN for that game. A
later rename MUST NOT change past games. A player with no display name MUST be shown as `Player {users.id}`.
Emails and full names MUST never appear in any game read model or PGN.

#### Scenario: Names in a finished game

- **WHEN** `testuser` (White) and `player` (Black) finish a game
- **THEN** its PGN has `[White "testuser"]` and `[Black "player"]`, and "my games" shows each the other's name

#### Scenario: A user without a username

- **WHEN** a player's `users.Username` is empty
- **THEN** the game shows them as `Player {id}`
