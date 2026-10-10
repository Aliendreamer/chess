## MODIFIED Requirements

### Requirement: One position at a time, scored in the move tree

A request SHALL be for one position: the position the player has on the board, asked for once it has stayed there
briefly (stepping through moves quickly asks only for the one the player stops at), and again when the think time
changes. The board MUST show that the engine is thinking until the evaluation arrives, and every position evaluated
during the visit MUST show its score beside its move in the tree.

#### Scenario: Evaluating two positions of a game

- **WHEN** a player stops at the position after move 10, then steps straight to the one after move 15
- **THEN** both moves show their scores in the tree, and none of the positions stepped through was sent to the engine
