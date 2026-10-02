import type { Me } from './auth'

/**
 * The admin screens (admin-screens): who is an admin, which projections exist, and what a parked record looks like.
 * Client-safe; the reads are in `lib/server/admin.ts`. The API checks the role again on every call.
 */

/** Every projection's consumer group, as `Projections/IProjection.cs#ConsumerGroups` names them. Keep in step. */
export const PROJECTION_GROUPS = [
  'chess.rm-games',
  'chess.rm-pings',
  'chess.deadlines',
  'chess.notifications',
  'chess.engine-requests',
  'chess.engine-moves-apply',
  'chess.analysis-results',
] as const
export type ProjectionGroup = (typeof PROJECTION_GROUPS)[number]

/** A row of `GET /api/admin/projections/dead-letters`. */
export interface DeadLetter {
  id: string
  groupId: string
  aggregateId: string
  seq: number
  kafkaKey: string
  value: string
  attempts: number
  lastError: string
  firstFailedAt: string
  parkedAt: string
}

/** What a replay did: the records applied, or why it failed again. */
export type ReplayOutcome = { ok: true; applied: number } | { ok: false; error: string }

export function isAdmin(me: Pick<Me, 'roles'>): boolean {
  return me.roles.includes('Admin')
}

export function isProjectionGroup(value: string): value is ProjectionGroup {
  return (PROJECTION_GROUPS as ReadonlyArray<string>).includes(value)
}

const AGGREGATE = /^[A-Za-z0-9:._-]{1,128}$/

/** An aggregate id safe to put in the replay path: a game, ping or other entity id. */
export function isAggregateId(value: string): boolean {
  return AGGREGATE.test(value)
}

/** An exception's first line: the message without the stack. */
export function firstLine(text: string): string {
  return text.split('\n', 1)[0] ?? ''
}
