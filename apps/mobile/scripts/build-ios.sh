#!/usr/bin/env bash
# Builds the iOS app on a Mac, unsigned, for whoever installs it with their own free Apple ID (mobile-app D11):
#   scripts/build-ios.sh   → build/Chess-<version>.ipa
# Needs Xcode (with its command line tools selected) and CocoaPods. Nothing here is signed: Xcode, Sideloadly or
# AltStore signs it with the installer's Apple ID (README "Building on a Mac").
set -euo pipefail

if [ "$(uname)" != Darwin ]; then
  echo "build-ios.sh: iOS builds need a Mac with Xcode (this is $(uname))" >&2
  exit 1
fi
for tool in xcodebuild pod; do
  command -v "$tool" >/dev/null || { echo "build-ios.sh: $tool is missing (README \"Building on a Mac\")" >&2; exit 1; }
done

cd "$(dirname "$0")/.."
version="$(node -p "require('./package.json').version")"
mkdir -p build
exec > >(tee build/ios.log) 2>&1

export EXPO_NO_TELEMETRY=1 NODE_ENV=production
# Stockfish's pinned source and network, compiled in by modules/stockfish (D6): CocoaPods takes it from vendor/.
node ../../tools/mobile/fetch-stockfish-src.mjs
pnpm exec expo prebuild --platform ios --clean --no-install
(cd ios && pod install)

archive="build/Chess.xcarchive"
rm -rf "$archive" build/Payload
xcodebuild \
  -workspace ios/Chess.xcworkspace \
  -scheme Chess \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive" \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
  archive

# An .ipa is the app in a Payload folder, zipped.
mkdir -p build/Payload
cp -R "$archive/Products/Applications/Chess.app" build/Payload/
(cd build && rm -f "Chess-$version.ipa" && zip -qry "Chess-$version.ipa" Payload)
rm -rf build/Payload
echo "Built apps/mobile/build/Chess-$version.ipa"
