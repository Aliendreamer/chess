## MODIFIED Requirements

### Requirement: Opening families come from the named lines

The trainer SHALL offer the opening families of the named-lines list (the text before the first ':' of each name), each
with its number of lines and, for the signed-in member, how many they have learned; a member SHALL be able to search
families by part of a name and to train a narrower prefix of a family. A family's lines are its named lines that no
other line of the family extends. The families SHALL be grouped by kind read from the name — gambits (a name with
"Gambit"), defences ("Defense"/"Defence"), openings and attacks ("Opening", "Attack", "System"), and games and others —
with the families the member has learned lines of first in each group.

#### Scenario: A family's lines

- **WHEN** a family has the lines "Ruy Lopez" (3.Bb5) and "Ruy Lopez: Berlin Defense" (3...Nf6)
- **THEN** only the Berlin line is drilled; "Ruy Lopez" is covered by it

#### Scenario: Search

- **WHEN** a member searches for "najdorf"
- **THEN** the Sicilian Defense: Najdorf Variation lines are offered

#### Scenario: Grouped by kind

- **WHEN** the trainer lists "Benko Gambit", "Alekhine Defense", "London System" and "Italian Game"
- **THEN** they appear under Gambits, Defences, Openings and attacks, and Games and others respectively
