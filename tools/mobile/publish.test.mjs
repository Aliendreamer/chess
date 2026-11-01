// node --test tools/mobile/publish.test.mjs — publish.sh against stub `gh` and `git` (no network, no GitHub).
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./publish.sh", import.meta.url));

/**
 * A bin folder with `gh` (the release exists once created) and `git` (the tag pushed or not), and a build folder with
 * the release APK and, when `ipa`, the iPhone's .ipa. `gh` logs each call to a file and whether it saw the APK by its
 * published name.
 */
function setup({ pushed = true, apk = true, ipa = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "publish-mobile-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  const log = join(dir, "gh.log");
  const released = join(dir, "released");
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh
if [ "$2" = view ]; then [ -e "${released}" ]; exit $?; fi
echo "gh $*" >> "${log}"
for a in "$@"; do case "$a" in *.apk|*.ipa) [ -s "$a" ] && echo "file $(basename "$a")" >> "${log}";; esac; done
[ "$2" = create ] && touch "${released}"
exit 0
`,
  );
  writeFileSync(join(bin, "git"), `#!/bin/sh\nexit ${pushed ? 0 : 2}\n`);
  chmodSync(join(bin, "gh"), 0o755);
  chmodSync(join(bin, "git"), 0o755);
  const build = join(dir, "build");
  mkdirSync(build);
  if (apk) writeFileSync(join(build, "release.apk"), "apk");
  if (ipa) writeFileSync(join(build, "Chess-1.0.0.ipa"), "ipa");
  return {
    build,
    log: () => readFileSync(log, "utf8"),
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BUILD_DIR: build },
  };
}

const run = (s, ...args) => spawnSync("bash", [script, ...args], { encoding: "utf8", env: s.env });

test("creates the release from the pushed tag with the APK, then uploads the .ipa to it", { skip: process.platform === "win32" }, () => {
  const s = setup();
  const first = run(s, "1.0.0");
  assert.equal(first.status, 0, first.stderr);
  assert.match(s.log(), /^gh release create mobile@1\.0\.0 \S*Chess-1\.0\.0\.apk --verify-tag --title Chess for phones 1\.0\.0 --notes-file /m);
  assert.match(s.log(), /^file Chess-1\.0\.0\.apk$/m);
  writeFileSync(join(s.build, "Chess-1.0.0.ipa"), "ipa");
  const second = run(s, "1.0.0");
  assert.equal(second.status, 0, second.stderr);
  assert.match(s.log(), /^gh release upload mobile@1\.0\.0 \S*Chess-1\.0\.0\.apk \S*Chess-1\.0\.0\.ipa --clobber$/m);
});

test("refuses when the tag is not on origin", { skip: process.platform === "win32" }, () => {
  const r = run(setup({ pushed: false }), "1.0.0");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /mobile@1\.0\.0 is not on origin/);
});

test("refuses without a release APK or .ipa to put there", { skip: process.platform === "win32" }, () => {
  const r = run(setup({ apk: false }), "1.0.0");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /nx run mobile:apk-release/);
});

test("a dry run prints the gh command and changes nothing", { skip: process.platform === "win32" }, () => {
  const s = setup();
  const r = run(s, "1.0.0", "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^gh release create mobile@1\.0\.0 /m);
  assert.throws(() => s.log());
});
