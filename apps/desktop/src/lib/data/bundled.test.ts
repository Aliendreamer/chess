// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { gunzipSync, gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { positionKey, prepareImport } from '@chess/core'
import { openDb } from './db'
import { ensureBundledLibrary } from './bundled'
import { importLibrary } from './library'
import { nextTraining } from './training'
import type { BundledGame, BundledLibrary } from './bundled'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

const GAME_ID = '01a0ffeb-60c1-7043-9719-0577727daa57'
const POSITION_ID = '0072cc83-2f76-43b3-9c33-9bcf8075ba49'
// After 1. e4 e5 2. Nf3: Black to move, the position the club's Stockfish judged and kept.
const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2'
const KEY = positionKey(FEN)
const QUIET_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2'

const LIBRARY = {
  format: 1,
  games: [
    {
      id: GAME_ID,
      white: 'Carlsen, Magnus',
      black: 'Caruana, Fabiano',
      event: 'WCh 2018',
      site: 'London ENG',
      round: '1',
      date: '2018.11.09',
      result: '1/2-1/2',
      eco: null,
      moves: 'e2e4 e7e5 g1f3 b8c6',
      source: 'PGN Mentor',
      licence: 'moves only (facts)',
      sourceRef: null,
    },
    {
      id: '01a10be8-a433-7e7b-8494-df0378a274d6',
      white: 'Broken, Game',
      black: 'Illegal, Move',
      event: null,
      site: null,
      round: null,
      date: '2026.08.01',
      result: '1-0',
      eco: null,
      moves: 'e2e4 e2e4',
      source: 'lichess broadcasts',
      licence: 'CC BY-SA 4.0',
      sourceRef: 'https://lichess.org/broadcast/x/y/abc',
    },
  ],
  candidates: [
    {
      key: KEY,
      gameId: GAME_ID,
      ply: 3,
      fen: FEN,
      next: 'b8c6',
      critical: true,
      judgedAt: '2026-10-10T10:08:20Z',
    },
    {
      key: positionKey(QUIET_FEN),
      gameId: GAME_ID,
      ply: 2,
      fen: QUIET_FEN,
      next: 'g1f3',
      critical: false,
      judgedAt: '2026-10-10T10:08:20Z',
    },
  ],
  positions: [
    {
      id: POSITION_ID,
      key: KEY,
      fen: FEN,
      master: 'b8c6',
      accepted: ['b8c6', 'd7d6'],
      line: ['b8c6', 'f1b5'],
      gap: 0.4,
      phase: 'middlegame',
      eco: 'C44',
      opening: "King's Pawn Game",
      white: 'Carlsen, Magnus',
      black: 'Caruana, Fabiano',
      event: 'WCh 2018',
      year: 2018,
      gameId: GAME_ID,
      ply: 3,
      createdAt: '2026-10-10T10:08:20Z',
    },
  ],
} satisfies Omit<BundledLibrary, 'games'> & { games: Array<Omit<BundledGame, 'keys'>> }
/** The file as the export writes it: each game with its position keys (none for an illegal one). */
const file =
  (library: Omit<BundledLibrary, 'games'> & { games: Array<Omit<BundledGame, 'keys'>> }) => () => {
    const games = library.games.map((g) => {
      const p = prepareImport(
        { ...g, moves: g.moves.split(' '), startFen: null },
        g,
        new Map(),
        g.id,
      )
      return { ...g, keys: p.ok ? p.positions.map((x) => x.positionKey) : [] }
    })
    return Promise.resolve(new Uint8Array(gzipSync(JSON.stringify({ ...library, games }))))
  }
const count = async (d: Awaited<ReturnType<typeof testDb>>, table: string) =>
  (await d.select<{ n: number }>(`SELECT count(*) AS n FROM ${table}`))[0]!.n

describe('the bundled library (desktop-app D12)', () => {
  it('is loaded on the first start, and not again while it is the same', async () => {
    const d = await testDb()
    expect(await ensureBundledLibrary(d, file(LIBRARY))).toEqual({ state: 'loaded', games: 1 })
    expect(await ensureBundledLibrary(d, file(LIBRARY))).toEqual({ state: 'current', games: 0 })
    expect(await count(d, 'library_games')).toBe(1)
    expect(await count(d, 'library_positions')).toBe(5)
    expect(await count(d, 'training_candidates')).toBe(2)
    expect(await count(d, 'training_positions')).toBe(1)
  })

  it('takes the file already unzipped, as the development server hands it over', async () => {
    const d = await testDb()
    const unzipped = async () => new Uint8Array(gunzipSync(await file(LIBRARY)()))
    expect(await ensureBundledLibrary(d, unzipped)).toEqual({ state: 'loaded', games: 1 })
  })

  it('keeps the source, the licence and the link of each game', async () => {
    const d = await testDb()
    await ensureBundledLibrary(d, file(LIBRARY))
    const [game] = await d.select<{ source: string; licence: string; year: number }>(
      'SELECT source, licence, year FROM library_games',
    )
    expect(game).toEqual({ source: 'PGN Mentor', licence: 'moves only (facts)', year: 2018 })
  })

  it('trains the positions the club mined, found by a part of a player’s name', async () => {
    const d = await testDb()
    await ensureBundledLibrary(d, file(LIBRARY))
    const next = await nextTraining(d, 'library', { player: 'magnus' }, [])
    expect(next.pool).toBe(1)
    expect(next.item?.fen).toBe(FEN)
  })

  it('never has the miner ask a judged position again', async () => {
    const d = await testDb()
    await ensureBundledLibrary(d, file(LIBRARY))
    const judged = await d.select<{ critical: number; judged_at: string | null }>(
      'SELECT critical, judged_at FROM training_candidates ORDER BY ply',
    )
    expect(judged.map((c) => c.critical)).toEqual([0, 1])
    expect(judged.every((c) => c.judged_at)).toBe(true)
  })

  it('points the training at the player’s own copy of a game already imported', async () => {
    const d = await testDb()
    await importLibrary(
      d,
      '[White "Carlsen, Magnus"]\n[Black "Caruana, Fabiano"]\n[Date "2018.11.09"]\n[Result "1/2-1/2"]\n\n1. e4 e5 2. Nf3 Nc6 1/2-1/2\n',
      'mine.pgn',
    )
    const [own] = await d.select<{ id: string }>('SELECT id FROM library_games')
    expect(await ensureBundledLibrary(d, file(LIBRARY))).toEqual({ state: 'loaded', games: 0 })
    expect(await count(d, 'library_games')).toBe(1)
    const [position] = await d.select<{ library_game_id: string }>(
      'SELECT library_game_id FROM training_positions',
    )
    expect(position!.library_game_id).toBe(own!.id)
  })

  it('adds what a new version brings and keeps the player’s progress', async () => {
    const d = await testDb()
    await ensureBundledLibrary(d, file(LIBRARY))
    await d.execute(
      'INSERT INTO training_progress (position_id, box, due_at, updated_at) VALUES (?, 3, ?, ?)',
      [POSITION_ID, '2026-11-01T00:00:00Z', '2026-10-25T00:00:00Z'],
    )
    const next = {
      ...LIBRARY,
      games: [
        ...LIBRARY.games,
        {
          ...LIBRARY.games[0]!,
          id: '01a0ffeb-60c1-7043-9719-0577727daa58',
          moves: 'e2e4 e7e5 g1f3 g8f6',
        },
      ],
    }
    expect(await ensureBundledLibrary(d, file(next))).toEqual({ state: 'loaded', games: 1 })
    expect(await count(d, 'library_games')).toBe(2)
    const [progress] = await d.select<{ box: number }>('SELECT box FROM training_progress')
    expect(progress!.box).toBe(3)
  })

  it('bundles the club’s library: the world championships and the broadcasts', async () => {
    const d = await testDb()
    const started = performance.now()
    const shipped = () =>
      readFile(new URL('../../../library/library.json.gz', import.meta.url)).then(
        (b) => new Uint8Array(b),
      )
    const { games } = await ensureBundledLibrary(d, shipped)
    expect(games).toBeGreaterThan(3000)
    const sources = await d.select<{ source: string; licence: string }>(
      'SELECT DISTINCT source, licence FROM library_games ORDER BY source',
    )
    expect(sources).toEqual([
      { source: 'PGN Mentor', licence: 'moves only (facts)' },
      { source: 'lichess broadcasts', licence: 'CC BY-SA 4.0' },
    ])
    expect((await nextTraining(d, 'library', { player: 'magnus' }, [])).pool).toBeGreaterThan(0)
    expect(performance.now() - started).toBeLessThan(30_000)
  }, 60_000)
})
