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
