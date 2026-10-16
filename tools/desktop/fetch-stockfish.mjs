#!/usr/bin/env node
// Puts the pinned Stockfish next to the desktop app as Tauri's sidecar (desktop-app D5):
//
//   node tools/desktop/fetch-stockfish.mjs [--target <triple>] [--manifest <file>] [--out <dir>]
//
// Downloads the release archive for the target (default: this machine's), refuses it unless its SHA-256 is the pinned
// one, and extracts the engine to <out>/stockfish-<triple>[.exe] with its licence (Copying.txt) and SOURCE.txt — the
// GPLv3 notice and where the source is, which the installer ships. A source that is not http(s) is read as a local
// file (the tests use one). Nothing is written on a mismatch. An archive already fetched and checked is reused.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
  args.out ?? join(here, "../../apps/desktop/src-tauri/binaries"),
);
const target = args.target ?? hostTriple();

function hostTriple() {
  if (process.arch !== "x64")
    throw new Error(
      `No pinned Stockfish for ${process.platform}/${process.arch}.`,
    );
  if (process.platform === "linux") return "x86_64-unknown-linux-gnu";
  if (process.platform === "win32") return "x86_64-pc-windows-msvc";
  throw new Error(`No pinned Stockfish for ${process.platform}.`);
}

const fail = (message) => {
  console.error(`fetch-stockfish: ${message}`);
  process.exit(1);
};

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const pin = manifest.targets?.[target];
if (!pin) fail(`no pinned Stockfish for ${target} in ${manifestPath}`);
const exe = target.includes("windows") ? ".exe" : "";
const binary = join(out, `stockfish-${target}${exe}`);
const stamp = join(out, `stockfish-${target}.sha256`);

if (
  existsSync(binary) &&
  existsSync(stamp) &&
  readFileSync(stamp, "utf8").trim() === pin.sha256
) {
  console.log(`fetch-stockfish: ${manifest.tag} for ${target} is in place.`);
  process.exit(0);
}

const archiveName = pin.url.split("/").at(-1);
let bytes;
if (/^https?:\/\//.test(pin.url)) {
  console.log(`fetch-stockfish: downloading ${pin.url}`);
  const response = await fetch(pin.url);
  if (!response.ok) fail(`download failed: HTTP ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
} else {
  bytes = readFileSync(resolve(dirname(manifestPath), pin.url));
}
const digest = createHash("sha256").update(bytes).digest("hex");
if (digest !== pin.sha256)
  fail(
    `SHA-256 mismatch for ${archiveName}: got ${digest}, pinned ${pin.sha256}`,
  );

// tar reads .tar.gz everywhere and .zip on Windows (bsdtar); unzip on Linux for a zip.
const work = mkdtempSync(join(tmpdir(), "stockfish-"));
const archive = join(work, archiveName);
writeFileSync(archive, bytes);
if (archiveName.endsWith(".zip") && process.platform !== "win32")
  execFileSync("unzip", ["-q", archive, "-d", work]);
else execFileSync("tar", ["-xf", archive, "-C", work]);
const extracted = join(work, pin.binary);
if (!existsSync(extracted)) fail(`${pin.binary} is not in ${archiveName}`);

mkdirSync(out, { recursive: true });
copyFileSync(extracted, binary);
chmodSync(binary, 0o755);
const licence = join(dirname(extracted), "Copying.txt");
if (!existsSync(licence))
  fail(`Copying.txt (the GPLv3) is not in ${archiveName}`);
copyFileSync(licence, join(out, "Copying.txt"));
writeFileSync(
  join(out, "SOURCE.txt"),
  [
    `Stockfish ${manifest.tag}, the unmodified official release, licensed under the GNU GPL v3 (Copying.txt).`,
    `Binary: ${pin.url}`,
    `SHA-256: ${pin.sha256}`,
    `Corresponding source: ${manifest.source}`,
    `Source archive: ${manifest.sourceArchive}`,
    "",
  ].join("\n"),
);
writeFileSync(stamp, `${pin.sha256}\n`);
console.log(`fetch-stockfish: ${manifest.tag} for ${target} → ${binary}`);
