# opening-trainer Specification

## Purpose

Members drill the named lines of the lichess opening list by family: the board plays the other side, wrong moves are shown and replaced, and a per-member schedule brings missed lines back first.

## Requirements

### Requirement: Opening families come from the named lines

The trainer SHALL offer the opening families of the named-lines list (the text before the first ':' of each name), each
with its number of lines and, for the signed-in member, how many they have learned; a member SHALL be able to search
families by part of a name and to train a narrower prefix of a family. A family's lines are its named lines that no
other line of the family extends.

#### Scenario: A family's lines

- **WHEN** a family has the lines "Ruy Lopez" (3.Bb5) and "Ruy Lopez: Berlin Defense" (3...Nf6)
- **THEN** only the Berlin line is drilled; "Ruy Lopez" is covered by it

#### Scenario: Search

- **WHEN** a member searches for "najdorf"
- **THEN** the Sicilian Defense: Najdorf Variation lines are offered

### Requirement: A drill plays the other side and checks the member's moves

In a drill the board SHALL play the other side's moves of the due line and wait for the member's; a move that is not the
line's SHALL be shown as wrong with the right move, SHALL have to be replaced by the right move before the line goes on,
and SHALL make the line count as missed. When the line ends the result SHALL be recorded and the next due line offered.

#### Scenario: Training as Black

- **WHEN** a member drills the Berlin Defense as Black
- **THEN** the board plays 1.e4, waits for 1...e5, plays 2.Nf3, and so on

#### Scenario: A wrong move

- **WHEN** the member plays 3...a6 where the line has 3...Nf6
- **THEN** the board says the move is wrong, shows 3...Nf6, and goes on only after the member plays it

### Requirement: Progress is remembered and drives what comes next

The server SHALL keep, per member, line and colour, a box from 0 to 5 and a due time: a clean run SHALL move the line up
one box and set it due after 0, 1, 3, 7, 14 or 30 days by its new box; a run with a mistake SHALL put it back to box 0,
due at once. The next line SHALL be the due line with the lowest box, then the oldest due, then a line never trained. A
line SHALL count as learned from box 3. Progress SHALL be visible only to its member.

#### Scenario: A missed line comes back first

- **WHEN** a member misses the Berlin line and has other lines due
- **THEN** the Berlin line is offered next

#### Scenario: A known line waits

- **WHEN** a member plays a line cleanly a third time
- **THEN** it is learned and not due again for 7 days

#### Scenario: Nothing due

- **WHEN** every line of a family is known and none is due
- **THEN** the trainer says the family is done for now and shows when the next line is due

### Requirement: Members see their progress

The trainer SHALL show each family's learned lines out of its lines, each line's state (new, learning, learned), and the
member's own profile SHALL list the families they have trained with their progress.

#### Scenario: A family's progress

- **WHEN** a member has learned 23 of a family's 41 lines
- **THEN** the family shows "23 of 41 learned" with a bar

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
