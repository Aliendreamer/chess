import { Chess } from 'chess.js'
import type { Color } from './board.ts'

/**
 * Games against the computer (engine-play D2): the five levels and the think times a player may choose (desktop-app
 * D5). `level` is what the engine understands — an Elo for `UCI_Elo`, or `max` for full strength; people see the label,
 * because that Elo is on an engine scale and far stronger than the same number for a person.
 */

export interface EngineLevel {
  level: string
  /** The seeded player's id in the club (negative: no real user has one). */
  userId: number
  label: string
}

export const ENGINE_LEVELS: ReadonlyArray<EngineLevel> = [
  { level: '1320', userId: -1, label: 'Casual' },
  { level: '1600', userId: -2, label: 'Club' },
  { level: '2000', userId: -3, label: 'Expert' },
  { level: '2400', userId: -4, label: 'Master' },
  { level: 'max', userId: -5, label: 'Maximum' },
]

export function findLevel(level: string | null | undefined): EngineLevel | null {
  return ENGINE_LEVELS.find((l) => l.level === level) ?? null
}

/** The player's name in games, lists and PGN: `Stockfish (Casual)`. */
export function engineName(level: EngineLevel): string {
  return `Stockfish (${level.label})`
}

/** The UCI options a level sets: a limited Elo, or full strength. */
export function levelOptions(level: EngineLevel): Array<string> {
  return level.level === 'max'
    ? ['setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20']
    : ['setoption name UCI_LimitStrength value true', `setoption name UCI_Elo value ${level.level}`]
}

/** The engine's think time a move, chosen per game (owner, 2026-10-16). */
export const THINK_SECONDS = [5, 10, 20] as const
export type ThinkSeconds = (typeof THINK_SECONDS)[number]

/** Who plays White: `color` is the person's (`random` is decided by `coin`, true being White). */
export function seat(
  color: Color | 'random',
  coin: () => boolean,
): { person: Color; engine: Color } {
  const personWhite = color === 'random' ? coin() : color === 'white'
  return personWhite ? { person: 'white', engine: 'black' } : { person: 'black', engine: 'white' }
}

// ---- Game types and shapes both apps show (site-themes, D12) ----

/** Games against the computer have no clocks (engine-play D4). */
export const UNTIMED = 'untimed'

/** A colour someone may ask for: yours in a game against the computer. */
export type ColourChoice = Color | 'random'

/** What a command answers (D8): refusals (403/404/409/422) are shown in the page, not thrown. */
export type CommandOutcome<T> = { ok: true; view: T } | { ok: false; status: number; error: string }

export function pairMoves(sans: ReadonlyArray<string>): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  for (let i = 0; i < sans.length; i += 2) rows.push(sans.slice(i, i + 2))
  return rows
}

export const CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical', 'computer'] as const
export type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS: Record<Category, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  computer: 'Untimed',
}

/**
 * Bullet under 3 minutes, blitz under 10, rapid under 30, classical beyond (by the base time); `untimed` is a game
 * against the computer. The key picks the game type's colour (site-themes).
 */
export function categoryOf(timeControl: string): Category {
  if (timeControl === UNTIMED) return 'computer'
  const base = Number(timeControl.split('+')[0])
  if (base < 3) return 'bullet'
  if (base < 10) return 'blitz'
  if (base < 30) return 'rapid'
  return 'classical'
}

/** The category's name for people: "Blitz", "Untimed". */
export function category(timeControl: string): string {
  return categoryLabel(categoryOf(timeControl))
}

export function categoryLabel(c: Category): string {
  return CATEGORY_LABELS[c]
}

// ---- How a game ends (D15–D18), and its PGN (D22) ----

/** Why a game ended: the API's `EndReason`, camel-cased on the wire. */
export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficientMaterial'
  | 'threefoldRepetition'
  | 'fiftyMoveRule'
  | 'resignation'
  | 'agreement'
  | 'timeout'
  | 'timeoutVsInsufficientMaterial'
  | 'aborted'
  | 'abandonment'

/** Every reason, spelled for people; the type makes a new reason need its text here. */
const REASONS: Record<EndReason, string> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  insufficientMaterial: 'insufficient material',
  threefoldRepetition: 'threefold repetition',
  fiftyMoveRule: '50-move rule',
  resignation: 'resignation',
  agreement: 'draw agreed',
  timeout: 'time',
  timeoutVsInsufficientMaterial: 'time vs insufficient material',
  aborted: 'aborted',
  abandonment: 'abandonment',
}

export function reasonText(reason: EndReason): string {
  // A reason newer than this code (a later API) is shown as sent rather than as nothing.
  return (REASONS as Partial<Record<string, string>>)[reason] ?? reason
}

/** The reason on its own line, capitalised: "Checkmate", "Draw agreed" (ui-polish). */
export function reasonLabel(reason: EndReason): string {
  const text = reasonText(reason)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** A move judged against the game so far: its SAN, the position after it, and how the game ends if it does. */
export interface JudgedMove {
  uci: string
  san: string
  fenAfter: string
  end: { result: '1-0' | '0-1' | '1/2-1/2'; reason: EndReason } | null
}

/**
 * The move `uci` after `moves` (UCI, from the standard start), with every ending on the board on: checkmate,
 * stalemate, insufficient material, threefold repetition and the fifty-move rule (as the club's rules adapter turns
 * them all on). Null when the move is illegal there.
 */
export function judgeMove(moves: ReadonlyArray<string>, uci: string): JudgedMove | null {
  const board = new Chess()
  for (const m of moves) board.move(uciMove(m))
  let san: string
  try {
    san = board.move(uciMove(uci)).san
  } catch {
    return null
  }
  const mover = board.turn() === 'w' ? 'black' : 'white'
  const end: JudgedMove['end'] = board.isCheckmate()
    ? { result: mover === 'white' ? '1-0' : '0-1', reason: 'checkmate' }
    : board.isStalemate()
      ? { result: '1/2-1/2', reason: 'stalemate' }
      : board.isInsufficientMaterial()
        ? { result: '1/2-1/2', reason: 'insufficientMaterial' }
        : board.isThreefoldRepetition()
          ? { result: '1/2-1/2', reason: 'threefoldRepetition' }
          : board.isDrawByFiftyMoves()
            ? { result: '1/2-1/2', reason: 'fiftyMoveRule' }
            : null
  return { uci, san, fenAfter: board.fen(), end }
}

function uciMove(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci[4] ? { promotion: uci[4] } : {}) }
}

/** What a finished game's PGN is built from (D22). */
export interface PgnGame {
  event: string
  site: string
  date: Date
  white: string
  black: string
  result: string
  reason: EndReason | null
  sans: ReadonlyArray<string>
}

const MAX_LINE = 79

/**
 * A finished game as PGN: the seven-tag roster and `Termination`, movetext numbered and wrapped under 80 columns,
 * ending in the result. As the backend's `Pgn.Build`, without a time control (games against the computer are untimed).
 */
export function buildPgn(game: PgnGame): string {
  const tag = (name: string, value: string) =>
    `[${name} "${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`
  const date = game.date.toISOString().slice(0, 10).replaceAll('-', '.')
  const termination =
    game.reason === 'abandonment' || game.reason === 'aborted' ? 'abandoned' : 'normal'
  const tags = [
    tag('Event', game.event),
    tag('Site', game.site),
    tag('Date', date),
    tag('Round', '-'),
    tag('White', game.white),
    tag('Black', game.black),
    tag('Result', game.result),
    tag('Termination', termination),
  ]
  const tokens = game.sans.flatMap((san, ply) => (ply % 2 === 0 ? [`${ply / 2 + 1}.`, san] : [san]))
  tokens.push(game.result)
  const lines: Array<string> = []
  let line = ''
  for (const token of tokens) {
    if (line && line.length + 1 + token.length > MAX_LINE) {
      lines.push(line)
      line = token
    } else line = line ? `${line} ${token}` : token
  }
  lines.push(line)
  return `${tags.join('\n')}\n\n${lines.join('\n')}\n`
}

export interface Score {
  wins: number
  draws: number
  losses: number
}

/** Whole percentages for the record bar, losses taking the rounding so they add up to 100. */
export function scoreShare(s: Score): Score {
  const games = s.wins + s.draws + s.losses
  if (games === 0) return { wins: 0, draws: 0, losses: 0 }
  const wins = Math.round((s.wins / games) * 100)
  const draws = Math.round((s.draws / games) * 100)
  return { wins, draws, losses: 100 - wins - draws }
}
