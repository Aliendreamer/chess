import { afterEach, describe, expect, it } from 'vitest'
import { newId, openDb } from './db'
import {
  createGame,
  engineMove,
  engineToMove,
  gamesInPlay,
  listGames,
  loadGame,
  personMove,
  resign,
} from './play'
import type { EnginePlayer } from './play'
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

describe('ids (D11)', () => {
  it('are UUID v7, ordered by time', () => {
    const a = newId(new Date(1_000))
    const b = newId(new Date(2_000))
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(a < b).toBe(true)
  })
})
