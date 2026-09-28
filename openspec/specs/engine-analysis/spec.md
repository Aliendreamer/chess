# engine-analysis Specification

## Purpose

Engine analysis on the study board: a position or the next positions of a line evaluated at a chosen think time, with the engine's
best lines, cached per position and shared by everyone.

## Requirements

### Requirement: A position can be evaluated at a chosen think time

A signed-in player SHALL be able to ask for the evaluation of a position at Quick (1 s), Normal (3 s) or Deep (10 s).
The answer MUST give the depth reached and the engine's three best lines, each with a score from White's side (in
pawns, or mate in N) and its moves.

#### Scenario: Evaluating the start position

- **WHEN** a player asks for a Normal evaluation of the start position
- **THEN** within about 3 s the board shows a score, a depth and three lines

### Requirement: A line can be analysed move by move

A player SHALL be able to ask for the next positions of a main line (up to 10, the current one first) at once; each position's evaluation MUST
appear as soon as it is known, and the board MUST show how many are done.

#### Scenario: Analysing a short game

- **WHEN** a player analyses the 10 positions of a line at Quick
- **THEN** the scores fill in move by move and "10 of 10 analysed" is shown at the end

### Requirement: Evaluations are computed once per position and reused

An evaluation SHALL be stored per position (ignoring move counters) and think time and served to anyone who asks for
that position at the same or a shorter think time, without asking the engine again. A position already requested and
not yet answered MUST NOT be requested again unless the request is older than the retry time.

#### Scenario: A second player asks for the same position

- **WHEN** another player asks for the start position at Quick after it was evaluated at Normal
- **THEN** the Normal evaluation is answered at once and the engine is not asked

### Requirement: Analysis never delays play against the engine

Analysis SHALL use its own topics and its own engine processes, so a long analysis MUST NOT delay the engine's moves in
a game against the computer.

#### Scenario: A game while a line is analysed

- **WHEN** a Deep analysis of 100 positions is running and a player moves in a game against the computer
- **THEN** the engine's reply arrives within its usual 5–10 s

### Requirement: Analysis survives an engine restart

A request SHALL NOT be lost when the engine worker restarts: the worker MUST commit a request only after answering it,
and a position still unanswered after the retry time MUST be requested again when a player asks for it.

#### Scenario: The engine container restarts mid-analysis

- **WHEN** the engine container restarts while a line is analysed
- **THEN** every position of the line is still evaluated in the end
