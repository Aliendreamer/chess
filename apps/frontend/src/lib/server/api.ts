import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader } from '@tanstack/react-start/server'
import { CORRESPONDENCE, PRESETS } from '../games'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { apiUrl, isGuid } from './upstream'
import { loadMe } from './auth'
import { loadPingLive, sendPing } from './pings'
import {
  loadEngineLevels,
  loadGameLive,
  loadGameMoves,
  loadGameSummary,
  sendGameCommand,
  startEngineGame,
} from './games'
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  joinQueue,
  leaveQueue,
  loadInvite,
  loadMyGames,
} from './play'
import type { GameCommand } from '../games'
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
const COLORS: ReadonlyArray<InviteView['color']> = ['white', 'black', 'random']

function preset(tc: string): string {
  if (!(PRESETS as ReadonlyArray<string>).includes(tc))
    throw new Error(`not a preset time control: ${tc}`)
  return tc
}

/** An invite may also be a correspondence game (correspondence-games D1); the queue may not. */
function inviteTimeControl(tc: string): string {
  return tc === CORRESPONDENCE ? tc : preset(tc)
}

function guid(id: string): string {
  if (!isGuid(id)) throw new Error('not an id')
  return id
}

const UCI = /^[a-h][1-8][a-h][1-8][nbrq]?$/
const CLAIM_OUTCOMES: ReadonlyArray<string> = ['win', 'draw']
const COMMAND_KINDS: ReadonlyArray<GameCommand['kind']> = [
  'move',
  'resign',
  'draw-offer',
  'draw-accept',
  'draw-decline',
  'abort',
  'claim',
]

function command(input: GameCommand): GameCommand {
  if (!COMMAND_KINDS.includes(input.kind)) throw new Error('not a game command')
  if (input.kind === 'move') {
    if (!UCI.test(input.uci)) throw new Error('not a UCI move')
    return { kind: 'move', uci: input.uci }
  }
  if (input.kind === 'claim') {
    // The type says win | draw, but this arrives from the browser: check the value itself.
    if (!CLAIM_OUTCOMES.includes(input.outcome)) throw new Error('not a claim')
    return { kind: 'claim', outcome: input.outcome }
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
    return { timeControl: inviteTimeControl(input.timeControl), color: input.color }
  })
  .handler(({ data }) => createInvite(serverFetch(), data))

export const getInvite = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => (isGuid(data) ? loadInvite(serverFetch(), data) : null))

export const postAcceptInvite = createServerFn({ method: 'POST' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => acceptInvite(serverFetch(), data))

export const postCancelInvite = createServerFn({ method: 'POST' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => cancelInvite(serverFetch(), data))

export const getMyGames = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; cursor?: string; turn?: 'mine' }) => ({
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: input.cursor,
    turn: input.turn === 'mine' ? ('mine' as const) : undefined,
  }))
  .handler(({ data }) => loadMyGames(serverFetch(), data))

export const getGameSummary = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => loadGameSummary(serverFetch(), data))

/** The computer's levels for the home page's "Play the computer". */
export const getEngineLevels = createServerFn({ method: 'GET' }).handler(() =>
  loadEngineLevels(serverFetch()),
)

// The level travels in the body, not the path, but is still checked for shape; the API checks it is a real level.
const ENGINE_LEVEL = /^(\d{4}|max)$/

export const postStartEngineGame = createServerFn({ method: 'POST' })
  .validator((input: { level: string; color: InviteView['color'] }) => {
    if (!ENGINE_LEVEL.test(input.level)) throw new Error(`not an engine level: ${input.level}`)
    if (!COLORS.includes(input.color)) throw new Error(`not a colour: ${input.color}`)
    return { level: input.level, color: input.color }
  })
  .handler(({ data }) => startEngineGame(serverFetch(), data))
