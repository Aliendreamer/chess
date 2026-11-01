Every task ends at a commit where `pnpm exec nx run-many -t lint test build` passes. Under "Test first", each task
names the failing test written before the code and how it fails. **[human]** marks a gate the owner (or the friend
with a Mac) runs, with the command that proves it: a phone, Gradle outside the sandbox, a Mac, or a release.

## 1. Library split (desktop and club unchanged)

- [x] 1.1 Add scope `mobile` to commitlint and `openspec/config.yaml`. Add `apps/mobile/{android,ios}`,
      `apps/mobile/modules/stockfish/vendor/` and `*.jks`/`*.keystore` to `.gitignore`.
      Test first: `echo "feat(mobile): x" | pnpm commitlint` fails with `scope-enum`.
- [x] 1.2 Move the view shapes (types) from `@chess/ui`'s `<feature>-model.ts` files into `@chess/core`
      (`views.ts`). `@chess/ui` re-exports them, so no importer changes yet.
      Test first: a type test in `libs/chess-core` importing `ReviewView` fails to compile.
- [x] 1.3 Create `libs/chess-view` (`@chess/view`): Nx project, pnpm package, vitest, ESLint ban on
      `react-dom`/router/Tauri/React Native, and a tsconfig without the DOM lib. Move the hooks from
      `<feature>-model.ts` and `analysis.ts`, with `useKeys`/`isVisible` passed in (D1). Set the `react` peer range
      to `>=19.2.3 <19.3.0` here and in `@chess/ui` (D3).
      Test first: the moved hook tests, run from `libs/chess-view`, fail with "module not found". A fixture reading
      `document` fails the typecheck.
- [x] 1.4 Create `libs/chess-local` (`@chess/local`) and move `apps/desktop/src/lib/data/*` (except the Tauri
      adapter in `db.ts`) and `src/lib/engine.ts` (except `sidecarChannel`). Make the migrations TS string modules,
      and add the `LocalAssets` interface for the openings and the bundled library. Use `fflate` for gunzip in place
      of `DecompressionStream`. Desktop keeps `tauriSql`, `sidecarChannel`, Vite asset loaders and `app.tsx`.
      Test first: desktop's data and engine tests, moved, fail with "module not found". A fixture importing
      `@tauri-apps/plugin-sql` fails the lint.
- [ ] 1.5 Add `EngineScheduler` to `@chess/local`: priorities (game move > board > judgement > review > miner),
      pre-emption with `stop` and a later re-ask, `setoption` only while idle, `hold()`/`resume()`, and one channel or
      one per role. Desktop wires it with its two processes.
      Test first: against the fake engine, a review search is stopped by a board request, and a `setoption` is sent
      mid-search. Both fail.
- [ ] 1.6 Crash-safety pieces in `@chess/local` (D13):
  - drafts (`draft.analysis`, `draft.study.<id>`, debounced) and the desktop pages restoring them;
  - migration 0002 `engine_failures`, with review, miner and judgement skipping a failed position;
  - the scheduler sending `# request {json}` before each `go`, and its `stuck` state when `quit` gets no answer in 2 s;
  - `crashRecovery(read)`, which turns a crash record or marker into the notice to show and the guard to apply.

  Test first: a crash record for a review FEN expects that FEN in `engine_failures` and skipped by the next review
  round; a marker without a crash record expects no notice. Both fail.

- [ ] 1.7 **[human]** Run the desktop smoke list (`apps/desktop/README.md`) on `nx run desktop:dev`, and the club's
      Playwright suite (`tools/e2e.sh`): both must be unchanged.

## 2. Expo app scaffold

- [ ] 2.1 Create `apps/mobile` with Expo SDK 57 + Expo Router + RN 0.86 (pins from `SpanishGameApp`):
      `project.json` targets `start`/`android`/`test`/`lint`/`build`, `metro.config.js` with the workspace root in
      `watchFolders`, `check:pins`, `expo-doctor`, jest-expo, `@/` imports, the `src/app` + `src/screens` layout and
      the route-test folder rule. A placeholder screen imports `@chess/core` and `@chess/local`.
      Test first: `EXPO_NO_TELEMETRY=1 CI=1 pnpm exec expo export --platform android` fails to resolve
      `@chess/core` (or its `.ts` imports) until Metro is configured (D4).
- [ ] 2.2 `app.config.ts`: name, id `io.github.aliendreamer.chess`, scheme, portrait, version from `package.json` and
      the derived `versionCode` (D11), the icon and splash from the desktop icon, fonts through `@expo-google-fonts`,
      `expo-dev-client`, `expo-sqlite`, `expo-build-properties` (SDK 36).
      Test first: `app-config.test.ts` expects `versionCode` 10203 for version 1.2.3, and fails.
- [ ] 2.3 `tools/mobile/setup-android.sh` and `build-android.sh` (from `SpanishGameApp`), and an `apk` target
      (development profile for now). **[human]** `nx run mobile:apk` outside the sandbox, the dev build on a phone,
      `nx run mobile:start` shows the placeholder.

## 3. Stockfish module

- [ ] 3.1 `tools/mobile/fetch-stockfish-src.mjs` + `stockfish.json` (`sf_19` source archive and both nets, SHA-256
      each) → `modules/stockfish/vendor/`, refusing a mismatch.
      Test first: `fetch-stockfish-src.test.mjs` with a wrong hash expects a rejection and no files written.
- [ ] 3.2 C++ bridge (`cpp/bridge.cpp`), with Stockfish's own sources unmodified:
  - the UCI loop on its own thread, with `cin`/`cout` stream buffers swapped;
  - `start`, `send` and `quit`;
  - the coalescing batcher: last `info` per `multipv`, and any other line flushes at once (D6).

  Test first: a host-side C++ test (`g++` in `tools/mobile/bridge-test.sh`) sends `uci` and expects `uciok`. With
  MultiPV 3 and `go depth 12`, it expects `bestmove` as the last line of its batch, and at most one `info` per
  `multipv` per batch. It fails until the bridge exists.

- [ ] 3.3 The bridge's crash record (D13):
  - `# request {json}` kept and never passed to Stockfish;
  - `engine-request.json` written on `go` and removed on `bestmove`;
  - the chained signal handler writing `engine-crash.json` only for a signal on the engine thread, then re-raising.

  Test first: in `bridge-test.sh`, a child process that raises `SIGSEGV` on the engine thread leaves
  `engine-crash.json` holding the request's FEN. One that raises on the main thread leaves none. Both fail.

- [ ] 3.4 Android: the Expo module (Kotlin + JNI, CMake, `arm64-v8a` + `x86_64`, `-O3`) with the API of D6 (`start`,
      `send`, `quit`, `lines`/`exit` events) and the files in the documents directory. `nativeChannel()` implements
      `UciChannel`.
      Test first: `native-channel.test.ts` with a fake module expects the lines of several batches in order and an
      ended channel after `quit`, and fails.
      **[human]** The dev build's engine smoke screen shows `bestmove` within 2 s on the phone, and its "crash test"
      button (dev builds only) closes the app and shows the D13 notice on reopening.
- [ ] 3.5 iOS: the podspec compiling the same C++ with Obj-C++ glue. **[human, Mac]** `npx expo run:ios` on a
      simulator shows the smoke screen's `bestmove`. If this fails, record it and fall back to D6's WASM WebView
      before group 5.
- [ ] 3.6 Add `stockfish` licence files (`Copying.txt`, `AUTHORS`) to the module, `apps/mobile/LICENSE` (GPLv3), and
      the README section on the licence (D10).

## 4. Platform adapters

- [ ] 4.1 `src/platform/sql.ts` (`expo-sqlite` → `Sql`). Test first: `sql.test.ts` with jest-expo's SQLite mock
      expects `select`/`execute`/multi-statement scripts, and fails.
- [ ] 4.2 `src/platform/assets.ts` (`LocalAssets` over `expo-asset` + `expo-file-system`; `library.json.gz` and the
      openings as assets), `fetch` as `FetchText`, `Linking.openURL` for links.
      Test first: an asset test expects the bundled library's bytes and fails.
- [ ] 4.3 `src/lib/app.ts`: build the services (database, one-channel scheduler, review queue, miner off by default,
      news timers) and hook `AppState` to `hold`/`resume` (D8).
      Test first: `app.test.ts` sends `AppState` → `background` and expects `hold()` on the scheduler and a stopped
      news timer, and fails.
- [ ] 4.4 Start-up crash recovery: read and remove `engine-crash.json`/`engine-request.json` before the engine starts,
      then show the D13 notice with _Share a report_ (versions, phone model and OS, signal, FEN, through the share
      sheet), the game screen's _Try again_ / _Take back my last move_, and the analysis board opening its draft with the
      engine off. Show the `stuck` message on every engine feature.
      Test first: `crash-recovery.test.tsx` with a faked crash file for a game expects the notice and the two choices,
      and the engine not asked. It fails.
- [ ] 4.5 Backup/restore and PGN import/export through `expo-sharing` + `expo-document-picker`.
      Test first: restoring a backup written by `@chess/local` under `node:sqlite` (a desktop backup) succeeds in
      the mobile restore path, and fails until wired.

## 5. Screens

- [ ] 5.1 **[human]** Mockups of the tab layout (D5), the game screen, analysis and the trainer, shown to the owner.
      Adjust D5 with the owner's answers before 5.3.
- [ ] 5.2 Tokens (`src/theme/tokens.ts`) with the drift test against `theme.css`, the primitives (buttons, rows,
      sheets, empty states), the Cburnett pieces as SVG components, and `MobileLink` for `LinkContext`.
      Test first: the drift test fails on a changed colour.
- [ ] 5.3 The board: tap-tap, drag, legal targets, last move, check, promotion picker, flip, coordinates, themes,
      reduced animation. Test first: `board.test.tsx` taps e2 then e4 and expects `onMove('e2e4')`, and fails.
- [ ] 5.4 Tabs and shell: Expo Router tabs, safe areas, Club dark / Parchment light, and the first-start library
      progress line.
- [ ] 5.5 Play: home, new game (level, colour, think time), game screen (premoves, take-back, draw offer, resign
      request, resign, engine status), game list, PGN share. Test first: the desktop's play cases on the screen
      (an engine move appears after the player's move) fail.
- [ ] 5.6 Analysis board with lines, eval bar, move tree, opening name and "In the library", and the review view.
- [ ] 5.7 Studies: list, editor with variations, import/export.
- [ ] 5.8 Trainer (families, learn then test, study lines) and training sessions.
- [ ] 5.9 Library: search, game view, explorer, openings.
- [ ] 5.10 News and tournaments, Settings (incl. the miner switch), About (licences, source link), Backup.
- [ ] 5.11 Write the manual smoke list in `apps/mobile/README.md`. **[human]** Run it on an Android phone.

## 6. Release

- [ ] 6.1 Nx Release group `mobile` (`apps/mobile/package.json`, tag `mobile@{version}`). Check with
      `nx release version --dry-run --projects mobile` after a `fix(libs)` commit that a patch bump is proposed.
- [ ] 6.2 The release `apk` target: a signing config plugin reading `CHESS_ANDROID_KEYSTORE*`, failing early when one
      is missing. Test first: a plugin test without the variables expects the error naming the variable, and fails.
      **[human]** Create the keystore, back it up, and run `nx run mobile:apk`;
      `apksigner verify --print-certs` shows the owner's certificate.
- [ ] 6.3 `ipa` target and README "Building on a Mac" (Xcode, CocoaPods, `nx run mobile:ipa`, installing with a free
      Apple ID, the 7-day expiry). **[human, Mac]** The friend builds the .ipa.
- [ ] 6.4 `tools/mobile/publish.sh` (create or upload, changelog notes, the APK and an .ipa when present).
      Test first: `publish.test.mjs` with a stubbed `gh` expects `release create mobile@1.0.0` then
      `release upload`, and fails.
- [ ] 6.5 Update CLAUDE.md (root and `apps/mobile/CLAUDE.md`). **[human]** First release: `nx release version 1.0.0
--projects mobile`, `nx run mobile:apk`, `tools/mobile/publish.sh 1.0.0`.
