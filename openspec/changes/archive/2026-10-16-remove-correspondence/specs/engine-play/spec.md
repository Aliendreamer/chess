## MODIFIED Requirements

### Requirement: Quiet engine games are woken and judged

An idle-game sweep SHALL ask every untimed game in play whose read row has not changed for `Akka:UntimedIdleMinutes` to
check itself, oldest first, at most `MaxPerSweep` games per sweep. A woken game with nobody present MUST end by the
abandonment rule above (or the first-move abort when the person never moved); a woken game whose person is present MUST
continue unchanged.

#### Scenario: A game left in play before this change

- **WHEN** an engine game has been `playing` in `rm_games` for hours with no actor alive and nobody on its page
- **THEN** within a sweep plus one lease and one minute it ends with the engine winning by `Abandonment`
