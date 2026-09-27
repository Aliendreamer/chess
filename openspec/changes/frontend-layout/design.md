## Context

The frontend grew one file per component or helper, and the BFF's server code was split by when it was written
(`api-loaders`, `game-loaders`, `play-loaders`) rather than by feature. The backend was reorganised under the same
two rules in `backend-layout`. This change applies them here.

## Goals / Non-Goals

**Goals:** the target tree in the proposal; one definition of each shared helper; dead code removed; no behaviour
change.

**Non-Goals:** splitting or restyling route pages, changing the cookie contract, touching `e2e/` beyond imports,
new features.

## Decisions

- **D1 — Multi-component files have lower-case names** (`ui.tsx`, `games.tsx`, `layout.tsx`, `pings.tsx`). The file
  names a feature, not one component.
- **D2 — `upstream.ts` merges env config and fetch helpers.** Both answer "how the BFF reaches the API". Kept apart,
  `config.ts` stays a 43-line file and the helpers stay copied three times.
- **D3 — `cookies.ts` stays on its own.** CLAUDE.md names it as the whole cookie contract, it is security-relevant,
  and it has its own test. It is not tiny (73 lines).
- **D4 — The live hub is one file** (`hub-multiplexer` + the SignalR port + the service token): all three exist only
  to hold one authenticated SignalR connection per process. The multiplexer stays pure and testable through its
  `HubPort` seam; only the file changes.
- **D5 — The dev relay host moves into `live-relay.ts`.** It only adapts `ws` sockets to `openRelay`. `vite.config.ts`
  imports `devLiveRelay` from there. It is a type-only `vite` import plus `ws`, which is already a server dependency.
- **D6 — `lib/live.ts` takes the hook.** Frames, `applyFrame` and `useLiveTopic` are one feature; the server imports
  the frame types from the same file, which is fine because React is on the server too.
- **D7 — Routes stay as they are.** Each route file is one page with its parts; splitting pages out is a separate
  decision.

## Risks / Trade-offs

- **Nitro traces `server/routes/api/ws/live/[kind]/[id].ts` separately.** If `live-relay.ts` now pulls a `vite`
  type, it must stay `import type`. The production build (`pnpm build`) is part of the gate for that reason.
- **Large mechanical move.** Mitigation: one commit per group, each passing `pnpm typecheck && pnpm lint && pnpm
check && pnpm test && pnpm build`, and Playwright against the live stack at the end.
