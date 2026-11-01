## Why

The desktop app (`desktop-app`) brought the club's one-player features offline, but only to a computer. The owner
wants the same app on a phone for themselves and their friends: everything the desktop app does, with no server, no
account and no store listing. It is built with Expo, the same way as the owner's other mobile app (`SpanishGameApp`),
and handed out through GitHub Releases.

## What Changes

For a player:

- A mobile app for **Android** (an APK attached to a GitHub Release, `mobile@1.0.0` first) and **iOS** (an unsigned
  .ipa built on a friend's Mac and sideloaded with a free Apple ID; such an install has to be refreshed every 7 days).
  No account, no login, no server; one local player; everything is stored on the phone.
- The same features as the desktop app, laid out for a phone held upright:
  - **Play the computer:** the five levels and the 5/10/20 s think time, premoves, take-backs, draw offers and a
    request to resign, resign and new game, a PGN of every game, and the game list.
  - **Analyse:** the analysis board on any FEN/PGN or finished game, Stockfish on the phone (MultiPV lines, scores in
    the move tree), the opening name and "In the library".
  - **Review:** automatic review of every finished game.
  - **Studies:** create, edit with variations, import and export PGN.
  - **Trainer and training:** the opening trainer (learn the line first, then test), study lines and training sessions.
  - **Library:** the bundled club library from the first start, PGN import, search, the explorer and the openings.
  - **News:** the feeds and the tournaments being played, fetched while the app is open and online.
  - **Settings and backup:** settings, About, and backup/restore through the phone's share sheet and file picker.
- The board works by tap-tap and by drag. There are no sounds. Links open in the phone's browser.

In the code:

- **A shared local data layer.** The desktop's data layer and UCI client (`apps/desktop/src/lib/data/*`,
  `src/lib/engine.ts`) move into a new library, `libs/chess-local` (`@chess/local`). It sits behind the interfaces
  it already has (`Sql`, `UciChannel`, `FetchText`) plus asset loaders, so the desktop app and the mobile app run the
  same storage, play, review, training and news code. The desktop app keeps only its Tauri adapters and its pages
  (**no behaviour change** for desktop).
- **Shared view state.** The React hooks and view shapes in `@chess/ui`'s `<feature>-model.ts` files contain no
  markup. They move to a new library, `libs/chess-view` (`@chess/view`): React, with no DOM and no `react-dom`. The
  shapes the data layer returns move to `@chess/core`. `@chess/ui` keeps the HTML components, and the club and the
  desktop app are unchanged.
- **A new app, `apps/mobile`.** It uses Expo SDK 57 + Expo Router + React Native 0.86, set up like `SpanishGameApp`:
  dev client, exact pins, `expo-doctor`, jest-expo, and a local Gradle build with no Expo account. It stores data in
  `expo-sqlite` and draws its own board with `react-native-svg` + gesture-handler + Reanimated, using the Cburnett
  pieces and Club colours.
- **Stockfish 19 as a native module.** Stockfish is compiled into the app as a local Expo module
  (`apps/mobile/modules/stockfish`) from the pinned, checksummed `sf_19` source. It is one engine shared by play,
  analysis and the background work.
- **Release:** an Nx Release group `mobile` (tag `mobile@{version}`), `nx run mobile:apk` (a signed release APK),
  `nx run mobile:ipa` (on a Mac), and `tools/mobile/publish.sh`. **No CI.**
- The commit scopes gain `mobile`.

Out of scope: play against people and everything else the desktop app leaves out, store listings (Play Store, App
Store, TestFlight), EAS cloud builds, push notifications, an auto-updater, sync with the desktop app or the club,
tablets and landscape layouts (a tablet gets the phone layout), home-screen widgets, background work while the app is
closed, and any change to `apps/backend`, `apps/engine` or the club's behaviour.

## Capabilities

### New Capabilities

- `mobile-app`: the standalone app for one player on a phone. It covers local data, Stockfish compiled in, every
  feature of the desktop app, and how a phone's lifecycle (backgrounding, a killed app) is handled.
- `mobile-release`: how the app is versioned, built locally (an APK in WSL, an .ipa on a Mac), signed, published to
  GitHub Releases and installed, with its licence.

### Modified Capabilities

- `shared-chess-libraries` (from `desktop-app`): two more libraries, `@chess/local` (the platform-free local data
  layer and UCI client) and `@chess/view` (React state with no DOM), and what each may depend on.

## Impact

- New: `apps/mobile/` (Expo app, `modules/stockfish/` with Kotlin/JNI, Obj-C++ and C++ glue), `libs/chess-local/`,
  `libs/chess-view/`, and `tools/mobile/` (fetch of the Stockfish source, publish script, Android toolchain setup).
- Changed: `apps/desktop/src/lib/` (data + engine move out; adapters stay), `libs/chess-ui` (hooks move out),
  `libs/chess-core` (view shapes move in), `commitlint.config.*` and `openspec/config.yaml` (scope `mobile`),
  `nx.json` (release group `mobile`), `pnpm-workspace.yaml` (Expo's build-script allowances), `.gitignore`
  (`apps/mobile/{android,ios}`, the vendored Stockfish source, keystores), and the CLAUDE.md files.
- New dependencies, all pinned exactly: Expo SDK 57 and its modules (`expo-router`, `expo-sqlite`, `expo-dev-client`,
  `expo-file-system`, `expo-document-picker`, `expo-sharing`, `expo-build-properties`), `react-native`,
  `react-native-svg`, `-gesture-handler`, `-reanimated`, `-worklets`, `-safe-area-context`, `-screens`, `fflate`, and
  `jest-expo` + `@testing-library/react-native`. Toolchain: JDK 17, Android SDK 36 + NDK 27 (as in `SpanishGameApp`),
  and Xcode on the friend's Mac.
- Depends on `desktop-app` being archived first, so that its `shared-chess-libraries` spec exists to change.
- React: React Native 0.86 needs React 19.2.3, while the club and desktop pin 19.2.7. The shared React libraries
  state a peer range both satisfy (design D3).
- **Licence:** Stockfish is linked into the mobile app, so `apps/mobile` is released under GPLv3 (design D10). The
  libraries stay MIT, and the desktop app is unaffected.
