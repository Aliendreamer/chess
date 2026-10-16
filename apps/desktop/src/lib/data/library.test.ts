import { afterEach, describe, expect, it } from 'vitest'
import { STANDARD_START } from '@chess/core'
import { openDb } from './db'
import { ensureOpenings } from './openings'
import { importLibrary, libraryGame, libraryPosition, searchLibrary } from './library'
import { memorySql } from '#/testing'

const opened: Array<{ close: () => void }> = []
afterEach(() => opened.splice(0).forEach((db) => db.close()))
async function testDb() {
  const sql = memorySql()
  opened.push(sql)
  const db = await openDb(sql)
  await ensureOpenings(db, () =>
    Promise.resolve([
      "eco\tname\tpgn\nB20\tSicilian Defense\t1. e4 c5\nC20\tKing's Pawn Game\t1. e4 e5",
    ]),
  )
  return db
}

const game = (white: string, black: string, date: string, moves: string, result: string) =>
  `[Event "Match"]\n[White "${white}"]\n[Black "${black}"]\n[Date "${date}"]\n[Result "${result}"]\n\n${moves} ${result}`
const FILE = [
  game('Kasparov, Garry', 'Karpov, Anatoly', '1985.10.15', '1. e4 c5 2. Nf3', '1-0'),
  game('Fischer, Robert', 'Spassky, Boris', '1972.07.23', '1. e4 e5 2. Nf3', '1/2-1/2'),
  game('Carlsen, Magnus', 'Anand, Viswanathan', '2013.11.21', '1. d4 d5', '0-1'),
  game('Nobody', 'Else', '2000.01.01', '1. e4 e4', '*'),
].join('\n\n')

describe('the library (game-library, desktop-app)', () => {
  it('imports a file, refusing an illegal game and adding nothing the second time', async () => {
    const db = await testDb()
    expect(await importLibrary(db, FILE, 'masters.pgn')).toMatchObject({
      imported: 3,
      duplicates: 0,
      refused: [{ index: 4 }],
    })
    expect(await importLibrary(db, FILE, 'masters.pgn')).toMatchObject({
      imported: 0,
      duplicates: 3,
    })
  })

  it('counts every game once at the start, the next moves with their results and openings', async () => {
    const db = await testDb()
    await importLibrary(db, FILE, null)
    const start = await libraryPosition(db, STANDARD_START)
    expect([start.games, start.whiteWins, start.draws, start.blackWins]).toEqual([3, 1, 1, 1])
    expect(start.moves.map((m) => [m.uci, m.games])).toEqual([
      ['e2e4', 2],
      ['d2d4', 1],
    ])
    const afterE4 = await libraryPosition(
      db,
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    )
    expect(afterE4.moves.map((m) => [m.uci, m.opening])).toEqual([
      ['c7c5', 'Sicilian Defense'],
      ['e7e5', "King's Pawn Game"],
    ])
    expect(afterE4.items.map((g) => [g.white, g.ply])).toEqual([
      ['Kasparov, Garry', 1],
      ['Fischer, Robert', 1],
    ])
  })

  it('finds games by player, event and years, and opens one with its moves', async () => {
    const db = await testDb()
    await importLibrary(db, FILE, null)
    expect((await searchLibrary(db, { player: 'karpov' })).map((g) => g.white)).toEqual([
      'Kasparov, Garry',
    ])
    expect((await searchLibrary(db, { from: 1980, to: 2000 })).map((g) => g.year)).toEqual([1985])
    expect(await searchLibrary(db, { event: '100%' })).toEqual([])
    const [first] = await searchLibrary(db, { player: 'Carlsen' })
    expect((await libraryGame(db, first!.id))?.moves).toEqual(['d2d4', 'd7d5'])
    expect(first?.opening).toBeNull()
  })
})
