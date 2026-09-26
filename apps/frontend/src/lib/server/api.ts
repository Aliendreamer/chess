import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { PRESETS } from '../games'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { apiUrl } from './config'
import { loadMe, loadPingLive, sendPing } from './api-loaders'
import { loadGameLive, loadGameMoves, loadGameSummary, sendGameCommand } from './game-loaders'
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  joinQueue,
  leaveQueue,
  loadInvite,
  loadMyGames,
} from './play-loaders'
import type { GameCommand } from './game-loaders'
import type { InviteView } from '../play'

/** A `fetch` bound to the internal API that re-attaches the caller's session cookie under its API name. */
function serverFetch(): typeof fetch {
  const secure = cookiesAreSecure()
  const cookie = forwardCookieHeader(getRequestHeader('cookie'), secure)
  const base = apiUrl()
  return (input, init) => {
    const headers = new Headers(init?.headers)
    if (cookie) headers.set('cookie', cookie)
    headers.set('accept', 'application/json, text/plain;q=0.9')
    const url = typeof input === 'string' && input.startsWith('/') ? `${base}${input}` : input
    return fetch(url, { ...init, headers })
  }
}

// These run on the SSR server during SSR and via RPC to the same server on client navigation,
// so the browser never learns the API host.
export const getMe = createServerFn({ method: 'GET' }).handler(() => loadMe(serverFetch()))

export const getPingLive = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => loadPingLive(serverFetch(), data))

export const postPing = createServerFn({ method: 'POST' })
  .validator((input: { id: string; text: string }) => input)
  .handler(({ data }) => sendPing(serverFetch(), data.id, data.text))

// Inputs that become part of an API path are checked here, so nothing a browser sends can change the path.
const GUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/
const COLORS: ReadonlyArray<InviteView['color']> = ['white', 'black', 'random']

function preset(tc: string): string {
  if (!(PRESETS as ReadonlyArray<string>).includes(tc))
    throw new Error(`not a preset time control: ${tc}`)
  return tc
}

function guid(id: string): string {
  if (!GUID.test(id)) throw new Error('not an id')
  return id
}

const UCI = /^[a-h][1-8][a-h][1-8][nbrq]?$/
const COMMAND_KINDS: ReadonlyArray<GameCommand['kind']> = [
  'move',
  'resign',
  'draw-offer',
  'draw-accept',
  'draw-decline',
  'abort',
]

function command(input: GameCommand): GameCommand {
  if (!COMMAND_KINDS.includes(input.kind)) throw new Error('not a game command')
  if (input.kind === 'move') {
    if (!UCI.test(input.uci)) throw new Error('not a UCI move')
    return { kind: 'move', uci: input.uci }
  }
  return { kind: input.kind }
}

/** The game page's three reads in parallel (D4): the actor's view, the replica's names and SAN list. */
export const getGamePage = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(async ({ data }) => {
    const fetchImpl = serverFetch()
    const [view, summary, moves] = await Promise.all([
      loadGameLive(fetchImpl, data),
      loadGameSummary(fetchImpl, data),
      loadGameMoves(fetchImpl, data),
    ])
    return { view, summary, moves }
  })

export const getGameMoves = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => loadGameMoves(serverFetch(), data))

export const postGameCommand = createServerFn({ method: 'POST' })
  .validator((input: { id: string; command: GameCommand }) => ({
    id: guid(input.id),
    command: command(input.command),
  }))
  .handler(({ data }) => sendGameCommand(serverFetch(), data.id, data.command))

export const postJoinQueue = createServerFn({ method: 'POST' })
  .validator((input: { timeControl: string; heartbeat: boolean }) => ({
    timeControl: preset(input.timeControl),
    heartbeat: input.heartbeat === true,
  }))
  .handler(({ data }) => joinQueue(serverFetch(), data.timeControl, data.heartbeat))

export const postLeaveQueue = createServerFn({ method: 'POST' })
  .validator((timeControl: string) => preset(timeControl))
  .handler(({ data }) => leaveQueue(serverFetch(), data))

export const postCreateInvite = createServerFn({ method: 'POST' })
  .validator((input: { timeControl: string; color: InviteView['color'] }) => {
    if (!COLORS.includes(input.color)) throw new Error(`not a colour: ${input.color}`)
    return { timeControl: preset(input.timeControl), color: input.color }
  })
  .handler(({ data }) => createInvite(serverFetch(), data))

export const getInvite = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => (GUID.test(data) ? loadInvite(serverFetch(), data) : null))

export const postAcceptInvite = createServerFn({ method: 'POST' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => acceptInvite(serverFetch(), data))

export const postCancelInvite = createServerFn({ method: 'POST' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => cancelInvite(serverFetch(), data))

export const getMyGames = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; cursor?: string }) => ({
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: input.cursor,
  }))
  .handler(({ data }) => loadMyGames(serverFetch(), data))

export const getGameSummary = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => loadGameSummary(serverFetch(), data))
