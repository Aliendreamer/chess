## ADDED Requirements

### Requirement: A member can challenge an online member to a game type

A member SHALL be able to challenge a member who is online and not playing to one of the preset game types with a
colour (white, black or random). The challenged member SHALL see the challenge on whatever page they are on, with a
60-second countdown, and SHALL accept or decline it; the challenger SHALL be able to cancel it. A challenge SHALL end
when accepted, declined, cancelled or after 60 seconds, and both members SHALL see how it ended. A member SHALL have at
most one challenge out, and a member SHALL NOT be challenged while offline, playing, or already challenged.

#### Scenario: Accepted

- **WHEN** Alice challenges Bob to 5+3 as white and Bob accepts within 60 seconds
- **THEN** a 5+3 game starts with Alice as white and both browsers open it

#### Scenario: No answer

- **WHEN** Bob does not answer for 60 seconds
- **THEN** the challenge expires, Bob's banner disappears and Alice is told there was no answer

#### Scenario: Declined

- **WHEN** Bob declines
- **THEN** Alice is told Bob declined, and no game starts

#### Scenario: Offline or playing

- **WHEN** Alice challenges a member who is offline or playing
- **THEN** the challenge is refused
