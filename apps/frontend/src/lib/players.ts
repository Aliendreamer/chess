import { CATEGORIES, categoryLabel, categoryOf } from './games'
import type { Category } from './games'

/**
 * Player profiles (player-profiles): the API's shapes and the record grouped into game types. Client-safe; the reads
 * are in `lib/server/players.ts`.
 */

export interface Score {
  wins: number
  draws: number
  losses: number
}

export interface TimeControlRecord extends Score {
  timeControl: string
}

/** `GET /api/players/{id}`: public only — never email or full name. */
export interface PlayerProfile extends Score {
  id: number
  name: string
  memberSince: string
  isComputer: boolean
  byTimeControl: Array<TimeControlRecord>
}

export interface CategoryRecord extends Score {
  category: Category
  label: string
}

/** Time controls added up per game type, in `CATEGORIES` order; types without games are left out. */
export function recordByCategory(rows: ReadonlyArray<TimeControlRecord>): Array<CategoryRecord> {
  return CATEGORIES.flatMap((c) => {
    const mine = rows.filter((r) => categoryOf(r.timeControl) === c)
    if (mine.length === 0) return []
    const sum = (k: keyof Score) => mine.reduce((n, r) => n + r[k], 0)
    return [
      {
        category: c,
        label: categoryLabel(c),
        wins: sum('wins'),
        draws: sum('draws'),
        losses: sum('losses'),
      },
    ]
  })
}

/** Whole percentages for the record bar, losses taking the rounding so they add up to 100. */
export function scoreShare(s: Score): Score {
  const games = s.wins + s.draws + s.losses
  if (games === 0) return { wins: 0, draws: 0, losses: 0 }
  const wins = Math.round((s.wins / games) * 100)
  const draws = Math.round((s.draws / games) * 100)
  return { wins, draws, losses: 100 - wins - draws }
}
