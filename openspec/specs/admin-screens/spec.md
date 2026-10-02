# admin-screens Specification

## Purpose

The admin-only dead-letter page: parked projection records listed and filtered, each replayable from the browser.
The API checks the Admin role on every call; the UI only hides the page from others.

## Requirements

### Requirement: Only admins see the admin page

The navigation SHALL show an Admin entry only to users with the `Admin` role, and `/admin` SHALL render the not-found
page for anyone else.

#### Scenario: A player without the role

- **WHEN** a user without `Admin` opens `/admin`
- **THEN** the not-found page is shown and no dead letters are requested

#### Scenario: An admin

- **WHEN** testuser (Admin) opens the navigation
- **THEN** an Admin entry is listed

### Requirement: Dead letters can be listed and filtered

The admin page SHALL list parked projection records newest first with projection, aggregate, sequence number,
attempts, parked time and the last error, SHALL filter by projection, and SHALL page with "Load more". An empty list
SHALL say that nothing is parked.

#### Scenario: Nothing parked

- **WHEN** no record is parked
- **THEN** the page says nothing is parked

#### Scenario: Filter

- **WHEN** the admin picks `chess.rm-games`
- **THEN** only that projection's records are listed

### Requirement: A quarantined aggregate can be replayed

Each record SHALL offer Replay, which replays that aggregate's parked records for its projection and shows the
outcome: how many were applied, or the error when it fails again. The list SHALL reload afterwards.

#### Scenario: Replay succeeds

- **WHEN** the admin replays an aggregate whose cause is fixed
- **THEN** the row reports the records applied and disappears after the reload

#### Scenario: Replay fails again

- **WHEN** the record fails again
- **THEN** the row shows the new error and stays listed
