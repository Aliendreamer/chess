#!/usr/bin/env bash
# Builds the Android app with plain Gradle: no Expo account, no EAS (mobile-app D4, D11; from SpanishGameApp).
#   scripts/build-android.sh development   → the development build (debug-signed, the dev client), build/development.apk
# The signed release APK (`release`) comes with mobile-app task 6.2. Run it outside the agent sandbox: Gradle writes to
# /tmp and watches files, which the sandbox blocks. Never run two builds at once: they share android/.
set -euo pipefail

profile="${1:-}"
case "$profile" in
  development) task=assembleDebug; artifact=app/build/outputs/apk/debug/app-debug.apk ;;
  *) echo "usage: $0 development" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."
node scripts/doctor-android.js >/dev/null || { node scripts/doctor-android.js; exit 1; }

# Gradle reads the app config outside Expo CLI, which normally sets NODE_ENV.
export NODE_ENV=development
export EXPO_NO_TELEMETRY=1

pnpm exec expo prebuild --platform android --clean --no-install
(cd android && ./gradlew "$task")

mkdir -p build
cp "android/$artifact" "build/$profile.apk"
echo "Built apps/mobile/build/$profile.apk"
