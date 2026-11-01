// node --test tools/mobile/ — the fetch refuses a source or a network that is not the pinned one, and writes nothing.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const script = fileURLToPath(
  new URL("./fetch-stockfish-src.mjs", import.meta.url),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** A fake source archive (src/, Copying.txt, AUTHORS) and network, pinned right unless told otherwise. */
function fixture({ sourceSha, netSha } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sf-src-fixture-"));
  const root = join(dir, "tree", "Stockfish-sf_test");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "main.cpp"), "int main() { return 0; }\n");
  writeFileSync(
    join(root, "Copying.txt"),
    "GNU GENERAL PUBLIC LICENSE Version 3\n",
  );
  writeFileSync(join(root, "AUTHORS"), "The Stockfish authors\n");
  execFileSync("tar", [
    "-czf",
    join(dir, "src.tar.gz"),
    "-C",
    join(dir, "tree"),
    "Stockfish-sf_test",
  ]);
  writeFileSync(join(dir, "nn-test.nnue"), "a network");
  const manifest = {
    tag: "sf_test",
    source: {
      url: "src.tar.gz",
      sha256: sourceSha ?? sha(readFileSync(join(dir, "src.tar.gz"))),
      root: "Stockfish-sf_test",
    },
    networks: [
      {
        name: "nn-test.nnue",
        url: "nn-test.nnue",
        sha256: netSha ?? sha(readFileSync(join(dir, "nn-test.nnue"))),
      },
    ],
  };
  writeFileSync(join(dir, "stockfish.json"), JSON.stringify(manifest));
  return { dir, out: join(dir, "vendor") };
}

const run = ({ dir, out }) =>
  spawnSync(
    process.execPath,
    [script, "--manifest", join(dir, "stockfish.json"), "--out", out],
    { encoding: "utf8" },
  );

test("refuses a source archive that is not the pinned one, writing nothing", () => {
  const f = fixture({ sourceSha: "0".repeat(64) });
  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 mismatch for src\.tar\.gz/);
  assert.equal(existsSync(f.out), false);
});

test("refuses a network that is not the pinned one, writing nothing", () => {
  const f = fixture({ netSha: "0".repeat(64) });
  const result = run(f);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA-256 mismatch for nn-test\.nnue/);
  assert.equal(existsSync(f.out), false);
});

test("puts the source, the network, the licence and a source notice in place, then reuses them", () => {
  const f = fixture();
  const first = run(f);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(
    readFileSync(join(f.out, "src", "main.cpp"), "utf8"),
    "int main() { return 0; }\n",
  );
  assert.equal(
    readFileSync(join(f.out, "src", "nn-test.nnue"), "utf8"),
    "a network",
  );
  assert.match(
    readFileSync(join(f.out, "Copying.txt"), "utf8"),
    /GENERAL PUBLIC LICENSE/,
  );
  assert.match(
    readFileSync(join(f.out, "SOURCE.txt"), "utf8"),
    /sf_test, unmodified/,
  );
  assert.deepEqual(readdirSync(f.out).sort(), [
    "AUTHORS",
    "Copying.txt",
    "SOURCE.txt",
    "src",
    "stockfish.sha256",
  ]);
  const again = run(f);
  assert.equal(again.status, 0);
  assert.match(again.stdout, /in place/);
});
