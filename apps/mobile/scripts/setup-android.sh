#!/usr/bin/env bash
# Installs the Android toolchain for local builds on Ubuntu / WSL2, without Android Studio.
# Safe to re-run: each step is skipped when already done. Verify afterwards with `pnpm doctor:android`.
# From SpanishGameApp (mobile-app task 2.3); the SDK package list is scripts/doctor-android.js's.
set -euo pipefail
cd "$(dirname "$0")/.."

SDK_ROOT="${ANDROID_HOME:-$HOME/Android/Sdk}"
CMDLINE_TOOLS_ZIP="commandlinetools-linux-16111833_latest.zip"
CMDLINE_TOOLS_SHA1="e025545c62a8e64c7559119566a569fb1dec5f60"
# Single source of truth for the SDK packages: the doctor check that verifies them.
mapfile -t PACKAGES < <(node -e "console.log(require('./scripts/doctor-android.js').REQUIRED_SDK_PACKAGES.join('\\n'))")
[ "${#PACKAGES[@]}" -gt 0 ] || { echo "Could not read the SDK package list (is Node installed?)" >&2; exit 1; }

echo "==> JDK 17 and unzip (apt, needs sudo)"
if ! dpkg -s openjdk-17-jdk-headless unzip >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y openjdk-17-jdk-headless unzip
fi
# Take JAVA_HOME from the JDK 17 package itself, not whichever javac is first on the PATH.
JAVA_HOME_DIR="$(dirname "$(dirname "$(readlink -f "$(dpkg -L openjdk-17-jdk-headless | grep -m1 '/bin/javac$')")")")"

echo "==> Android command-line tools in $SDK_ROOT"
SDKMANAGER="$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$SDKMANAGER" ]; then
  tmp="$(mktemp -d)"
  curl -fL "https://dl.google.com/android/repository/$CMDLINE_TOOLS_ZIP" -o "$tmp/tools.zip"
  echo "$CMDLINE_TOOLS_SHA1  $tmp/tools.zip" | sha1sum -c -
  mkdir -p "$SDK_ROOT/cmdline-tools"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mv "$tmp/cmdline-tools" "$SDK_ROOT/cmdline-tools/latest"
  rm -r "$tmp"
fi

echo "==> SDK packages: ${PACKAGES[*]}"
export JAVA_HOME="$JAVA_HOME_DIR"
ANDROID_CLI="$SDK_ROOT/cmdline-tools/latest/bin/android"
if [ -x "$ANDROID_CLI" ]; then
  # Command-line tools 16111833+ replace sdkmanager with the Android CLI, which names packages
  # with '/' instead of ';'.
  "$ANDROID_CLI" --sdk="$SDK_ROOT" sdk install "${PACKAGES[@]//;//}"
else
  # `yes` exits early once sdkmanager stops reading, so don't let pipefail treat that as failure.
  yes | "$SDKMANAGER" --sdk_root="$SDK_ROOT" --licenses || true
  "$SDKMANAGER" --sdk_root="$SDK_ROOT" "${PACKAGES[@]}"
fi

cat <<EOF

Done. Add these lines to ~/.zshrc (this script does not edit your shell files), then open a new
shell and run: pnpm doctor:android (in apps/mobile)

export JAVA_HOME="$JAVA_HOME_DIR"
export ANDROID_HOME="$SDK_ROOT"
export PATH="\$PATH:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/cmdline-tools/latest/bin"
EOF
