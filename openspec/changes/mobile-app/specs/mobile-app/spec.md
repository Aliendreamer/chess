## ADDED Requirements

### Requirement: The app works offline for one local player

The mobile app SHALL start and offer every feature of the desktop app with no network, no account and no server. It
has one local player, whose games, studies, progress, library and news are stored in one SQLite database on the
phone. It MUST NOT contact any host except the news sources (and only to fetch news), and MUST NOT load remote
scripts, fonts or images.

#### Scenario: First start in airplane mode

- **WHEN** the app is installed and opened on a phone with no network
- **THEN** the library is prepared with progress shown, a game against the computer can be played to the end and
  analysed, and News says it has nothing yet

#### Scenario: The app is killed mid-game

- **WHEN** the system kills the app while a game is in play and the player opens it again
- **THEN** the game is in play at the same position, with its moves, and the engine thinks if it is its turn

### Requirement: Stockfish runs inside the app

The app SHALL include the pinned Stockfish 19, built from its checksummed source and unmodified, and speak UCI to it
in-process. A single engine serves the engine's move first, then the board's analysis, then draw and resign
judgements, then review, then the miner. A higher request MUST pre-empt a lower one, and the lower one is asked again
later. Options SHALL be changed only while the engine is idle.

#### Scenario: Analysis while a review runs

- **WHEN** the player opens the analysis board while a finished game is being reviewed
- **THEN** the review's search is stopped, the board's position is analysed, and the review continues afterwards

#### Scenario: The engine's move after analysis

- **WHEN** a game at Casual level asks for the engine's move right after a full-strength analysis
- **THEN** the move is searched at Casual strength with the game's think time

### Requirement: A Stockfish crash is survived and explained

Everything the player is working on SHALL be saved as it changes, including the analysis board and unsaved study
edits as drafts, so that a crash loses nothing. A crash on the engine's thread SHALL leave a record of what the engine
was doing. On the next start, the app SHALL tell the player that Stockfish crashed and the app had to close, say what
it was doing, confirm that everything was saved, and offer a report to share (never sent by itself). A position that
crashed the engine MUST NOT be asked again by background work. For a game or the analysis board, the player SHALL
choose whether to ask again. An engine that stops answering and cannot be stopped SHALL turn engine features off, with
a message to reopen the app.

#### Scenario: A crash during the engine's move

- **WHEN** Stockfish crashes while thinking about its move in a game and the player reopens the app
- **THEN** the notice says Stockfish crashed while thinking about its move and everything was saved, the game is at
  the same position, and the player chooses _Try again_ or _Take back my last move_

#### Scenario: A crash during review

- **WHEN** Stockfish crashes while reviewing a position and the app is reopened
- **THEN** the notice is shown once, the review continues, and that position is skipped from then on

#### Scenario: Swiped away while thinking

- **WHEN** the player swipes the app away while the engine is thinking and opens it again
- **THEN** no crash notice is shown and the work resumes

#### Scenario: The analysis board after a crash

- **WHEN** the app reopens after a crash during board analysis
- **THEN** the analysis board shows the position and line the player had, with the engine off until asked

### Requirement: The phone's lifecycle is respected

When the app leaves the foreground, the engine SHALL stop and every queue SHALL hold. When the app returns, pending
work resumes, and the engine's move is asked again if it is the engine's turn. Review and the miner MUST run only
while the app is in front. The miner SHALL be off until the player turns it on.

#### Scenario: Switching apps during the engine's turn

- **WHEN** the player switches to another app while the engine is thinking and comes back a minute later
- **THEN** the engine is asked for its move again and plays it, and no move was made while the app was away

### Requirement: The same features as the desktop app

The app SHALL offer play against the computer (levels, think time, premoves, take-backs, draw offers, a request to
resign, resign, new game, PGN), the analysis board, automatic review, studies, the trainer (learn then test), training
sessions, the library (bundled games, PGN import, search, explorer, openings), news and tournaments, settings, About,
and backup and restore. The behaviour SHALL be the desktop's: the same shared data layer and view state, drawn with
native components.

#### Scenario: A rule shared with desktop

- **WHEN** a trainer line in box 2 is passed without a mistake on the phone
- **THEN** it moves to box 3, due in 7 days, as on desktop

### Requirement: Backups move between desktop and phone

Backup SHALL write the whole database to one `.chessbackup` file and offer it through the phone's share sheet.
Restore SHALL take such a file from the file picker, check it as the desktop does, keep the current database, and
replace every table's rows. A backup made by the desktop app at the same schema SHALL restore on the phone, and the
reverse.

#### Scenario: Moving from desktop to the phone

- **WHEN** the player restores a desktop backup on the phone and confirms
- **THEN** the phone shows the desktop's games, studies and trainer progress

### Requirement: A board made for touch

The board SHALL accept a move by tapping a piece and then a square, and by dragging. It SHALL show legal targets,
the last move and check, ask for the promotion piece, and follow the board theme, coordinates and animation
settings. It SHALL fill the screen's width in a game and make no sound.

#### Scenario: Promotion by tap

- **WHEN** the player taps a pawn on the seventh rank and then the eighth-rank square
- **THEN** the four promotion pieces are offered and the chosen one is played
