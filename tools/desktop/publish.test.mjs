// node --test tools/desktop/publish.test.mjs — publish.sh against stub `gh` and `git` (no network, no GitHub).
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./publish.sh", import.meta.url));

/** A bin folder with `gh` (the release exists or not) and `git` (the tag pushed or not), and a bundle folder. */
function setup({ released, pushed, installers = true, mac = false }) {
  const dir = mkdtempSync(join(tmpdir(), "publish-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh\n[ "$2" = view ] && exit ${released ? 0 : 1}\necho "gh $*"\n`,
  );
  writeFileSync(join(bin, "git"), `#!/bin/sh\nexit ${pushed ? 0 : 2}\n`);
  chmodSync(join(bin, "gh"), 0o755);
  chmodSync(join(bin, "git"), 0o755);
  const bundle = join(dir, "bundle");
  for (const sub of ["appimage", "deb"])
    mkdirSync(join(bundle, sub), { recursive: true });
  if (installers) {
    writeFileSync(join(bundle, "appimage", "Chess_1.2.0_amd64.AppImage"), "");
    writeFileSync(join(bundle, "deb", "Chess_1.2.0_amd64.deb"), "");
    writeFileSync(join(bundle, "deb", "Chess_1.1.0_amd64.deb"), ""); // another version: never uploaded
  }
  // A Mac builds `--target universal-apple-darwin`, so its bundle folder is under that target.
  const universal = join(dir, "universal");
  mkdirSync(join(universal, "dmg"), { recursive: true });
  if (mac)
    writeFileSync(join(universal, "dmg", "Chess_1.2.0_universal.dmg"), "");
  return {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      BUNDLE_DIR: bundle,
      UNIVERSAL_BUNDLE_DIR: universal,
    },
  };
}

const run = (s, ...args) =>
  spawnSync("bash", [script, ...args], { encoding: "utf8", env: s.env });

test(
  "a new release is created from the pushed tag with this version’s installers",
  { skip: process.platform === "win32" },
  () => {
    const r = run(
      setup({ released: false, pushed: true }),
      "1.2.0",
      "--dry-run",
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      r.stdout,
      /^gh release create desktop@1\.2\.0 .*Chess_1\.2\.0_amd64\.AppImage .*Chess_1\.2\.0_amd64\.deb --verify-tag/m,
    );
    assert.doesNotMatch(r.stdout, /1\.1\.0/);
  },
);

test(
  "an existing release gets this machine’s files added",
  { skip: process.platform === "win32" },
  () => {
    const r = run(
      setup({ released: true, pushed: true }),
      "1.2.0",
      "--dry-run",
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^gh release upload desktop@1\.2\.0 .* --clobber/m);
  },
);

test(
  "nothing is published without the pushed tag or without installers",
  { skip: process.platform === "win32" },
  () => {
    const unpushed = run(
      setup({ released: false, pushed: false }),
      "1.2.0",
      "--dry-run",
    );
    assert.equal(unpushed.status, 1);
    assert.match(unpushed.stderr, /not on origin/);
    const empty = run(
      setup({ released: false, pushed: true, installers: false }),
      "1.2.0",
      "--dry-run",
    );
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /no installers/);
  },
);

test(
  "a Mac uploads its universal disk image",
  { skip: process.platform === "win32" },
  () => {
    const r = run(
      setup({ released: true, pushed: true, installers: false, mac: true }),
      "1.2.0",
      "--dry-run",
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(
      r.stdout,
      /^gh release upload desktop@1\.2\.0 \S*Chess_1\.2\.0_universal\.dmg --clobber/m,
    );
  },
);
