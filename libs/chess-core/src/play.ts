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
