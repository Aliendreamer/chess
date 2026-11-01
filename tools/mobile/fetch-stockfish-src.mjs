#!/usr/bin/env node
// Puts the pinned Stockfish source where the mobile app's native module compiles it (mobile-app D6):
//
//   node tools/mobile/fetch-stockfish-src.mjs [--manifest <file>] [--out <dir>]
//
// Downloads the source archive and the network(s) it names, refuses any whose SHA-256 is not the pinned one, and only
// then writes <out>/src (the network inside it, where Stockfish's build embeds it), Copying.txt and AUTHORS (the GPLv3
// and its authors, which the app ships) and SOURCE.txt. Nothing is written on a mismatch. A source that is not
// http(s) is read as a local file (the tests use one). Sources already fetched and checked are reused.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((a, i, all) =>
      a.startsWith("--") ? [[a.slice(2), all[i + 1]]] : [],
    ),
);
const manifestPath = resolve(args.manifest ?? join(here, "stockfish.json"));
const out = resolve(
  args.out ?? join(here, "../../apps/mobile/modules/stockfish/vendor"),
);

const fail = (message) => {
  console.error(`fetch-stockfish-src: ${message}`);
  process.exit(1);
};

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const pins = [manifest.source, ...manifest.networks];
const stamp = join(out, "stockfish.sha256");
const expected = pins.map((p) => p.sha256).join("\n");
if (existsSync(stamp) && readFileSync(stamp, "utf8").trim() === expected) {
  console.log(`fetch-stockfish-src: ${manifest.tag} is in place.`);
  process.exit(0);
}

/** The pinned bytes, or the script stops with nothing written. */
async function fetchPinned(pin) {
  const name = pin.url.split("/").at(-1);
  let bytes;
  if (/^https?:\/\//.test(pin.url)) {
    console.log(`fetch-stockfish-src: downloading ${pin.url}`);
    const response = await fetch(pin.url);
    if (!response.ok)
      fail(`download of ${name} failed: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  } else bytes = readFileSync(resolve(dirname(manifestPath), pin.url));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== pin.sha256)
    fail(`SHA-256 mismatch for ${name}: got ${digest}, pinned ${pin.sha256}`);
  return bytes;
}

const source = await fetchPinned(manifest.source);
const networks = [];
for (const network of manifest.networks)
  networks.push([network.name, await fetchPinned(network)]);

// Everything checked: build the folder aside, then put it in place in one rename.
const work = mkdtempSync(join(tmpdir(), "stockfish-src-"));
writeFileSync(join(work, "source.tar.gz"), source);
execFileSync("tar", ["-xzf", join(work, "source.tar.gz"), "-C", work]);
const root = join(work, manifest.source.root);
const staged = join(work, "vendor");
mkdirSync(staged);
cpSync(join(root, "src"), join(staged, "src"), { recursive: true });
for (const file of ["Copying.txt", "AUTHORS"]) {
  if (!existsSync(join(root, file)))
    fail(`${file} is not in the source archive`);
  cpSync(join(root, file), join(staged, file));
}
for (const [name, bytes] of networks)
  writeFileSync(join(staged, "src", name), bytes);
writeFileSync(
  join(staged, "SOURCE.txt"),
  [
    `Stockfish ${manifest.tag}, unmodified, compiled into this app; licensed under the GNU GPL v3 (Copying.txt).`,
    `Source: ${manifest.source.url}`,
    `SHA-256: ${manifest.source.sha256}`,
    ...manifest.networks.map(
      (n) => `Network ${n.name}: ${n.url} (SHA-256 ${n.sha256})`,
    ),
    "",
  ].join("\n"),
);
writeFileSync(join(staged, "stockfish.sha256"), `${expected}\n`);
mkdirSync(dirname(out), { recursive: true });
// An older pin's folder is replaced whole.
rmSync(out, { recursive: true, force: true });
try {
  renameSync(staged, out);
} catch {
  // Across file systems (tmp → the repo): copy instead.
  cpSync(staged, out, { recursive: true });
}
console.log(`fetch-stockfish-src: ${manifest.tag} → ${out}`);
