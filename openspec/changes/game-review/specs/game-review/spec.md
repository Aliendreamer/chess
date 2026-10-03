## ADDED Requirements

### Requirement: A player can have a finished game reviewed by the engine

A player of a finished game SHALL be able to ask for an engine review of it; the server SHALL evaluate every position
of the game not already evaluated, on a request queue separate from interactive analysis. A game still being played
SHALL never be reviewed. Asking again for a game already requested SHALL only re-ask positions whose request was
lost. Anyone who can see the game SHALL be able to read its review.

#### Scenario: Starting a review

- **WHEN** a player asks for a review of their finished game
- **THEN** the positions without an evaluation are sent to the engine and the review shows how many are evaluated

#### Scenario: A game in play

- **WHEN** someone asks for a review of a game still being played
- **THEN** the request is refused

#### Scenario: Someone else's game

- **WHEN** a member who did not play the game asks for its review
- **THEN** the request is refused, but a review a player started is shown to them

#### Scenario: Interactive analysis is not delayed

- **WHEN** a review of a long game is running and a member asks for an evaluation on the analysis board
- **THEN** that evaluation is not queued behind the review's positions

### Requirement: A review marks mistakes with the better move

A complete review SHALL give each position's evaluation and SHALL mark a move as an inaccuracy, mistake or blunder when
it loses at least 0.1, 0.2 or 0.3 of winning chances (on a −1…1 scale) against the engine's best move, showing that move
and its line. A move equal to the engine's best SHALL never be marked. The review SHALL count each player's marks and
SHALL name where the game left the named opening lines and who left them.

#### Scenario: A blunder

- **WHEN** a move turns a level position into one the engine scores −3 for its player
- **THEN** it is marked as a blunder with the engine's move and line beside it

#### Scenario: Leaving the book

- **WHEN** the member's 7th move is the first that leaves every named line
- **THEN** the review says the game left the book at that move, names the opening, and links its trainer

#### Scenario: Shown while it runs

- **WHEN** a review is still running
- **THEN** the game page shows the graph and marks of the positions evaluated so far and how many remain

### Requirement: A member practises their own mistakes

A player of a reviewed game SHALL be able to add their own mistakes and blunders to their practice. Practice SHALL show
one due position at a time from the member's side with the move they played, SHALL accept any move the engine rated
within 0.1 of its best, SHALL show the engine's move and line after a wrong answer, and SHALL schedule each position as
the opening trainer schedules lines (a wrong answer brings it back first, a right one later). Practice SHALL be visible
only to its member.

#### Scenario: Adding mistakes

- **WHEN** a member adds the mistakes of a reviewed game twice
- **THEN** each of their mistakes and blunders is in their practice once, and none of their opponent's

#### Scenario: A right answer

- **WHEN** the member plays the engine's second line in a practice position
- **THEN** it is accepted and the position is not due again until the next box's interval

#### Scenario: A wrong answer

- **WHEN** the member plays the same move as in the game
- **THEN** the practice shows the engine's move and line, and the position is offered again first
