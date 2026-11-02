#!/usr/bin/env bash
# Builds the Android app with plain Gradle: no Expo account, no EAS (mobile-app D4, D11; from SpanishGameApp).
#   scripts/build-android.sh development   → the development build (debug-signed, the dev client), build/development.apk
#   scripts/build-android.sh release       → the release APK (arm64-v8a, the owner's key), build/release.apk
# A release signs with the owner's keystore: CHESS_ANDROID_KEYSTORE (default ~/keys/chess-release.jks),
# CHESS_ANDROID_KEY_ALIAS (default chess), CHESS_ANDROID_KEYSTORE_PASSWORD (asked for when not set, and checked
# against the keystore before the build) and CHESS_ANDROID_KEY_PASSWORD when the key's differs. Run it outside the
# agent sandbox: Gradle writes to /tmp and watches files, which the sandbox blocks. Never run two builds at once: they
# share android/.
set -euo pipefail

profile="${1:-}"
case "$profile" in
  development) task=assembleDebug; artifact=app/build/outputs/apk/debug/app-debug.apk ;;
  release) task=assembleRelease; artifact=app/build/outputs/apk/release/app-release.apk ;;
  *) echo "usage: $0 development|release" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

if [ "$profile" = release ]; then
  export CHESS_ANDROID_KEYSTORE="${CHESS_ANDROID_KEYSTORE:-$HOME/keys/chess-release.jks}"
  export CHESS_ANDROID_KEY_ALIAS="${CHESS_ANDROID_KEY_ALIAS:-chess}"
  if [ -z "${CHESS_ANDROID_KEYSTORE_PASSWORD:-}" ] && [ -t 0 ]; then
    read -rsp "Keystore password ($CHESS_ANDROID_KEYSTORE): " CHESS_ANDROID_KEYSTORE_PASSWORD
    echo
  fi
  export CHESS_ANDROID_KEYSTORE_PASSWORD="${CHESS_ANDROID_KEYSTORE_PASSWORD:-}"
  # A wrong password fails here in a second, not at the end of the build (read from the environment, never argv).
  if [ -f "$CHESS_ANDROID_KEYSTORE" ] && [ -n "$CHESS_ANDROID_KEYSTORE_PASSWORD" ] &&
    ! keytool -list -keystore "$CHESS_ANDROID_KEYSTORE" -alias "$CHESS_ANDROID_KEY_ALIAS" \
      -storepass:env CHESS_ANDROID_KEYSTORE_PASSWORD >/dev/null 2>&1; then
    echo "The keystore password is wrong, or $CHESS_ANDROID_KEYSTORE has no key '$CHESS_ANDROID_KEY_ALIAS'." >&2
    exit 1
  fi
fi

# The whole build's output also goes to build/<profile>.log, to read or hand over when it fails.
mkdir -p build
exec > >(tee "build/$profile.log") 2>&1
node scripts/doctor-android.js >/dev/null || { node scripts/doctor-android.js; exit 1; }

# Gradle reads the app config outside Expo CLI, which normally sets NODE_ENV.
export EXPO_NO_TELEMETRY=1
gradle_args=()
if [ "$profile" = release ]; then
  export NODE_ENV=production CHESS_BUILD_PROFILE=release
  # Before anything is fetched or built: the keystore and its passwords (the plugin names what is missing).
  node -e "try { require('./plugins/with-release-signing').signingFromEnv(process.env) } catch (e) { console.error(e.message); process.exit(1) }"
  # Gradle reads ORG_GRADLE_PROJECT_* as project properties: the passwords never reach a file or the process list.
  export ORG_GRADLE_PROJECT_CHESS_ANDROID_KEYSTORE="$CHESS_ANDROID_KEYSTORE"
  export ORG_GRADLE_PROJECT_CHESS_ANDROID_KEYSTORE_PASSWORD="$CHESS_ANDROID_KEYSTORE_PASSWORD"
  export ORG_GRADLE_PROJECT_CHESS_ANDROID_KEY_ALIAS="$CHESS_ANDROID_KEY_ALIAS"
  export ORG_GRADLE_PROJECT_CHESS_ANDROID_KEY_PASSWORD="${CHESS_ANDROID_KEY_PASSWORD:-$CHESS_ANDROID_KEYSTORE_PASSWORD}"
  # Phones only: the emulator's x86_64 would double the APK (Stockfish and its network are ~100 MB per ABI).
  gradle_args+=(-PreactNativeArchitectures=arm64-v8a)
else
  export NODE_ENV=development
fi

# Stockfish's pinned source and network, compiled in by modules/stockfish (D6); reused when already in place.
node ../../tools/mobile/fetch-stockfish-src.mjs
pnpm exec expo prebuild --platform android --clean --no-install
(cd android && ./gradlew "$task" ${gradle_args[@]+"${gradle_args[@]}"})

cp "android/$artifact" "build/$profile.apk"
echo "Built apps/mobile/build/$profile.apk"
