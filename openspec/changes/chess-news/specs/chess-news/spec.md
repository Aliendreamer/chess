## ADDED Requirements

### Requirement: Configured feeds are fetched on a schedule

The backend SHALL fetch every enabled feed in `News:Feeds` once per `News:FetchMinutes` from one node only, and SHALL
keep for each item only its source, title, link and date, for `News:KeepDays`. A feed that fails SHALL NOT stop the
others and SHALL be tried again next round.

#### Scenario: One feed down

- **WHEN** ChessBase answers 503 and FIDE answers normally
- **THEN** FIDE's new items are stored, ChessBase's failure is logged and counted, and the next round asks ChessBase
  again

#### Scenario: Old news

- **WHEN** an item is older than `News:KeepDays`
- **THEN** it is deleted on the next round

### Requirement: Feed content is never trusted

Parsing SHALL refuse DTDs and external entities, SHALL stop at `News:MaxFeedBytes` and `News:TimeoutSeconds`, SHALL
store titles as plain text, SHALL drop items whose link is not an absolute `https:` URL, and SHALL never store article
text or images.

#### Scenario: A hostile feed

- **WHEN** a feed contains an XML entity declaration
- **THEN** the feed is rejected and nothing from it is stored

#### Scenario: Markup in a title

- **WHEN** an item's title is `<b>Gukesh</b> wins &amp; leads`
- **THEN** the stored title is `Gukesh wins & leads`

#### Scenario: A javascript link

- **WHEN** an item's link is `javascript:alert(1)`
- **THEN** the item is dropped

### Requirement: Members see the latest headlines

The API SHALL list news items newest first, filterable by source, page by page, to signed-in members; home SHALL show
the latest 8 with source and age; a News page SHALL show more with a source filter. Every headline SHALL link to the
article on its source's site, opening in a new tab.

#### Scenario: Home

- **WHEN** a member opens home after a fetch round
- **THEN** the News panel lists up to 8 headlines, newest first, each naming its source

#### Scenario: Filter

- **WHEN** a member picks FIDE on the News page
- **THEN** only FIDE headlines are listed
