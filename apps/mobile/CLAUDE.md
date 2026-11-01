# apps/mobile — chess-mobile

Loaded when working under `apps/mobile`. Cross-app rules live in the root `CLAUDE.md`; the plan is OpenSpec
`mobile-app` (design D1–D13, tasks by group).

## Commands

```bash
pnpm exec nx run-many -t lint test build -p mobile   # typecheck, expo lint, prettier, pins, expo-doctor; jest; export
pnpm exec nx run mobile:start                        # dev server over an Expo tunnel, for the development build
```

Inside the agent sandbox run Expo commands with `EXPO_NO_TELEMETRY=1` (telemetry writes `~/.expo`) and
`NODE_USE_ENV_PROXY=1` (expo-doctor fetches from `exp.host` / `reactnative.directory`).

## Set-up notes

- Expo SDK 57, pinned exactly (`check:pins`); add packages with `pnpm expo install <pkg>`, then pin what it wrote. The
  patches are the ones expo-doctor expects; the repo's `minimumReleaseAge` (7 days) applies.
- Metro needs no workspace configuration: Expo's default follows pnpm's symlinks into `libs/*` (TS source with `.ts`
  imports) and gives the bundle one React (19.2.3). **Jest does not**: `jest.config.js` maps `react` to this app's
  copy, or a `@chess/view` hook fails with "Invalid hook call" (the libraries keep React 19.2.7 for the web apps).
- `expo:doctor` is `scripts/expo-doctor.js`: expo-doctor with one finding tolerated, the libraries' own test React
  (`libs/*/node_modules/react`); anything else fails.
- `test-renderer` is overridden to 1.2.0 in `pnpm-workspace.yaml` (1.3.0 needs React 19.3).
- `src/app` holds routes only (Expo Router bundles every file there); route tests go in `src/__tests__/app/`.
- `build` exports Android and iOS (not web); iOS bundles without a Mac, only native builds need one.
