## REMOVED Requirements

### Requirement: A correspondence game gives each move seven days

**Reason**: Correspondence games are removed; games are live or against the computer.
**Migration**: None; existing `7d` games are deleted from the read side.

### Requirement: A missed deadline ends the game

**Reason**: No move deadlines remain.
**Migration**: None.

### Requirement: A correspondence game leaves memory while it waits

**Reason**: No correspondence games remain; untimed games keep their own idle passivation.
**Migration**: None.

### Requirement: No presence-based abandonment in correspondence games

**Reason**: No correspondence games remain.
**Migration**: None.

### Requirement: The player to move is emailed

**Reason**: The app sends no mail.
**Migration**: None.
