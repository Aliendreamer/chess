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
