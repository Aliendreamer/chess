# Chess for phones (chess-mobile)

The standalone chess app for one player, on Android and iOS: play the computer, analyse, review, study, train, browse
the library and read the news, with no account and no server. Everything is stored on the phone. It is the desktop
app's twin (OpenSpec `mobile-app`), built with Expo; see `CLAUDE.md` here for how it is put together.

## Building

- **Android** (WSL or Linux): `apps/mobile/scripts/setup-android.sh` once, then `pnpm exec nx run mobile:apk`. The
  build downloads the pinned Stockfish source and network the first time (about 100 MB).
- **iOS** needs a Mac; see "Building on a Mac" (task 6.3).

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
