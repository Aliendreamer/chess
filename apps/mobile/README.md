# Chess for phones (chess-mobile)

The standalone chess app for one player, on Android and iOS: play the computer, analyse, review, study, train, browse
the library and read the news, with no account and no server. Everything is stored on the phone. It is the desktop
app's twin (OpenSpec `mobile-app`), built with Expo; see `CLAUDE.md` here for how it is put together.

## Building

- **Android** (WSL or Linux): `apps/mobile/scripts/setup-android.sh` once, then `pnpm exec nx run mobile:apk`. The
  build downloads the pinned Stockfish source and network the first time (about 100 MB).
- **iOS** needs a Mac: see "Building on a Mac" below.

## The release APK and its keystore

The release APK is signed with the owner's own key (mobile-app D11). Make the keystore once, outside the repository:

```bash
keytool -genkeypair -v -keystore ~/keys/chess-release.jks -alias chess -keyalg RSA -keysize 4096 -validity 36500
```

**Back it up** (and its password) somewhere safe: an update must be signed with the same key, so losing it means
every friend has to uninstall the app, and lose its data, to install the next version. Then:

```bash
export CHESS_ANDROID_KEYSTORE=~/keys/chess-release.jks CHESS_ANDROID_KEY_ALIAS=chess
read -rs CHESS_ANDROID_KEYSTORE_PASSWORD && export CHESS_ANDROID_KEYSTORE_PASSWORD
pnpm exec nx run mobile:apk-release        # build/release.apk, arm64-v8a only
apksigner verify --print-certs apps/mobile/build/release.apk   # names your certificate, not "Android Debug"
```

`CHESS_ANDROID_KEY_PASSWORD` is needed only when the key's password differs from the keystore's. Without the
variables the build stops at once and names the one missing.

## Licence

This app is free software under the **GNU General Public License, version 3 or later** (`LICENSE`). It contains
Stockfish 19 (https://stockfishchess.org), compiled into the app from its unmodified source, which is GPLv3; a program
that links it is a work based on it, so the app as a whole is GPLv3 too (mobile-app D10). Stockfish's licence and
authors are in `modules/stockfish/COPYING-stockfish.txt` and `modules/stockfish/AUTHORS-stockfish`; its source is
https://github.com/official-stockfish/Stockfish/tree/sf_19, and the exact archive and network are pinned in
`tools/mobile/stockfish.json`.

The source of every release is this repository at the tag `mobile@<version>`. The shared libraries in `libs/` are MIT
(each has its `LICENSE`); MIT code may be part of a GPL program. The bundled library's broadcast games are CC BY-SA 4.0
(lichess), credited in the app's About and on each game.

## Smoke list (before each release, on an Android phone)

Install the APK (`adb install -r apps/mobile/build/<profile>.apk`, or open it on the phone). With the network **off**:

1. First start: the splash, then Play; "Preparing the library … n %" runs along the top and goes when it is done.
   News says it has nothing yet.
2. Play Casual with 5 s as White: one move by tapping the piece and its square, one by dragging; the engine answers
   and the move slides in. While it thinks, tap a piece and a square: the premove is tinted and played after its
   answer. Promote a pawn (the picker), flip the board, take a move back, offer a draw (declined).
3. Switch to another app mid-game and back after a minute: the engine answers again if it was its turn. Close the
   app from the recent apps and start it: the game is still in play at the same position.
4. Resign (it asks first): "You lost", the review starts and fills its graph; tap a marked move and its better line;
   Save PGN opens the share sheet.
5. Analyse: tap Library, import a PGN file from the phone (the picker), search a player, open a game; the bar and
   the lines show, "In the library" opens its sheet; step through the game; paste a FEN. Close the app and start it
   again: the board is as it was; Save as study opens the study.
6. Learn → Studies: import a PGN with a broken game (reported by number); edit a study, close the app without saving
   and start it again: the edit is back; Make main line, Delete move, Save, Save PGN.
7. Learn → Trainer: a family's new line opens in Learn and is played through; switch to Test, a wrong move is named,
   Hint draws its arrow; As Black. Train a study's lines. Learn → Training: Master games, a position answered, Finish.
8. More → Settings: Parchment and another board theme apply at once and are kept after a restart; coordinates off;
   animation off (and the system's "remove animations" also stops the slides). The miner is off; switch it on.
9. More → Backup: Back up to the share sheet (save it to Files); add a study; Restore that file (it asks first): the
   study added after is gone. A desktop `.chessbackup` restores too.
10. More → About: version, GPLv3, the source link opens github.com in the browser at `mobile@<version>`.
11. Development build only: Play → Engine check: a move within 2 s; Crash test closes the app, and the next start says
    Stockfish crashed.
12. TalkBack on: the tabs, a game's buttons and the board's squares ("e2, white pawn") are read; double-tap a piece
    and a square plays the move.

With the network **on**: News fills within a minute or so of the start; a headline opens in the browser, not the app;
the tournaments show under "Events now".

## Building on a Mac

For whoever builds the iPhone version (mobile-app D11). No paid Apple account is needed; the app is built unsigned and
signed on install with the installer's own free Apple ID.

1. Install Node 24 and run `corepack enable`; Xcode from the App Store (open it once, and select its command line
   tools: `sudo xcode-select -s /Applications/Xcode.app`); CocoaPods (`brew install cocoapods`).
2. Clone the repository, check out the release (`git checkout mobile@<version>`), and run `pnpm install`.
3. `pnpm exec nx run mobile:ipa`. It downloads the pinned Stockfish source and network the first time (about 100 MB),
   then builds `apps/mobile/build/Chess-<version>.ipa`; the log is `apps/mobile/build/ios.log`.
4. Hand the .ipa to the owner, or with push rights run `gh release upload mobile@<version>
apps/mobile/build/Chess-<version>.ipa`.

Installing it, either way:

- **From Xcode, on your own iPhone:** after step 3, open `apps/mobile/ios/Chess.xcworkspace`, choose the Chess target →
  Signing & Capabilities → Team: your Apple ID ("Personal Team"), plug the phone in and press Run. On the phone, allow
  it under Settings → General → VPN & Device Management, and turn on Developer Mode (iOS 16 and later) when asked.
- **The .ipa, on anyone's iPhone:** install it with [Sideloadly](https://sideloadly.io) or
  [AltStore](https://altstore.io), signed with that person's own Apple ID.

A free Apple ID's install runs for **7 days**; install it again to renew it (the app's data stays). A free ID may have
at most 3 such apps on a phone at once.
