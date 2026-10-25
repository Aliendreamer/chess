## ADDED Requirements

### Requirement: Tick boxes choose the evaluation bar and the best moves

The analysis board and a game against the computer SHALL show two tick boxes under the board, "Evaluation bar" and
"Best moves". On the analysis board both SHALL start ticked; in a game against the computer both SHALL start unticked.
A change SHALL be kept in the player's preferences and apply to the next page of that kind. With both unticked, the
engine MUST NOT be asked for the position.

#### Scenario: Analysis by default

- **WHEN** a player who never changed them opens the analysis board
- **THEN** both boxes are ticked, the bar is beside the board and the engine's lines are shown

#### Scenario: Remembered for the next game

- **WHEN** a player ticks "Best moves" in a game against the computer and starts another one
- **THEN** "Best moves" is ticked there and "Evaluation bar" is not

### Requirement: The evaluation bar and the best moves

The evaluation bar SHALL show White's winning chances for the position on the board (lichess's logistic of the
centipawns, a mate all or nothing), with White's end toward White's side of the board, and the score as its accessible
name; it SHALL stay even until the position is evaluated. "Best moves" SHALL list the engine's lines, each with its
score and its moves in SAN. While playing, the position on the board SHALL be evaluated at the quick think once it has
stayed for 300 ms.

#### Scenario: A score

- **WHEN** the position on the board is evaluated at +1.00
- **THEN** the bar's white part fills 59.1 % and it is named "Evaluation +1.00"

### Requirement: Only in games against the computer

A game between two people MUST NOT show the tick boxes, the bar or the best moves. In the club, only the person playing
an engine game SHALL see them on its page.

#### Scenario: A game against a person

- **WHEN** two members play a game
- **THEN** neither page shows the tick boxes or an evaluation

### Requirement: The desktop says what the evaluation costs while playing

In the desktop app, while either box is ticked in a game against the computer, a note SHALL say that a second
Stockfish runs beside the one played and keeps a processor core busy.

#### Scenario: The note

- **WHEN** a desktop player ticks "Evaluation bar" in a game
- **THEN** the note naming the second Stockfish is shown under the tick boxes
