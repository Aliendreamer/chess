Each group ends in one commit that passes the frontend gate: `pnpm typecheck && pnpm lint && pnpm check && pnpm
test && pnpm build`. 🐳 marks steps that need the live stack.

## 1. Owner review

- [x] 1.1 The owner confirms the target tree and the two decisions in the proposal (the ping page, the removals).
      Nothing moves before this.

## 2. Components

- [x] 2.1 `components/ui.tsx`, `layout.tsx`, `games.tsx`, `pings.tsx` per the proposal; delete `Badge`, the unused
      props and `relayUrl`; tests follow. Commit: `refactor(frontend): components grouped by feature`.

## 3. Client lib

- [x] 3.1 `lib/auth.ts` (session + `Me`), `lib/live.ts` (+ `useLiveTopic`), `src/testing.ts`; remove `hasRole`,
      `ADMIN_ROLE` and `/forbidden`. Commit: `refactor(frontend): client lib grouped by feature`.

## 4. Server lib

- [x] 4.1 `lib/server/upstream.ts`, `auth.ts`, `games.ts`, `play.ts`, `pings.ts`, `live-relay.ts`, `live-hub.ts`; one
      login redirect and GUID check; the Nitro route and `vite.config.ts` imports; `#/` everywhere; drop the `@/*`
      alias. Commit: `refactor(frontend): server code by feature, shared plumbing once`.
- [x] 4.2 🐳 Recreate the frontend container, then run Playwright (all specs) and `verify-part1.sh`.

## 5. Docs

- [x] 5.1 CLAUDE.md BFF, live relay and UI notes name the new files. Commit: `docs(repo): frontend layout`.
