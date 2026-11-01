import { afterEach, describe, expect, it } from 'vitest'
import { newId, openDb } from './db'
import {
  DRAW_FROM_PLY,
  askToResign,
  createGame,
  engineMove,
  engineToMove,
  gamesInPlay,
  lastPersonPly,
  listGames,
  loadGame,
  offerDraw,
  personMove,
  resign,
  takeBack,
} from './play'
import type { EnginePlayer, PositionJudge } from './play'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  return openDb(sql)
}

/** An engine that plays the given moves in turn and records what it was asked. */
function scripted(
  ...moves: Array<string>
): EnginePlayer & { asked: Array<{ level: string; thinkMs: number }> } {
  const asked: Array<{ level: string; thinkMs: number }> = []
  return {
    asked,
    bestMove: (_fen, level, thinkMs) => {
      asked.push({ level: level.level, thinkMs })
      return Promise.resolve(moves.shift() ?? null)
    },
  }
}

describe('a game against the computer (desktop-app D6)', () => {
  it('ends 0-1 by checkmate in fool’s mate, with its PGN, first in the list', async () => {
    const db = await testDb()
    const engine = scripted('e7e5', 'd8h4')
    const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
    expect(engineToMove(game)).toBe(false)
    await personMove(db, game.id, 'f2f3')
    await engineMove(db, engine, game.id)
    await personMove(db, game.id, 'g2g4')
    const ended = await engineMove(db, engine, game.id)
    expect([ended?.status, ended?.result, ended?.reason]).toEqual(['ended', '0-1', 'checkmate'])
    expect(ended?.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#'])
    expect(ended?.pgn).toContain('[Black "Stockfish (Casual)"]')
    expect(ended?.pgn?.trim().endsWith('1. f3 e5 2. g4 Qh4# 0-1')).toBe(true)
    expect(engine.asked).toEqual([
      { level: '1320', thinkMs: 5000 },
      { level: '1320', thinkMs: 5000 },
    ])
    expect((await listGames(db, 10)).items[0]?.id).toBe(game.id)
  })

  it('lets the engine open when the person plays Black, and resumes from what was stored', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: 'max', color: 'black', thinkSeconds: 20 })
    expect(engineToMove(game)).toBe(true)
    await engineMove(db, scripted('e2e4'), game.id)
    expect(await gamesInPlay(db)).toEqual([game.id])
    const resumed = await loadGame(db, game.id)
    expect([resumed?.ply, resumed?.fen.split(' ')[1], resumed?.moves[0]?.san]).toEqual([
      1,
      'b',
      'e4',
    ])
  })

  it('refuses an illegal move, a move out of turn and a move after the end', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '1600', color: 'white', thinkSeconds: 10 })
    expect(await personMove(db, game.id, 'e2e5')).toMatchObject({ ok: false, status: 422 })
    await personMove(db, game.id, 'e2e4')
    expect(await personMove(db, game.id, 'd2d4')).toMatchObject({ ok: false, status: 409 })
    await resign(db, game.id)
    expect(await personMove(db, game.id, 'e7e5')).toMatchObject({
      ok: false,
      error: 'The game is over.',
    })
    expect(await personMove(db, 'nope', 'e2e4')).toMatchObject({ ok: false, status: 404 })
  })

  it('ends by resignation for the engine, and a move the engine finished after it is not played', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '2000', color: 'white', thinkSeconds: 5 })
    await personMove(db, game.id, 'e2e4')
    let release: (move: string) => void = () => {}
    const slow: EnginePlayer = { bestMove: () => new Promise((resolve) => (release = resolve)) }
    const thinking = engineMove(db, slow, game.id)
    const resigned = await resign(db, game.id)
    expect(resigned).toMatchObject({ ok: true, view: { result: '0-1', reason: 'resignation' } })
    release('e7e5')
    expect((await thinking)?.ply).toBe(1)
    expect(await resign(db, game.id)).toMatchObject({ ok: false, status: 409 })
  })

  it('pages the list by its keyset', async () => {
    const db = await testDb()
    for (let i = 0; i < 3; i++)
      await createGame(
        db,
        { level: '1320', color: 'white', thinkSeconds: 5 },
        new Date(Date.UTC(2026, 9, 1 + i)),
      )
    const first = await listGames(db, 2)
    expect(first.items).toHaveLength(2)
    const second = await listGames(db, 2, first.next!)
    expect([second.items.length, second.next]).toEqual([1, null])
    expect(new Set([...first.items, ...second.items].map((g) => g.id)).size).toBe(3)
  })
})

describe('taking back (desktop-app)', () => {
  it('takes back the person’s move and the engine’s answer, to the person’s turn', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
    expect(await takeBack(db, game.id)).toMatchObject({ ok: false, status: 409 })
    await personMove(db, game.id, 'e2e4')
    await engineMove(db, scripted('e7e5'), game.id)
    await personMove(db, game.id, 'g1f3')
    await engineMove(db, scripted('b8c6'), game.id)
    const back = await takeBack(db, game.id)
    expect(back.ok && back.view.moves.map((m) => m.san)).toEqual(['e4', 'e5'])
    expect(back.ok && [back.view.ply, back.view.fen]).toEqual([
      2,
      back.ok && back.view.moves[1]!.fenAfter,
    ])
    const start = await takeBack(db, game.id)
    expect(start.ok && [start.view.ply, start.view.moves.length, engineToMove(start.view)]).toEqual(
      [0, 0, false],
    )
  })

  it('as Black keeps the engine’s first move', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '1320', color: 'black', thinkSeconds: 5 })
    await engineMove(db, scripted('e2e4'), game.id)
    expect(await takeBack(db, game.id)).toMatchObject({ ok: false, status: 409 })
    await personMove(db, game.id, 'e7e5')
    const back = await takeBack(db, game.id)
    expect(back.ok && back.view.moves.map((m) => m.san)).toEqual(['e4'])
  })

  it('drops the answer of an engine that was thinking, even after the person plays again', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
    await personMove(db, game.id, 'e2e4')
    let release: (move: string) => void = () => {}
    const slow: EnginePlayer = { bestMove: () => new Promise((resolve) => (release = resolve)) }
    const thinking = engineMove(db, slow, game.id)
    await takeBack(db, game.id)
    await personMove(db, game.id, 'd2d4')
    release('e7e5') // legal after 1.d4 too, but asked about 1.e4
    expect((await thinking)?.moves.map((m) => m.san)).toEqual(['d4'])
  })

  it('goes back several moves at once, to the person’s turn or to the engine’s', async () => {
    const db = await testDb()
    const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
    const engine = scripted('e7e5', 'b8c6', 'g8f6')
    for (const uci of ['e2e4', 'g1f3', 'f1c4']) {
      await personMove(db, game.id, uci)
      await engineMove(db, engine, game.id)
    }
    const toTwo = await takeBack(db, game.id, 2)
    expect(toTwo.ok && toTwo.view.moves.map((m) => m.san)).toEqual(['e4', 'e5'])
    // Back to after the person's move: the engine is to move again.
    const toOne = await takeBack(db, game.id, 1)
    expect(toOne.ok && engineToMove(toOne.view)).toBe(true)
    expect(await takeBack(db, game.id, 1)).toMatchObject({ ok: false, status: 409 })
    expect(await takeBack(db, game.id, -1)).toMatchObject({ ok: false, status: 409 })
    expect((await takeBack(db, game.id, 0)).ok).toBe(true)
  })

  it('knows the person’s last move', () => {
    expect([0, 1, 2, 3].map((ply) => lastPersonPly({ ply, personColor: 'white' }))).toEqual([
      0, 1, 1, 3,
    ])
    expect([0, 1, 2, 3].map((ply) => lastPersonPly({ ply, personColor: 'black' }))).toEqual([
      0, 0, 2, 2,
    ])
  })
})

/** An analysis engine that scores every position the same, from White's side. */
function judging(cp: number | null, mate: number | null = null): PositionJudge {
  return {
    evaluate: () => Promise.resolve({ thinkMs: 1500, depth: 20, lines: [{ cp, mate, pv: [] }] }),
  }
}

/** A game as White with `plies` moves played, the person to move: pawns one step at a time, never a repetition. */
async function gameOf(db: Awaited<ReturnType<typeof testDb>>, plies: number) {
  const game = await createGame(db, { level: '1320', color: 'white', thinkSeconds: 5 })
  const steps = (rank: [number, number, number]) =>
    'abcdefgh'
      .split('')
      .flatMap((f) => [`${f}${rank[0]}${f}${rank[1]}`, `${f}${rank[1]}${f}${rank[2]}`])
  const white = steps([2, 3, 4])
  const black = steps([7, 6, 5])
  for (let i = 0; i < plies; i++) {
    const uci = i % 2 === 0 ? white[i / 2]! : black[(i - 1) / 2]!
    if (i % 2 === 0) await personMove(db, game.id, uci)
    else await engineMove(db, scripted(uci), game.id)
  }
  return (await loadGame(db, game.id))!
}

describe('offers to the engine (desktop-app)', () => {
  it('takes a draw from move 15 when it is not better, and declines one otherwise', async () => {
    const db = await testDb()
    const early = await gameOf(db, 2)
    // White +0.40 means the engine (Black) is worse, but it is too early.
    expect(await offerDraw(db, judging(40), early.id)).toMatchObject({
      ok: true,
      view: { accepted: false, game: { status: 'playing' } },
    })
    const later = await gameOf(db, DRAW_FROM_PLY)
    expect(await offerDraw(db, judging(-80), later.id)).toMatchObject({
      view: { accepted: false },
    })
    expect(await offerDraw(db, judging(0), later.id)).toMatchObject({
      view: { accepted: true, game: { result: '1/2-1/2', reason: 'agreement' } },
    })
    expect(await offerDraw(db, judging(0), later.id)).toMatchObject({ ok: false, status: 409 })
  })

  it('resigns when it is lost, and plays on otherwise', async () => {
    const db = await testDb()
    const game = await gameOf(db, 2)
    expect(await askToResign(db, judging(300), game.id)).toMatchObject({
      view: { accepted: false },
    })
    expect(await askToResign(db, judging(null, 4), game.id)).toMatchObject({
      view: { accepted: true, game: { result: '1-0', reason: 'resignation' } },
    })
  })

  it('does not answer about a position the game has left', async () => {
    const db = await testDb()
    const game = await gameOf(db, 0)
    const moving: PositionJudge = {
      evaluate: async () => {
        await personMove(db, game.id, 'e2e4')
        return { thinkMs: 1500, depth: 20, lines: [{ cp: 900, mate: null, pv: [] }] }
      },
    }
    expect(await askToResign(db, moving, game.id)).toMatchObject({ ok: false, status: 409 })
  })
})

describe('ids (D11)', () => {
  it('are UUID v7, ordered by time', () => {
    const a = newId(new Date(1_000))
    const b = newId(new Date(2_000))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })
})
