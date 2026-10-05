## ADDED Requirements

### Requirement: A member can drill their own studies

The trainer SHALL offer, next to the named openings, the signed-in member's own studies, each with its number of lines
and how many the member has learned from the chosen side. Every path from a study's start to the end of a line (the main
line and every variation) SHALL be one line; a path with no move for the chosen side SHALL not be a line for that side.
Studies owned by others SHALL not be offered or drillable, even when shared.

#### Scenario: Variations are lines

- **WHEN** a member's study has 1.e4 e5 2.Nf3 with the variations 1...c5 and 1...e6
- **THEN** drilling it as White offers three lines: 1.e4 e5 2.Nf3, 1.e4 c5 and 1.e4 e6

#### Scenario: Someone else's study

- **WHEN** a member asks to drill a study shared with them by another member
- **THEN** the trainer answers not found

### Requirement: A study drill plays the study's other side

A study drill SHALL start from the study's start position and SHALL play the other side's moves of the due line and
check the member's moves as an opening drill does. Where the study has several replies for the other side, each reply
SHALL belong to its own line. A move the member plays that is the move of another of the study's lines at the same
position SHALL be pointed out as that other line, SHALL not count as a mistake, and SHALL still have to be replaced by
the line's move.

#### Scenario: The board varies its reply

- **WHEN** a member drills the study above as White twice, the first line being 1...e5
- **THEN** a later run offers a line where the board answers 1...c5 or 1...e6

#### Scenario: The member's other line

- **WHEN** the study has 3.Bb5 and 3.Bc4 for White after the same moves, and the due line has 3.Bb5, and the member
  plays 3.Bc4
- **THEN** the drill says 3.Bc4 is their other line, asks for 3.Bb5, and the run stays clean

#### Scenario: A study from a position

- **WHEN** a study starts from a middlegame FEN with Black to move and the member drills it as Black
- **THEN** the member plays the first move, numbered from the FEN's move number

### Requirement: Study progress follows the moves

Study lines SHALL be scheduled per member, line and colour exactly as named lines. A line's progress SHALL be kept while
its moves are unchanged, wherever it sits in the tree; a line whose moves changed or that was extended SHALL start as
new; progress of lines removed from the study SHALL be dropped when the study is saved, and all of a study's progress
SHALL be dropped when the study is deleted. Study progress SHALL not appear in the profile's openings trained.

#### Scenario: Promoting a variation

- **WHEN** a member has learned the line 1.e4 c5 and then makes 1...c5 the study's main line
- **THEN** the line is still learned

#### Scenario: Extending a line

- **WHEN** a member has learned 1.e4 e5 2.Nf3 and adds 2...Nc6 3.Bb5 to it
- **THEN** 1.e4 e5 2.Nf3 Nc6 3.Bb5 is a new line and 1.e4 e5 2.Nf3 is no longer a line

#### Scenario: A stale result

- **WHEN** a result arrives for a line that the study no longer has
- **THEN** it is refused and no progress is written
