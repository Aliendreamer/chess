## ADDED Requirements

### Requirement: Each player has a public profile

The API SHALL answer `GET /api/players/{id}` for any signed-in user with the player's id, current name, member-since
date, whether they are a computer player, and their record: wins, draws and losses in total and per time control. It
SHALL NOT return email, full name or preferences, and SHALL answer 404 for an unknown id and 400 for a malformed one.

#### Scenario: A record from finished games

- **WHEN** a player has won one 3+2 game, drawn one 3+2 game and lost one 10+5 game
- **THEN** the profile says 1 win, 1 draw, 1 loss in total, with 3+2 at 1/1/0 and 10+5 at 0/0/1

#### Scenario: Aborted and running games are not results

- **WHEN** a player has one aborted game and one game in play
- **THEN** neither counts in the record

#### Scenario: Nothing private

- **WHEN** any signed-in user reads a profile
- **THEN** the answer carries no email and no full name

### Requirement: A player's games can be listed

The API SHALL answer `GET /api/players/{id}/games` with that player's games, newest first, keyset-paged, in the same
item shape as the signed-in user's own list.

#### Scenario: Another player's games

- **WHEN** testuser lists player's games
- **THEN** each item names player's colour and opponent, as player's own list would

### Requirement: The profile page shows the record by game type

The profile page SHALL show the name, member-since date, the overall record, the record per game type (bullet, blitz,
rapid, classical, correspondence, computer — only types with games), and the games with "Load more".

#### Scenario: Grouped by type

- **WHEN** a player has records for 3+0 and 5+3
- **THEN** the page shows one Blitz row adding both

### Requirement: Names lead to profiles

Wherever a player's name is shown (game page, game lists, Club TV) it SHALL link to that player's profile, and the
navigation SHALL offer the signed-in user's own profile.

#### Scenario: From a game

- **WHEN** a player clicks their opponent's name on the game page
- **THEN** the opponent's profile opens
