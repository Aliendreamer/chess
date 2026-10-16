#!/usr/bin/env bash
# Puts this machine's desktop installers on the GitHub Release desktop@<version> (desktop-release):
#
#   tools/desktop/publish.sh <version> [--dry-run]
#
# Run after `nx release version <version> --projects desktop` (tag pushed) and `nx run desktop:bundle`, once on each
# machine: the first run creates the release with the version's changelog section as notes, the second adds its files.
# Only installers of <version> found under the Tauri bundle folder are uploaded. --dry-run prints the gh commands.
# Releasing and publishing are the owner's to run; nothing here runs in CI.
set -euo pipefail
cd "$(dirname "$0")/../.."

version="${1:?usage: tools/desktop/publish.sh <version> [--dry-run]}"
dry=0
[[ "${2:-}" == "--dry-run" ]] && dry=1
tag="desktop@${version}"
bundle="${BUNDLE_DIR:-apps/desktop/src-tauri/target/release/bundle}"

shopt -s nullglob
files=(
  "$bundle"/appimage/*_"${version}"_*.AppImage
  "$bundle"/deb/*_"${version}"_*.deb
  "$bundle"/nsis/*_"${version}"_*-setup.exe
  "$bundle"/msi/*_"${version}"_*.msi
)
if [[ ${#files[@]} -eq 0 ]]; then
  echo "publish: no installers of ${version} under ${bundle}; run nx run desktop:bundle first" >&2
  exit 1
fi

# gh would create a missing tag from the default branch's head: the release must be the tagged commit.
if ! git ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null; then
  echo "publish: the tag ${tag} is not on origin; push it first (git push origin ${tag})" >&2
  exit 1
fi

notes="$(mktemp)"
trap 'rm -f "$notes"' EXIT
# The version's section of the changelog: from its heading to the next one.
awk -v v="$version" '
  /^#+ / { if (inside) exit; if (index($0, v) > 0) { inside = 1; next } }
  inside { print }
' apps/desktop/CHANGELOG.md >"$notes"
[[ -s "$notes" ]] || echo "Chess desktop ${version}." >"$notes"

run() {
  if [[ $dry -eq 1 ]]; then printf '%q ' "$@"; echo; else "$@"; fi
}

if gh release view "$tag" >/dev/null 2>&1; then
  run gh release upload "$tag" "${files[@]}" --clobber
else
  run gh release create "$tag" "${files[@]}" --verify-tag --title "Chess desktop ${version}" --notes-file "$notes"
fi
