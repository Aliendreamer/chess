## 1. Engine image

- [ ] 1.1 🐳 Failing check first: move `apps/engine/stockfish/` out of the repo and run
      `tools/deploy/build.sh engine local`; it fails at `COPY stockfish/stockfish-linux-x86-64-universal.tar.gz`
      ("not found"). Keep the folder moved away for the rest of the task.
- [x] 1.2 `apps/engine/Dockerfile`: `ARG STOCKFISH_URL` / `ARG STOCKFISH_SHA256` (pinned defaults from design.md),
      `ADD --checksum=sha256:${STOCKFISH_SHA256} ${STOCKFISH_URL} /tmp/stockfish.tar.gz` right after the build stage's
      `FROM`, the same unpack into `/opt/stockfish`, and `SOURCE.txt` (tag + source URLs) written beside
      `Copying.txt`. Update the header comment.
- [ ] 1.3 🐳 Prove it: the build from 1.1 now passes; `docker run --rm --entrypoint sh <image> -c 'echo uci |
/opt/stockfish/stockfish | head -1; ls /opt/stockfish'` prints `Stockfish 19` and lists `Copying.txt` and
      `SOURCE.txt`; a build with `--build-arg STOCKFISH_SHA256=0000…` fails at the `ADD`.
- [x] 1.4 `.gitignore` keeps the `apps/engine/stockfish/` entry (reworded: a leftover archive must never be committed); `tools/deploy/build.sh` and
      `tools/localdev/docker-compose.yml` comments no longer ask for the archive.
      Commit: `feat(engine): the image downloads a pinned stockfish release`.

## 2. Stack

- [ ] 2.1 🐳 Human-run: `tools/localdev/stack.sh up` rebuilds the engine without the local folder;
      `tools/localdev/verify-part2.sh --quick` passes.

## 3. Docs

- [x] 3.1 CLAUDE.md (engine line and engine-play note), `.serena/memories/core.md` (the "later: pinned release" note),
      ROADMAP (carry-over done). Tell the owner the local `apps/engine/stockfish/` can be deleted.
      Commit: `docs(repo): stockfish-pinned-download`.
