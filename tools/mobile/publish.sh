#!/usr/bin/env bash
# Puts the phone app on the GitHub Release mobile@<version> (mobile-app D11):
#
#   tools/mobile/publish.sh <version> [--dry-run]
#
# Run after `nx release version <version> --projects mobile` (tag pushed) and `nx run mobile:apk-release`; on a Mac,
# after `nx run mobile:ipa`, the same command adds the .ipa. The first run creates the release with the version's
# changelog section as notes, a later one adds its files. The APK is published as Chess-<version>.apk.
# --dry-run prints the gh commands. Releasing and publishing are the owner's to run; nothing here runs in CI.
set -euo pipefail
cd "$(dirname "$0")/../.."

version="${1:?usage: tools/mobile/publish.sh <version> [--dry-run]}"
dry=0
[[ "${2:-}" == "--dry-run" ]] && dry=1
tag="mobile@${version}"
build="${BUILD_DIR:-apps/mobile/build}"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

files=()
# build/release.apk is the last release build; it is published under the version's name.
if [[ -f "$build/release.apk" ]]; then
  cp "$build/release.apk" "$work/Chess-${version}.apk"
  files+=("$work/Chess-${version}.apk")
fi
[[ -f "$build/Chess-${version}.ipa" ]] && files+=("$build/Chess-${version}.ipa")
if [[ ${#files[@]} -eq 0 ]]; then
  echo "publish: nothing to publish under ${build}; run nx run mobile:apk-release (or mobile:ipa on a Mac) first" >&2
  exit 1
fi

# gh would create a missing tag from the default branch's head: the release must be the tagged commit.
if ! git ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null; then
  echo "publish: the tag ${tag} is not on origin; push it first (git push origin ${tag})" >&2
  exit 1
fi

notes="$work/notes.md"
# The version's section of the changelog: from its heading to the next one.
if [[ -f apps/mobile/CHANGELOG.md ]]; then
  awk -v v="$version" '
    /^#+ / { if (inside) exit; if (index($0, v) > 0) { inside = 1; next } }
    inside { print }
  ' apps/mobile/CHANGELOG.md >"$notes"
fi
[[ -s "$notes" ]] || echo "Chess for phones ${version}." >"$notes"

run() {
  if [[ $dry -eq 1 ]]; then printf '%q ' "$@"; echo; else "$@"; fi
}

if gh release view "$tag" >/dev/null 2>&1; then
  run gh release upload "$tag" "${files[@]}" --clobber
else
  run gh release create "$tag" "${files[@]}" --verify-tag --title "Chess for phones ${version}" --notes-file "$notes"
fi
