## Why

The engine image bakes Stockfish in from `apps/engine/stockfish/`, a git-ignored folder someone has to fill by hand
before every build (engine-play D1, "for now"). A fresh clone cannot build the engine image, and nothing checks that the
archive is the release we think it is. The owner decided on 2026-10-05: the image depends on a pinned release instead.

## What Changes

For a player: nothing. Engine games, analysis and reviews play exactly as before (the same Stockfish 19 binary).

For whoever builds the stack or an image:

- The engine Dockerfile downloads the official Stockfish 19 release at build time from a pinned URL and checks its
  SHA-256; a different file fails the build. The URL and hash are Dockerfile `ARG`s with the pinned values as defaults.
- `apps/engine/stockfish/` is no longer needed: a fresh clone builds the engine image (and `stack.sh up` starts it) with
  nothing downloaded by hand. The `.gitignore` entry goes; any local copy can be deleted.
- The GPLv3 licence (`Copying.txt` from the release archive) still ships next to the binary, now joined by a short
  `SOURCE.txt` naming the release tag and where its source is.
- Bumping Stockfish = changing two `ARG` defaults in one commit (`fix(engine)` or `feat(engine)`).

Part: 2 (games against the computer), a carry-over from engine-play. Out of scope: other architectures (arm64 images),
building Stockfish from source, a newer Stockfish, the desktop app's bundled engine (Part 7).

ROADMAP: settles the "Later: download a pinned release (URL + SHA-256) at build time" note left by engine-play.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `engine-play`: the engine image carries a pinned, hash-verified Stockfish release with its licence and source notice.

## Impact

- `apps/engine/Dockerfile` (download + verify instead of `COPY stockfish/…`), `.gitignore` (entry removed).
- Comments that say the archive must be in `apps/engine/stockfish/`: `tools/deploy/build.sh`,
  `tools/localdev/docker-compose.yml`, CLAUDE.md, `.serena/memories/core.md`.
- The build needs network access to `github.com` (release assets redirect to `objects.githubusercontent.com`) the first
  time; the layer is cached afterwards.
