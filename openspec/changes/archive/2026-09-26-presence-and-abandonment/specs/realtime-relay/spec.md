## ADDED Requirements

### Requirement: The BFF reports players' presence on game topics

For `game` topics, the BFF SHALL tell the hub `Present(topic, userId, instance)` when a signed-in user's first
socket on that topic opens and `Absent(topic, userId, instance)` when their last one closes, where `instance` is
a random id fixed for the SSR process. It MUST re-send `Present` for every held (topic, user) every 30 seconds
and right after a hub reconnect. Other kinds MUST NOT report presence.

#### Scenario: Two tabs, one presence

- **WHEN** a user opens the same game in two tabs and closes one
- **THEN** the hub received one `Present` and no `Absent`; closing the second sends `Absent`

#### Scenario: Presence survives a hub reconnect

- **WHEN** the hub connection drops and reconnects while a user's game socket is open
- **THEN** the BFF re-sends `Present` for that user and game under the same instance id

### Requirement: Browsers reconnect after a dropped connection

A browser live socket that closes unexpectedly SHALL be reopened after 1, 2, 4 and 8 seconds and then every 15
seconds, with the page showing that it is reconnecting. A close for an unknown topic (4400) or an ended session
(4401) MUST NOT be retried, and unmounting the page MUST NOT reconnect.

#### Scenario: A dropped relay recovers

- **WHEN** the socket closes with code 1006 while the game page is open
- **THEN** the page shows "Connection lost — reconnecting…" and, once reconnected, the snapshot brings it up to
  date

#### Scenario: Signed out is final

- **WHEN** the socket closes with 4401
- **THEN** no reconnect is attempted and the page says the session has ended
