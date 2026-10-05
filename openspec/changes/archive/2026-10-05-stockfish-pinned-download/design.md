## Context

`apps/engine/Dockerfile` copies `stockfish/stockfish-linux-x86-64-universal.tar.gz` from the build context (the
git-ignored `apps/engine/stockfish/`), unpacks it in the build stage and copies `/opt/stockfish` (binary +
`Copying.txt`) into the `dotnet/runtime` stage. The local archive is the official release asset: its SHA-256 matches
the digest GitHub publishes for it (checked 2026-10-05).

| Pin     | Value                                                                                                             |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| Release | `sf_19` (official-stockfish/Stockfish)                                                                            |
| URL     | `https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz` |
| SHA-256 | `9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f`                                                |
| Size    | 81 388 977 bytes                                                                                                  |

## Goals / Non-Goals

**Goals:** a fresh clone builds the engine image; the binary is exactly the pinned release; the licence notice stays.

**Non-Goals:** multi-arch images, building from source, verifying a GPG signature (the project publishes none for
release assets; the hash pin is the integrity check), changing the Stockfish version.

## Decisions

- **D1 — Download in the build stage with `ADD --checksum`.** BuildKit's
  `ADD --checksum=sha256:<hash> <url> /tmp/stockfish.tar.gz` fetches and verifies in one instruction and fails the
  build on a mismatch. The Dockerfile already starts with `# syntax=docker/dockerfile:1`, which supports it. The URL and
  hash are `ARG STOCKFISH_URL` / `ARG STOCKFISH_SHA256` with the pinned values as defaults, so a bump is one commit and
  a build can override them (`--build-arg`) for a trial. Alternative: `curl -fsSL … && echo "<hash>  file" |
sha256sum -c -`. It works without BuildKit, but needs curl in the image and is more lines; kept as the fallback if
  `ADD --checksum` misbehaves with GitHub's redirect.
- **D2 — Unpacking stays as it is.** Same archive layout (`stockfish/stockfish-linux-x86-64-universal`,
  `stockfish/Copying.txt`), same target `/opt/stockfish`, same `Engine__StockfishPath`. The runtime stage is unchanged.
- **D3 — `SOURCE.txt` beside `Copying.txt`.** GPLv3 §6 requires the corresponding source to go with a distributed
  binary; since we ship the unmodified upstream release, a notice naming the tag and the upstream source
  (`https://github.com/official-stockfish/Stockfish/tree/sf_19`, plus the release's source tarball URL) is written in
  the build stage from the same `ARG`s. Pushing an engine image to Docker Hub is the distribution, so this matters for
  `push`, not for local images.
- **D4 — The download layer comes before the .NET publish.** It changes only when the pin changes, so it is placed
  right after `FROM … AS build` and cached across code changes; today the `COPY` sits after `dotnet publish`.
- **D5 — The folder goes, its ignore entry stays.** The `.gitignore` entry stays (comment reworded) so a leftover
  local archive can never be committed by accident; comments in `build.sh`,
  compose, CLAUDE.md and the Serena memory stop asking for the archive. A leftover local folder is harmless (no longer
  in any `COPY`), and the change tells the owner they can delete it.

## Risks / Trade-offs

- **Builds need GitHub.** The first build (and a cache-less one) downloads 81 MB from GitHub; offline builds without a
  cached layer fail. Accepted: restores and base images already need the network.
- **Upstream re-publishes an asset.** If GitHub served a different file under the same URL, the hash check fails the
  build loudly instead of shipping it — the intended behaviour.
- **x86-64 only.** The pin is the `x86-64-universal` asset, as today. An arm64 image would need a per-`TARGETARCH`
  pin (the arm64 asset's SHA-256 is `fe26cfd1d9db4c8af3d21e24d9ff34cacb31c1f940085a7583da11796f2bac01`); out of scope.

## Verification

- 🐳 `pnpm exec nx build engine` (or `tools/deploy/build.sh engine local`) with `apps/engine/stockfish/` moved away.
- 🐳 `docker run --rm --entrypoint sh <image> -c 'echo uci | /opt/stockfish/stockfish | head -1; ls /opt/stockfish'`
  shows `Stockfish 19`, `Copying.txt`, `SOURCE.txt`.
- 🐳 A build with `--build-arg STOCKFISH_SHA256=<wrong>` fails.
- 🐳 `tools/localdev/verify-part2.sh --quick` against the restarted stack.
