## ADDED Requirements

### Requirement: The app is versioned by Nx Release

The mobile app SHALL be its own Nx Release project (`mobile`), versioned from conventional commits, tagged
`mobile@{version}`, with its own `apps/mobile/CHANGELOG.md`. The app's version MUST be the project's version, and
Android's `versionCode` SHALL be derived from it so that each release installs over the previous one. A change to a
shared library the app uses SHALL count towards its next version. The first release is 1.0.0.

#### Scenario: Installing an update

- **WHEN** a friend with `mobile@1.0.0` installs the APK of `mobile@1.0.1`
- **THEN** Android installs it as an update and the friend's data stays

### Requirement: The APK is built locally and signed with the owner's key

`nx run mobile:apk` SHALL build a release APK on the owner's machine without an Expo account or a cloud build. It
SHALL contain Stockfish compiled from the pinned source, and SHALL be signed with the keystore named by environment
variables. The keystore MUST NOT be committed. Nothing SHALL be built or published by a CI pipeline.

#### Scenario: A tampered Stockfish source

- **WHEN** the downloaded Stockfish source or a network file does not match its pinned SHA-256
- **THEN** the build fails and no APK is made

#### Scenario: No keystore

- **WHEN** `nx run mobile:apk` runs without the keystore variables
- **THEN** it fails before building and names the missing variable

### Requirement: An iOS build is prepared for a Mac

On a Mac with Xcode, `nx run mobile:ipa` SHALL build an unsigned `.ipa` of the same version. The README SHALL explain
installing it with a free Apple ID (from Xcode, or with Sideloadly/AltStore) and that such an install expires after 7
days.

#### Scenario: A friend's Mac build

- **WHEN** the friend runs `nx run mobile:ipa` at the `mobile@1.0.0` tag
- **THEN** it makes `Chess-1.0.0.ipa`, which can be added to the release with `gh release upload`

### Requirement: A release is published to GitHub by its owner

`tools/mobile/publish.sh <version>` SHALL create the GitHub Release `mobile@<version>` with that version's changelog
section as notes and upload the APK, or add files to the release when it already exists. Running it is the owner's
action.

#### Scenario: APK first, iOS later

- **WHEN** the owner publishes 1.0.0 with the APK and the friend later uploads the .ipa
- **THEN** the release `mobile@1.0.0` holds both files

### Requirement: The app is GPLv3 and says so

Because Stockfish is linked into it, `apps/mobile` SHALL be licensed GPL-3.0-or-later and SHALL ship Stockfish's
licence and authors. About MUST show the licence, a link to the source at the release's tag, and every third-party
licence. The shared libraries remain MIT.

#### Scenario: About

- **WHEN** the player opens About
- **THEN** it shows "GPL-3.0-or-later", a link to `mobile@<version>` on GitHub, and Stockfish's licence
