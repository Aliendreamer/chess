## Context

`desktop-app` made the club's one-player features an offline Tauri app. Its code is already split along the right
lines:

- `@chess/core` holds the pure logic.
- `@chess/ui` holds the HTML components plus, in `<feature>-model.ts`, the React hooks and view shapes.
- `apps/desktop/src/lib/data/*` (~5,000 lines with `engine.ts`) is the storage, play, review, training, library and
  news code. It reaches the platform only through small interfaces (`Sql`, `UciChannel`, `FetchText`). Only `db.ts`
  (`tauriSql`), `engine.ts` (`sidecarChannel`) and `app.tsx` import Tauri, and two Vite-only imports load assets
  (`?raw` for the migration SQL and the openings TSVs, `?url` for the bundled library).

The owner's decisions (2026-11-01):

- The same app on phones: **Android and iOS**, with **every** desktop feature.
- **Expo**, set up as in `SpanishGameApp`: Expo SDK 57, Expo Router, React Native 0.86, dev client, exact pins, a
  local Gradle build.
- Not paying for store or developer accounts. It is for the owner and their friends; Android goes out as an APK,
  possibly through a GitHub Release.
- The owner has no Mac. A friend builds iOS, prepared with scripts like desktop's macOS build.
- Screens: the agent lays them out from the desktop pages in the Club look, and the owner reacts.

## Goals / Non-Goals

**Goals:**

- Every desktop feature in mobile 1.0.0, working offline on Android and iOS.
- One copy of the data layer, the UCI client and the view state for the desktop and mobile apps, as `desktop-app`
  did for the club and the desktop app.
- An APK the owner builds in WSL and publishes with a few commands, and an .ipa a friend builds on a Mac with one
  command.
- The desktop app and the club behave the same after the refactor.

**Non-Goals:**

- Stores, TestFlight, EAS cloud builds, an Expo account, push notifications, an updater, sync.
- Tablet or landscape layouts, widgets, and work while the app is closed or in the background.
- Reusing `@chess/ui`'s HTML components through a WebView or `react-native-web`.

## Decisions

### D1. Four shared libraries, two of them new

| Library                | Holds                                                                                                                                                                                                             | May not depend on                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `@chess/core` (exists) | pure logic, **plus the view shapes** (the types the data layer returns and the screens take)                                                                                                                      | React, DOM, any platform                                 |
| `@chess/local` (new)   | the desktop's `lib/data/*` (db + migrations, play, analysis, review, studies, trainer, training, library, bundled, openings, news, settings, backup) and `lib/engine.ts` (UCI client, supervisor, analysis queue) | React, DOM, Tauri, React Native, Expo, Vite-only imports |
| `@chess/view` (new)    | the hooks from `<feature>-model.ts` and `analysis.ts`                                                                                                                                                             | DOM globals, `react-dom`, a router                       |
| `@chess/ui` (exists)   | the HTML components, theme.css, the pieces                                                                                                                                                                        | a router, Tauri, React Native                            |

- **Assets** are no longer imported with `?raw` and `?url`. The migrations become TS string modules
  (`migrations/0001_init.ts`). The openings TSVs and `library.json.gz` are handed in by the app through a
  `LocalAssets` interface (`openingsTsv()`, `bundledLibrary(): Promise<Uint8Array>`). Desktop implements it with Vite
  imports; mobile with `expo-asset` + `expo-file-system`.
- **Gzip:** the bundled library is unzipped with `fflate`, a small pure-JS library, in `@chess/local`. React Native
  has no `DecompressionStream`, so desktop switches to `fflate` as well, which leaves one code path.
- **DOM in hooks:** two hooks touch the DOM, `studies-model`'s `keydown` and `review-model`'s `visibilityState`.
  They take those as parameters (`useKeys`, `isVisible`). `@chess/ui` passes the DOM versions; mobile passes
  `AppState` and no keys.
- Each new library is an Nx project with `lint` (typecheck, ESLint `no-restricted-imports` for its row above,
  prettier) and `test` (vitest, 75 %). It is a pnpm workspace package whose `exports` point at the TS source, as in
  `desktop-app` D3.

_Alternatives:_

- Copy the data layer into `apps/mobile`: two copies would drift. This was rejected in `desktop-app` for the same
  reason.
- `react-native-web` in reverse (render `@chess/ui` in a WebView): slow boards, and two runtimes.

### D2. Mobile UI components live in the app

The React Native components (board, move list/tree, eval bar and graph, primitives, every screen) live in
`apps/mobile/src/components` and `src/screens`, as `SpanishGameApp` lays them out. Only one app uses React Native, so a
`libs/chess-ui-native` would be a library with one user. They take the same view shapes and hooks as `@chess/ui`'s
components, so a feature's behaviour is defined once (in `@chess/view` + `@chess/local`) and drawn twice.

**Tokens:** `apps/mobile/src/theme/tokens.ts` carries the Club and Parchment colours, sizes and fonts (IBM Plex
Sans/Mono and Newsreader through `@expo-google-fonts`, bundled at build time, so no requests at run time). A test
parses `libs/chess-ui/src/theme.css` and fails when a token's value differs, so the two cannot drift silently.

### D3. React versions

React Native 0.86 needs React 19.2.3 exactly, because its renderer is built against it. The club and desktop pin
19.2.7. Each app keeps its own exact pin. `@chess/view` and `@chess/ui` declare `react` as a peer range
`>=19.2.3 <19.3.0`, which says what they work with and installs nothing. pnpm resolves each app's copy. The
repo's "no ^ or ~" rule is about installed versions, and a peer range is not one. When React Native moves to a newer
React, the mobile pin moves with it.

### D4. The Expo app inside the Nx workspace

`apps/mobile` is an Nx project (`project.json`, `nx:run-commands` like desktop) and a pnpm workspace package
(`chess-mobile`), with SDK 57's monorepo support (Metro follows pnpm's symlinks; `metro.config.js` adds the
workspace root to `watchFolders`). `@chess/core`'s `.ts`-extension imports must resolve in Metro. The first scaffold
task proves this by bundling `expo export --platform android` with a screen that imports `@chess/core` and
`@chess/local`.

Targets: `start` (dev server, `--tunnel --dev-client` as in `SpanishGameApp`, because WSL2 cannot be reached from the
phone otherwise), `android` (run the dev build), `test` (jest-expo), `lint` (typecheck, `expo lint`, prettier,
`check:pins`, `expo-doctor`), `build` (`expo export` for both platforms: a bundle check, cached), `apk`, `ipa`.

**Builds without an Expo account:** `expo prebuild` + Gradle (`tools/mobile/build-android.sh`, after
`SpanishGameApp`'s `scripts/build-gradle.sh`). `android/` and `ios/` are generated and never committed. Everything
native the app needs is declared through config plugins in `app.config.ts`.

Identity: name "Chess", `io.github.aliendreamer.chess` (as desktop), scheme `chess`, portrait, `userInterfaceStyle`
`automatic` with the Club dark / Parchment light setting as on desktop.

### D5. Navigation

These are the agent's calls; the owner reviews them on the mockups before task 5.

- Expo Router with a bottom tab bar of five tabs:
  - **Play:** home, new game, game list, and the game screen.
  - **Learn:** trainer, training, studies.
  - **Analyse:** analysis board, library and explorer, review.
  - **News.**
  - **More:** settings, backup/restore, About.
- Routes mirror the desktop's paths under their tab (`/play/games/[id]`, `/learn/trainer/[family]`, …), so a link in
  shared code (`LinkContext` → `MobileLink`) maps one to one.
- A game in play takes the full screen, with the board edge to edge on the phone's width and the move list and
  controls below it.

### D6. Stockfish 19 compiled into the app: a local Expo module

No maintained React Native package carries Stockfish 18/19 for both platforms (searched 2026-11-01). So the app has
its own module, `apps/mobile/modules/stockfish` (Expo Modules API, autolinked). The module is deliberately dumb: it
carries UCI text lines both ways and knows no chess. Everything that understands UCI stays in TypeScript, in the
client desktop already tests.

- **Source:** `tools/mobile/fetch-stockfish-src.mjs` downloads the `sf_19` source archive and the one NNUE network it
  names (`evaluate.h`'s `EvalFileDefaultName`, `nn-1a298aa575a0.nnue`, 98.5 MB), each SHA-256-pinned in
  `tools/mobile/stockfish.json`. It refuses a mismatch, as desktop's fetch does, and writes into
  `modules/stockfish/vendor/` (git-ignored). The net is embedded in the library at build time, as Stockfish's own
  build does, so no file has to be found at run time.
- **Bridge (`modules/stockfish/cpp/bridge.cpp`):** Stockfish's sources are compiled **unmodified**. Before starting
  Stockfish's UCI loop on its own thread, the bridge swaps the `rdbuf` of `std::cin` and `std::cout`:
  - **In:** a stream buffer that waits on a locked line queue, which `send` pushes to.
  - **Out:** a stream buffer that cuts at `'\n'` and hands each line to the batcher.
- **Batcher (coalescing):** every ~50 ms the batcher emits one `lines` event. Within a batch it keeps only the
  **last** `info` line for each `multipv` number, because the TS client keeps only the latest one anyway, and passes
  every other line through in order. Any line that is not `info` (`uciok`, `readyok`, `bestmove`) flushes the batch
  at once, so `bestmove` is never delayed or reordered. This sends a few dozen lines a second over the bridge instead
  of hundreds, with the same result.
- **Module API (`modules/stockfish/index.ts`):**

  ```ts
  start(): Promise<void>      // starts the engine thread; rejects if one is running
  send(line: string): void    // queues one UCI line and returns at once
  quit(): Promise<void>       // sends "quit" and waits for the thread to end
  addListener('lines', (e: { lines: string[] }) => void)
  addListener('exit', (e: { reason: 'quit' | 'error'; message?: string }) => void)
  ```

  `start` takes no settings. Threads, hash, strength and MultiPV are `setoption` lines sent from TypeScript. A
  restart is `quit` then `start`, which makes a fresh engine object on a new thread; Stockfish's one-time tables are
  set up once per app run.

- **Android:** CMake through the module's `build.gradle` (`externalNativeBuild`), ABIs `arm64-v8a` (phones) and
  `x86_64` (emulator), `-O3`, NEON/dotprod where the ABI has them. JNI glue in Kotlin.
- **iOS:** the module's podspec compiles the same C++ (arm64, simulator arm64), with Obj-C++ glue.
- **Threads:** the engine thread is the module's own, not Expo's shared async queue, so a long search never blocks
  other modules. `Threads` = min(2, cores − 1), `Hash` 64 MB.

**In TypeScript,** `nativeChannel()` (`apps/mobile/src/platform/`) implements `@chess/local`'s `UciChannel`:
`write` → `send`, `onLine` ← each line of a `lines` event, `onExit` ← `exit`, `kill` → `quit`. Above it, everything is
desktop's code unchanged:

- `parseInfo` reads `info … multipv k score cp|mate x … pv …`, drops bound scores and turns the score to White's
  view.
- `UciEngine.analyse` keeps the latest line per `multipv` and resolves on `bestmove` with
  `{ depth, lines: EvaluationLine[] }` (`{ cp, mate, pv: ['e2e4', …] }`, best first).
- The result is stored in `position_evaluations`. Screens show it through `lineMoves` (SAN) and `scoreText`
  ("+0.34", "#5").
- A game move uses `bestmove`'s move.

Live evaluation while Stockfish is still thinking is not in 1.0.0 (desktop shows the result at the end too). It would
be an `onProgress` callback added to both apps, with no change to the bridge.

_Alternatives:_

- **`dawikk-stock`:** last published August 2025 with Stockfish 17. Its peer range `react-native: '*'` promises
  nothing for RN 0.86's new-architecture-only runtime, and it is labelled MIT while it bundles GPLv3 Stockfish.
  Desktop and the bundled judged positions are on Stockfish 19, and a phone on 17 would disagree with them.
- **`loloof64/React-Native-Stockfish-Android`:** Stockfish 15, Android only.
- **A chess-level native API** (`analyse(fen, ms) → lines`): the UCI parsing would be written twice (Kotlin and
  Obj-C++), and we would lose the tested TS client.
- **A synchronous C++ module reading lines on demand:** more complex; pushing events is enough.
- **stockfish.js (WASM) in a hidden WebView:** no native code, but slower and single-threaded with a second JS
  runtime. It is the fallback if the native build fails on iOS.
- **An Android executable spawned as a process:** fragile on Android 10+, and impossible on iOS.

### D7. One engine, shared by everything

Stockfish keeps process-wide state, so the app runs **one** engine where desktop runs two processes (play and
analysis). `@chess/local` gains `EngineScheduler`, which owns the one `UciChannel`. It serves requests in priority
order:

1. the engine's move in a game,
2. the board's analysis,
3. the draw/resign judgement,
4. review,
5. the miner.

Before each search it sets the options that search needs (`UCI_LimitStrength`/`UCI_Elo` or `Skill Level` for a game
move; full strength and `MultiPV` 3 otherwise), so it sends `setoption` only while the engine is idle. A higher
request pre-empts a lower one with `stop`, and the lower one is asked again later, as desktop's `AnalysisQueue`
already does for board versus background. Desktop keeps its two processes: the scheduler takes a channel per role,
and desktop gives it two.

### D8. The phone's lifecycle

- When the app goes to the background (`AppState` → `background`), the scheduler sends `stop` and holds every queue.
  A game in play is already saved move by move (`desktop-app` D6). When the app returns, the engine's move is asked
  again if it is the engine's turn. The search is never assumed to have finished in the background, because both
  platforms suspend apps.
- **Review** runs only while the app is in front.
- **The miner** is **off by default on mobile**: the agent's call, because it keeps a core busy and drains the
  battery. Settings can turn it on, and it then runs only in front.
- When the app is killed, nothing is lost: SQLite commits each write, and a game resumes from its last move.
- News fetches on start and then on its timer while in front. There is no background fetch.

### D9. Storage: `expo-sqlite` behind `Sql`

`apps/mobile/src/platform/sql.ts` implements `Sql` with `expo-sqlite`'s `openDatabaseAsync('chess.db')`. `select` uses
`getAllAsync`, `execute` uses `runAsync` (or `execAsync` for multi-statement scripts). The single-writer queue,
migrations, `user_version` and the batch-as-one-call rule all stay in `@chess/local`'s `db.ts` unchanged.
`expo-sqlite` uses one connection, so the plugin-pool caveat that made desktop inline batches is moot but harmless.

**Data:**

- The bundled library is loaded on first start behind the first screen, with a progress line ("Preparing the
  library … n %"). It takes longer on a phone than desktop's ~5 s, and the miner and the explorer wait for it as on
  desktop.
- Backup writes `VACUUM INTO` a cache file and hands it to the share sheet (`expo-sharing`).
- Restore takes a file from `expo-document-picker` and runs `desktop-app` D10's checks and replacement. **A desktop
  backup restores on the phone and the reverse, because the schema is the same.**
- PGN import and export go through the same picker and share sheet.

### D10. Licence: the mobile app is GPLv3

Desktop stays MIT because Stockfish is a separate program beside it (aggregation). On mobile, Stockfish is linked
into the app's native library, so the app as distributed is a work based on Stockfish and is released under
**GPL-3.0-or-later**:

- `apps/mobile/LICENSE` is GPLv3, and `modules/stockfish` carries Stockfish's `Copying.txt` and `AUTHORS`.
- About shows the licence, the source link (this repository at the release tag) and every third-party licence.
- `libs/*` stay MIT; MIT code may be combined into a GPL app.

This was explained to the owner on 2026-11-01. The app is for the owner and friends, and the source is public on
GitHub, which meets the GPL's source obligation.

### D11. Release

- **Nx Release:** group `mobile`, `conventionalCommits: true`, tag `mobile@{version}`, version in
  `apps/mobile/package.json`, `apps/mobile/CHANGELOG.md`. `app.config.ts` reads the version and derives
  `android.versionCode` = major·10000 + minor·100 + patch, so Android accepts each release as an update over the last.
  A change in `libs/` counts towards the next version through the project graph, as verified for desktop.
- **Android:** `nx run mobile:apk` = fetch Stockfish source → `expo prebuild -p android --clean` → Gradle
  `assembleRelease`. The APK is signed with the owner's own keystore, whose path and passwords come from env vars
  (`CHESS_ANDROID_KEYSTORE`, `…_PASSWORD`, `…_ALIAS`) read by a config plugin (as in `SpanishGameApp`'s
  `with-release-signing`). The keystore is never committed. **Losing it means every friend must uninstall to
  update**, and the README says to back it up. `tools/mobile/setup-android.sh` installs JDK 17, SDK 36 and NDK 27 (from
  `SpanishGameApp`).
- **iOS:** `nx run mobile:ipa` on a Mac with Xcode = fetch → `expo prebuild -p ios --clean` → `pod install` →
  `xcodebuild archive` with signing off → an unsigned `Chess-<version>.ipa`. The README "Building on a Mac" covers two
  routes:
  1. The friend installs straight to a phone from Xcode with their free Apple ID.
  2. Anyone else signs and installs the .ipa with Sideloadly or AltStore and their own free Apple ID.

  Either way, the install expires after 7 days and is refreshed by reinstalling; free accounts also allow at most
  3 sideloaded apps per device. Desktop's macOS build (D13) went the same way.

- **Publish:** `tools/mobile/publish.sh <version>` creates or extends the GitHub Release `mobile@<version>` with the
  changelog section and uploads the APK, and the .ipa when present (the friend runs `gh release upload` or hands the
  file to the owner). Releasing and publishing are the owner's to run. **No CI.**

### D12. Tests

- Shared libraries: vitest, with the moved tests moving along. Desktop's data-layer tests (on `node:sqlite`) become
  `@chess/local`'s.
- `EngineScheduler` gets new tests against the fake engine: priorities, pre-emption, options set only between
  searches, and hold/resume.
- `apps/mobile`: jest-expo + React Native Testing Library, tests next to the file, route tests in
  `src/__tests__/app/` (`SpanishGameApp`'s rule), 75 % coverage gate.
- The native module's C++ bridge is tested on the device through a smoke screen in the dev build. Its TS channel is
  tested against a fake `onLine` emitter.
- There is no Detox/Maestro end-to-end suite in 1.0.0. `apps/mobile/README.md` holds a manual smoke list, as desktop
  does.
- The bridge's batcher, request marker and crash record are tested host-side with `g++`
  (`tools/mobile/bridge-test.sh`). The test raises a signal on the engine thread in a child process and expects
  `engine-crash.json`. The start-up notice and the crash-loop guard are tested in jest with the files faked.

### D13. A Stockfish crash: save as we go, record it, explain it on the next start

On desktop, a crashed Stockfish is a separate process the supervisor restarts. On a phone it is inside the app, so a
crash closes the app and nothing can show a dialog at that moment. The handling has three parts.

**Saved before a crash can happen:**

- Games, studies, trainer progress and reviews are already written as they change (`desktop-app` D6), and a game
  resumes at its last move.
- **New:** the analysis board's position and line, and an unsaved study edit, are kept as a draft (`settings` rows
  `draft.analysis` and `draft.study.<id>`, written on each change, debounced 500 ms). After a restart the player is
  back where they were. Both apps get the drafts, since they live in `@chess/local`.

**Recorded at the moment of the crash, by the bridge (C++, files in the app's documents directory):**

- **The request marker.** Before passing a `go` line to Stockfish, the bridge writes `engine-request.json`. Its
  content was set by the last `send("# request {json}")`, a comment line the bridge keeps and never passes to
  Stockfish. It holds the kind (game / board / judgement / review / miner) and the FEN; a game move's game is the one in play.
  The bridge deletes the file when `bestmove` arrives. The scheduler sends the comment before each `go`.
- **The signal handler.** It is installed by `start()` for `SIGSEGV`, `SIGABRT`, `SIGILL`, `SIGBUS` and `SIGFPE`.
  When a signal arrives **on the engine thread**, it writes `engine-crash.json` with the signal, the time and the
  marker's content. It writes from a buffer prepared in advance, using only async-signal-safe `open`/`write`/`close`,
  then restores and re-raises to the previous handler, so the OS and any crash reporter still see the crash. A signal
  on any other thread passes straight through and is not blamed on Stockfish.

**On the next start, before the engine is used (`@chess/local` `crashRecovery`, with the files read by the mobile
platform layer):**

- **`engine-crash.json` exists:** a notice reads _"Stockfish crashed and the app had to close. Everything was
  saved."_ It names what it was doing ("while thinking about its move in your game", "while reviewing a game") and
  offers _Share a report_: app and engine version, phone model and OS, the signal and the FEN, as text through the
  share sheet, never sent by itself. Then the file is removed.
- **A marker without a crash file:** the app was killed for another reason (swiped away, out of memory). Nothing is
  shown, the marker is removed, and work resumes.
- **The crash-loop guard:**
  - **Review / miner / judgement:** the crashed FEN is recorded as failed (`engine_failures`: position key, kind, time,
    from migration 0002) and skipped from then on, so a position cannot crash the app at every start.
  - **Game:** the game screen shows the notice and asks before trying the engine's move again, offering _Try again_ or
    _Take back my last move_.
  - **Analysis board:** it opens the draft without starting the engine on that position until the player asks.

**A hang without a crash:** every wait in the TS client already has a deadline. When one passes, the scheduler sends
`quit` and starts a fresh engine. If `quit` gets no answer within 2 s, the thread cannot be forced to stop inside the
app. The scheduler then goes to `stuck`, every engine feature shows _"Stockfish stopped responding. Close and reopen
the app; your games are saved."_, and nothing more is sent.

Migration 0002 (`engine_failures`) also runs on desktop. Desktop has no use for it yet but shares the schema, so a
backup moves between the apps.

## Risks / Trade-offs

- **Metro and pnpm workspace packages with `.ts` imports may not resolve.** Task 2.1 proves it first. If Metro
  refuses, the libraries switch to extensionless imports (desktop's Vite config would have to allow it too; the
  `desktop-app` notes say Node runs `@chess/core` directly, which needs `.ts`) or a Metro resolver hook maps them.
- **Stockfish's build on the NDK or Xcode needs flags or fails.** The bridge is built and smoke-tested on Android
  before any feature uses it (group 3). The WASM-in-WebView fallback (D6) stays available for iOS.
- **The APK is large because of the embedded net** (98.5 MB per ABI). The release APK carries `arm64-v8a` only
  (every phone of the last years), so about 100 MB; `x86_64` is for the emulator's development builds.
- **The data layer moves out of desktop and something breaks.** It moves first, in small steps, with the desktop's
  tests moving along and its smoke list re-run by the owner before mobile uses it.
- **A signal handler is installed beside Hermes's and React Native's.** It chains: it acts only on the engine thread
  and always re-raises to the previous handler. If chaining misbehaves on a platform, the marker alone still lets
  the next start say "the app closed while Stockfish was thinking", without the certainty of the crash file.
- **A Stockfish crash on a given position recurs.** The `engine_failures` guard keeps background work off that
  position; for a game or the board, the player decides.
- **Weaker phones are slow with the library load and analysis.** The library loads with progress, analysis uses
  fewer threads, and the miner is off by default.
- **iOS installs expire after 7 days.** This is inherent to free Apple IDs. The README says so, and there is nothing
  to engineer around it.
- **Two React versions in one workspace.** Only the shared hooks see both. Their tests run on the club's React, and
  mobile's jest runs them on 19.2.3.

## Migration Plan

Nothing to migrate for players: the desktop schema is unchanged, and its data stays where it is. The order is:

1. The library split, with desktop and the club unchanged.
2. The Expo scaffold.
3. The Stockfish module.
4. The data adapters.
5. The screens.
6. Release tooling.
7. 1.0.0.

The refactor rolls back by revert. A bad mobile release is replaced by the next version.

## Open Questions

None blocking. The owner reviews the D5 navigation on mockups before the screens are built (task 5.1).
