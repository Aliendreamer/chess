## ADDED Requirements

### Requirement: Members see who is in the club and online

Every signed-in member SHALL see the list of active members with each one's state: online (a page of the app open),
playing (in a live game against a person) or offline, with when they were last seen. Online members SHALL come first.
A deactivated member SHALL NOT be listed. States SHALL follow changes while the list is open.

#### Scenario: A member opens the app

- **WHEN** Bob opens any page of the app
- **THEN** Alice's members list shows Bob as online

#### Scenario: A member closes the app

- **WHEN** Bob closes his last tab
- **THEN** within the presence lease Bob is shown offline, with the time he was last seen

#### Scenario: Playing

- **WHEN** Bob is in a live game against another member
- **THEN** he is shown as playing and cannot be challenged
