import type { Me } from './auth'

/**
 * The admin screens (admin-screens): who is an admin, which projections exist, and what a parked record looks like.
 * Client-safe; the reads are in `lib/server/admin.ts`. The API checks the role again on every call.
 */

/** Every projection's consumer group, as `Projections/IProjection.cs#ConsumerGroups` names them. Keep in step. */
export const PROJECTION_GROUPS = [
  'chess.rm-games',
  'chess.rm-pings',
  'chess.engine-requests',
  'chess.engine-moves-apply',
  'chess.analysis-results',
  'chess.auto-review',
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

/** A row of `GET /api/admin/members` (member-admin): every member, active or not. */
export interface AdminMember {
  id: number
  username: string
  fullName: string | null
  email: string | null
  active: boolean
  admin: boolean
  createdAt: string
  lastSeenAt: string | null
}

/** `POST /api/admin/members`: who to create. The e-mail is optional. */
export interface NewMember {
  username: string
  fullName: string
  email?: string | null
}

/** A new member and their temporary password, shown once. */
export interface CreatedMember {
  member: AdminMember
  temporaryPassword: string
}

export type MemberAction =
  | 'deactivate'
  | 'reactivate'
  | 'reset-password'
  | 'make-admin'
  | 'remove-admin'

const USERNAME = /^[A-Za-z0-9._-]{1,64}$/
const EMAIL = /^[^\s@]+@[^\s@]+$/

/** The create form's input, trimmed, or the reason it cannot be sent. */
export function checkNewMember(
  input: NewMember,
): { ok: true; member: NewMember } | { ok: false; error: string } {
  const username = input.username.trim()
  const fullName = input.fullName.trim()
  const email = input.email?.trim() ?? ''
  if (!USERNAME.test(username))
    return { ok: false, error: 'A username is letters, digits, dots, dashes or underscores.' }
  if (!fullName || fullName.length > 200) return { ok: false, error: 'Give the full name.' }
  if (email && (email.length > 254 || !EMAIL.test(email)))
    return { ok: false, error: 'That is not an e-mail address.' }
  return { ok: true, member: { username, fullName, email: email || null } }
}

/** Actions an admin may not take on their own row: no self-deactivation, no removing their own role. */
export function isSelfHarm(
  action: MemberAction,
  member: Pick<AdminMember, 'id'>,
  meId: number,
): boolean {
  return member.id === meId && (action === 'deactivate' || action === 'remove-admin')
}
