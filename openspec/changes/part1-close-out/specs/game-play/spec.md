## MODIFIED Requirements

### Requirement: An outage never costs a player time

The side to move's clock SHALL be restored to its value at the last persisted event when a game recovers after
its actor stopped (for example a node failure or passivation), and the turn MUST restart from the recovery
time (D14). A flag-fall timer MUST be re-armed with that remaining time.

#### Scenario: Node dies mid-turn

- **WHEN** White has 10 000 ms at the last event, the node dies 3 s later, and the game recovers 2 s after that
- **THEN** White has 10 000 ms again and the flag timer is set for 10 000 ms from recovery

#### Scenario: A cluster node leaves mid-game

- **WHEN** a two-node cluster is running a game with its clocks running, and one node's app is stopped with SIGTERM
- **THEN** the game answers from the surviving node with the same seq and position, and the waiting side's clock
  unchanged
- **AND** the next move is accepted and the game can be finished and projected as usual
