## MODIFIED Requirements

### Requirement: A user's display preferences are stored on the account

The system SHALL store, per user, `boardTheme` (`brown` | `blue` | `green` | `slate` | `walnut`), `pieceSet`
(`cburnett`), `animation` (`off` | `fast` | `normal`), `coordinates` (boolean), `siteTheme` (`dark` | `light`) and the
engine switches `analysisBar`, `analysisLines`, `playBar`, `playLines` (booleans). A user without stored preferences
SHALL get the defaults `brown`, `cburnett`, `normal`, `true`, `dark`, `true`, `true`, `false`, `false`; a stored set
without the engine switches SHALL read with their defaults, and a `PUT` that leaves them out SHALL store their
defaults. `GET /api/me/preferences` SHALL return the user's own preferences, and `PUT /api/me/preferences` SHALL
replace them. An unknown value MUST be refused with 400 and change nothing. Only the signed-in user's own preferences
are reachable.

#### Scenario: First visit

- **WHEN** a new user calls `GET /api/me/preferences`
- **THEN** the answer is `{ boardTheme: "brown", pieceSet: "cburnett", animation: "normal", coordinates: true,
siteTheme: "dark", analysisBar: true, analysisLines: true, playBar: false, playLines: false }`

#### Scenario: An unknown theme

- **WHEN** a user puts `boardTheme: "neon"`
- **THEN** the answer is 400 and `GET` still returns the previous preferences

#### Scenario: Light is accepted

- **WHEN** a user puts `siteTheme: "light"`
- **THEN** the answer is 200 and `GET` returns `siteTheme: "light"`

#### Scenario: A set saved before the engine switches

- **WHEN** a user's stored preferences have no engine switches
- **THEN** `GET` returns them with `analysisBar: true, analysisLines: true, playBar: false, playLines: false`
