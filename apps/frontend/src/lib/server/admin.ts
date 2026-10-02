import { redirect } from '@tanstack/react-router'
import { LOGIN_REDIRECT, readJson } from './upstream'
import type { CursorPage } from '../play'
import type { DeadLetter, ReplayOutcome } from '../admin'

/** `GET /api/admin/projections/dead-letters`: newest parked first, optionally one projection's (Admin only). */
export async function loadDeadLetters(
  fetchImpl: typeof fetch,
  page: { limit: number; cursor?: string | undefined; groupId?: string | undefined },
): Promise<CursorPage<DeadLetter>> {
  const query = new URLSearchParams({ limit: String(page.limit) })
  if (page.cursor) query.set('cursor', page.cursor)
  if (page.groupId) query.set('groupId', page.groupId)
  return readJson<CursorPage<DeadLetter>>(
    await fetchImpl(`/api/admin/projections/dead-letters?${query.toString()}`),
    'GET /api/admin/projections/dead-letters',
  )
}

/**
 * `POST …/{group}/dead-letters/{aggregate}/replay`. The API answers 409 with the same body when a record fails again,
 * so 200 and 409 are both outcomes; a refusal is an error outcome; a lost session goes to login; 5xx throws.
 */
export async function replayDeadLetters(
  fetchImpl: typeof fetch,
  groupId: string,
  aggregateId: string,
): Promise<ReplayOutcome> {
  const path = `/api/admin/projections/${groupId}/dead-letters/${aggregateId}/replay`
  const res = await fetchImpl(path, { method: 'POST' })
  if (res.status === 401) throw redirect({ href: LOGIN_REDIRECT })
  if (res.status >= 500) throw new Error(`POST ${path} failed with ${res.status}`)
  if (res.status === 200 || res.status === 409) {
    const body = (await res.json()) as { applied: number; error: string | null }
    return res.status === 200
      ? { ok: true, applied: body.applied }
      : { ok: false, error: body.error ?? 'It failed again.' }
  }
  return { ok: false, error: `Replay refused (${res.status}).` }
}
