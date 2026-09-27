import { readJson } from './upstream'
import type { PingState } from '../pings'

/** `GET /api/pings/{id}/live`: the actor's own state — read-your-write, replica lag irrelevant. */
export async function loadPingLive(fetchImpl: typeof fetch, id: string): Promise<PingState> {
  return readJson<PingState>(
    await fetchImpl(`/api/pings/${encodeURIComponent(id)}/live`),
    `GET /api/pings/${id}/live`,
  )
}

/** `POST /api/pings/{id}`: the command. The reply is the actor's post-persist state. */
export async function sendPing(
  fetchImpl: typeof fetch,
  id: string,
  text: string,
): Promise<PingState> {
  const res = await fetchImpl(`/api/pings/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return readJson<PingState>(res, `POST /api/pings/${id}`)
}
