// node --test tools/desktop/ — the fetch refuses an archive that is not the pinned one, and installs one that is.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(new URL("./fetch-stockfish.mjs", import.meta.url));
const target = "x86_64-unknown-linux-gnu";

/** A fake release archive with an engine and its licence, and a manifest pinning `sha256` (the right one by default). */
function fixture(sha256) {
  const dir = mkdtempSync(join(tmpdir(), "sf-fixture-"));
  mkdirSync(join(dir, "src", "stockfish"), { recursive: true });
  writeFileSync(
    join(dir, "src", "stockfish", "stockfish-linux-x86-64-universal"),
    "#!/bin/sh\necho fake\n",
  );
  writeFileSync(
    join(dir, "src", "stockfish", "Copying.txt"),
    "GNU GENERAL PUBLIC LICENSE Version 3\n",
  );
  execFileSync("tar", [
    "-czf",
    join(dir, "sf.tar.gz"),
    "-C",
    join(dir, "src"),
    "stockfish",
  ]);
  const real = createHash("sha256")
    .update(readFileSync(join(dir, "sf.tar.gz")))
    .digest("hex");
  const manifest = {
    tag: "sf_test",
    source: "https://example.org/src",
    sourceArchive: "https://example.org/src.tar.gz",
    targets: {
      [target]: {
        url: "sf.tar.gz",
        sha256: sha256 ?? real,
        binary: "stockfish/stockfish-linux-x86-64-universal",
      },
    },
  };
  writeFileSync(join(dir, "stockfish.json"), JSON.stringify(manifest));
  return { dir, out: join(dir, "out") };
}

const run = ({ dir, out }) =>
  spawnSync(
    process.execPath,
    [
      script,
      "--target",
      target,
      "--manifest",
      join(dir, "stockfish.json"),
      "--out",
      out,
    ],
    {
      encoding: "utf8",
    },
  );

test(
  "a wrong hash fails and leaves no binary",
  { skip: process.platform === "win32" },
  () => {
    const f = fixture("0".repeat(64));
    const result = run(f);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /SHA-256 mismatch/);
    assert.equal(existsSync(join(f.out, `stockfish-${target}`)), false);
  },
);

test(
  "the pinned archive installs the engine, its licence and the source notice",
  { skip: process.platform === "win32" },
  () => {
    const f = fixture();
    const result = run(f);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      readFileSync(join(f.out, `stockfish-${target}`), "utf8"),
      /echo fake/,
    );
    assert.match(
      readFileSync(join(f.out, "Copying.txt"), "utf8"),
      /GENERAL PUBLIC LICENSE/,
    );
    assert.match(
      readFileSync(join(f.out, "SOURCE.txt"), "utf8"),
      /Corresponding source: https:\/\/example.org\/src/,
    );
    // A second run finds it in place.
    assert.match(run(f).stdout, /is in place/);
  },
);

test("every Mac target is pinned to the one universal macOS build", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("./stockfish.json", import.meta.url), "utf8"),
  );
  const mac = [
    "aarch64-apple-darwin",
    "x86_64-apple-darwin",
    "universal-apple-darwin",
  ].map((t) => manifest.targets[t]);
  for (const pin of mac) {
    assert.match(
      pin?.url ?? "",
      /\/sf_19\/stockfish-macos-universal\.tar\.gz$/,
    );
    assert.equal(pin.binary, "stockfish/stockfish-macos-universal");
  }
  assert.equal(new Set(mac.map((p) => p.sha256)).size, 1);
});
