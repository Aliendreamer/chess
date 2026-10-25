#!/usr/bin/env node
// Writes the club's game library as the desktop app's bundled library (desktop-app D12):
//
//   node tools/desktop/export-library.mjs [--container <name>] [--out <file>]
//
// Reads the club's Postgres (the local stack's `postgres` container, default chess-postgres-1, through `docker exec
// psql`): every library game but the e2e suite's (moves and factual headers, with their source and licence), every
// training candidate the club's Stockfish has judged (so the desktop miner never asks them again) and the critical
// positions it kept. Each game carries the key of every position it reaches, computed here with @chess/core's
// `prepareImport` (Node runs its TypeScript), so the app stores them without replaying 270,000 moves on its first start.
// Writes one gzipped JSON file, apps/desktop/library/library.json.gz by default, which the app loads once per version.
// Run it again after an import on the club; commit the file.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .flatMap((a, i, all) =>
      a.startsWith("--") ? [[a.slice(2), all[i + 1]]] : [],
    ),
);
const container = args.container ?? "chess-postgres-1";
const out = resolve(
  args.out ?? join(here, "../../apps/desktop/library/library.json.gz"),
);

// One JSON document, built by Postgres; ordered so the same library gives the same bytes.
const query = `
WITH games AS (SELECT * FROM library_games WHERE "Source" <> 'E2E')
SELECT json_build_object(
  'format', 1,
  'games', (SELECT coalesce(json_agg(json_build_object(
      'id', "Id", 'white', "White", 'black', "Black", 'event', "Event", 'site', "Site", 'round', "Round",
      'date', "DateText", 'result', "Result", 'eco', "Eco", 'moves', array_to_string("MovesUci", ' '),
      'source', "Source", 'licence', "Licence", 'sourceRef', "SourceRef") ORDER BY "Id"), '[]') FROM games),
  'candidates', (SELECT coalesce(json_agg(json_build_object(
      'key', c."PositionKey", 'gameId', c."LibraryGameId", 'ply', c."Ply", 'fen', c."Fen", 'next', c."MasterUci",
      'critical', c."Status" = 'critical', 'judgedAt', c."JudgedAt") ORDER BY c."PositionKey"), '[]')
    FROM training_candidates c JOIN games g ON g."Id" = c."LibraryGameId" WHERE c."JudgedAt" IS NOT NULL),
  'positions', (SELECT coalesce(json_agg(json_build_object(
      'id', p."Id", 'key', p."PositionKey", 'fen', p."Fen", 'master', p."MasterUci", 'accepted', p."AcceptedUci",
      'line', p."BestLine", 'gap', p."Gap", 'phase', p."Phase", 'eco', p."Eco", 'opening', p."OpeningName",
      'white', p."White", 'black', p."Black", 'event', p."Event", 'year', p."Year", 'gameId', p."LibraryGameId",
      'ply', p."Ply", 'createdAt', p."CreatedAt") ORDER BY p."Id"), '[]')
    FROM training_positions p JOIN games g ON g."Id" = p."LibraryGameId")
)`;

let text;
try {
  text = execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "chess",
      "-d",
      "chess",
      "-At",
      "-c",
      query,
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  ).trim();
} catch (e) {
  console.error(
    `Could not read the club's library from ${container} (is the stack's postgres up?): ${e.message}`,
  );
  process.exit(1);
}
const library = JSON.parse(text);
const { prepareImport } = await import(
  join(here, "../../libs/chess-core/src/index.ts")
);
const refused = [];
library.games = library.games.flatMap((g) => {
  const prepared = prepareImport(
    { ...g, moves: g.moves.split(" "), startFen: null },
    g,
    new Map(),
    g.id,
  );
  if (!prepared.ok) {
    refused.push(`${g.id}: ${prepared.error}`);
    return [];
  }
  return [{ ...g, keys: prepared.positions.map((p) => p.positionKey) }];
});
for (const r of refused) console.warn(`left out ${r}`);
const json = Buffer.from(JSON.stringify(library));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gzipSync(json, { level: 9 }));
const bySource = Object.entries(
  library.games.reduce(
    (n, g) => ({ ...n, [g.source]: (n[g.source] ?? 0) + 1 }),
    {},
  ),
)
  .map(([s, n]) => `${n} ${s}`)
  .join(", ");
console.log(
  `${out}: ${library.games.length} games (${bySource}), ${library.candidates.length} judged positions, ` +
    `${library.positions.length} training positions; ${json.length} bytes, gzipped to ${gzipSync(json, { level: 9 }).length}`,
);
