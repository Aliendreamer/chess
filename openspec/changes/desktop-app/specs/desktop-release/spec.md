## ADDED Requirements

### Requirement: The app is versioned by Nx Release

The desktop app SHALL be its own Nx Release project (`desktop`), versioned from conventional commits, tagged
`desktop@{version}`, with its own `apps/desktop/CHANGELOG.md`. The installer's version MUST be the project's version.
A change to a shared library the app uses SHALL count towards its next version. The first release is 1.0.0.

#### Scenario: A fix in the shared board

- **WHEN** a `fix(libs): …` commit changes `libs/chess-ui` after `desktop@1.0.0`
- **THEN** the next release of the app is 1.0.1 and its changelog lists the fix

### Requirement: Installers are built locally for Windows and Linux

`nx run desktop:bundle` SHALL build the installers for the machine it runs on: AppImage and .deb on Linux, NSIS .exe
and .msi on Windows, each containing the pinned Stockfish for that platform. Nothing SHALL be built or published by a
CI pipeline.

#### Scenario: A tampered Stockfish download

- **WHEN** the downloaded Stockfish archive does not match its pinned SHA-256
- **THEN** the bundle fails and no installer is made

### Requirement: A release is published to GitHub by its owner

`tools/desktop/publish.sh <version>` SHALL create the GitHub Release `desktop@<version>` with that version's changelog
section as notes and upload the current machine's installers, or add them to the release when it already exists, so
the Linux and Windows builds end up on one release. Running it is the owner's action.

#### Scenario: Two machines, one release

- **WHEN** the owner publishes 1.2.0 from WSL and then from the Windows-side clone
- **THEN** the release `desktop@1.2.0` holds the AppImage, the .deb, the .exe and the .msi

### Requirement: The installers carry the licences

The app's code SHALL be MIT, and every installer SHALL include the MIT licence, Stockfish's GPLv3 licence and a notice
of where its source is, the Cburnett pieces' attribution (BSD-3) and the openings list's source (CC0); the app SHALL
show them on an About page.

#### Scenario: About

- **WHEN** the player opens About
- **THEN** it names the app's version, Stockfish 19 with its licence and source link, and the other credits
