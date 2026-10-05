## ADDED Requirements

### Requirement: The engine image carries a pinned, verified Stockfish

The engine image SHALL be built with the Stockfish release named by a pinned download URL and SHA-256, fetched at build
time; the build MUST fail when the downloaded file's SHA-256 differs from the pinned one. The build SHALL NOT need any
file outside the repository. The image MUST carry the release's GPLv3 licence and a notice naming the release and where
its source is, next to the binary.

#### Scenario: A fresh clone builds the engine

- **WHEN** someone clones the repository and runs `tools/deploy/build.sh engine local`
- **THEN** the image builds without any Stockfish archive in the working tree, and `/opt/stockfish/stockfish` in it
  answers `uci` with `id name Stockfish 19`

#### Scenario: A tampered or wrong download

- **WHEN** the image is built with a SHA-256 that does not match the downloaded archive
- **THEN** the build fails at the download step and no image is produced

#### Scenario: The licence travels with the binary

- **WHEN** the engine image is inspected
- **THEN** `/opt/stockfish/Copying.txt` (GPLv3) and `/opt/stockfish/SOURCE.txt` (release tag and source URL) are present
