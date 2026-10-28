# apps/desktop — chess-desktop

Loaded when working under `apps/desktop`. Cross-app rules live in the root `CLAUDE.md`.

## Commands

```bash
# desktop (apps/desktop) — needs Rust and, on Linux, the WebKitGTK dev packages (README)
pnpm exec nx run desktop:dev        # fetches the pinned Stockfish once, then the window (WSLg on WSL)
pnpm exec nx run desktop:test       # vitest (node:sqlite data layer, UCI client, pages) + the tools/desktop tests
pnpm exec nx run desktop:bundle     # this machine's installers; tools/desktop/publish.sh <version> uploads them
```

- **Desktop app (desktop-app)** — `apps/desktop`: a Vite SPA (TanStack Router, hash history) in a thin Tauri shell
  (`src-tauri`: plugins only; `capabilities/default.json` allows the sidecar, the news hosts, dialog-picked files and
  links in the browser; a strict CSP). `src/lib/app.tsx` builds the services the router hands every loader (database,
  two Stockfish supervisors, the analysis queue, dialogs, fetching); `src/lib/data/*` is one file per feature over
  SQLite (`db.ts`: migrations by `user_version`, one write queue, batches as one `BEGIN…COMMIT` call because the
  plugin's pool may switch connections), `src/lib/engine.ts` the UCI client (board requests stop background work).
  Logic ported from the backend lives in `@chess/core` with the backend tests' cases; the backend keeps its C# copies,
  so a rule change touches both. Releases: Nx Release group `desktop`, `nx run desktop:bundle` on WSL and on a
  Windows-side clone, `tools/desktop/publish.sh` to the GitHub Release.
