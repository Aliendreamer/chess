## ADDED Requirements

### Requirement: A user's display preferences are stored on the account

The system SHALL store, per user, `boardTheme` (`brown` | `blue` | `green` | `slate` | `walnut`), `pieceSet`
(`cburnett`), `animation` (`off` | `fast` | `normal`), `coordinates` (boolean) and `siteTheme` (`dark`, plus the values
`site-themes` adds). A user without stored preferences SHALL get the defaults `brown`, `cburnett`, `normal`, `true`,
`dark`. `GET /api/me/preferences` SHALL return the user's own preferences, and `PUT /api/me/preferences` SHALL
replace them. An unknown value MUST be refused with 400 and change nothing. Only the signed-in user's own preferences
are reachable.

#### Scenario: First visit

- **WHEN** a new user calls `GET /api/me/preferences`
- **THEN** the answer is `{ boardTheme: "brown", pieceSet: "cburnett", animation: "normal", coordinates: true,
siteTheme: "dark" }`

#### Scenario: An unknown theme

- **WHEN** a user puts `boardTheme: "neon"`
- **THEN** the answer is 400 and `GET` still returns the previous preferences

### Requirement: Preferences apply on the first paint and everywhere

The server-rendered HTML of every signed-in page SHALL already carry the user's board theme, site theme and
coordinates setting, so no default theme flashes before hydration. The board SHALL animate with the chosen speed
(`off` = 0 ms, `fast` = 120 ms, `normal` = 200 ms; reduced motion always means 0 ms).

#### Scenario: Another device

- **WHEN** a user chooses Blue on their laptop and then opens a game on their phone
- **THEN** the phone's first paint already shows the Blue board

### Requirement: A settings page changes preferences at once

`/settings` SHALL show every preference with a preview board, save each change as soon as it is made, and apply it to
the page without a reload. A failed save MUST show the server's reason and put the control back to the saved value.

#### Scenario: Turning coordinates off

- **WHEN** a user unticks Coordinates on `/settings`
- **THEN** the preview board loses its coordinates at once, and after a reload they are still off
