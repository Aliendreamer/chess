import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server'
import { CLAIM_OUTCOMES, CORRESPONDENCE, PRESETS } from '../games'
import { MY_TURN } from '../play'
import { THINK_LEVELS } from '../analysis'
import { isPreferences } from '../auth'
import { isAggregateId, isProjectionGroup } from '../admin'
import { IMPORT_BATCH, searchQuery } from '../library'
import { loadMe, loadPreferences, savePreferences } from './auth'
import { apiUrl, clientIp, forwardClientIp, isGuid } from './upstream'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { telemetryEnabled } from './telemetry'
import { loadPingLive, sendPing } from './pings'
import { loadDeadLetters, replayDeadLetters } from './admin'
import { loadEvents, loadNews, loadNewsSources } from './news'
import { importLibrary, loadLibrary, loadLibraryGame, loadOpening, loadPosition } from './library'
import { loadPlayer, loadPlayerGames } from './players'
import {
  loadEngineLevels,
  loadFinishedGame,
  loadGameLive,
  loadGameMoves,
  loadGameSummary,
  sendGameCommand,
  startEngineGame,
} from './games'
import {
  analysePosition,
  createStudies,
  deleteStudy,
  loadMyStudies,
  loadStudy,
  saveStudy,
  shareStudy,
  studyFromGame,
} from './studies'
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  joinQueue,
  leaveQueue,
  loadInvite,
  loadLiveGames,
  loadLobby,
  loadMyGames,
  rematch,
} from './play'
import type { ImportBatch, LibrarySearch } from '../library'
import type { Preferences } from '../auth'
import type { GameCommand } from '../games'
import type { InviteView, MyTurn } from '../play'
import type { StudyInput, StudyMoveInput } from '../studies'
import type { Think } from '../analysis'

/**
 * A `fetch` bound to the internal API that re-attaches the caller's session cookie under its API name and tells the API
 * the caller's address.
 */
function serverFetch(): typeof fetch {
  const secure = cookiesAreSecure()
  const cookie = forwardCookieHeader(getRequestHeader('cookie'), secure)
  const base = apiUrl()
  const ip = clientIp(getRequestHeader('x-forwarded-for'), getRequestIP())
  return (input, init) => {
    const headers = new Headers(init?.headers)
    if (cookie) headers.set('cookie', cookie)
    forwardClientIp(headers, ip)
    headers.set('accept', 'application/json, text/plain;q=0.9')
    const url = typeof input === 'string' && input.startsWith('/') ? `${base}${input}` : input
    return fetch(url, { ...init, headers })
  }
}

// These run on the SSR server during SSR and via RPC to the same server on client navigation,
// so the browser never learns the API host.
export const getMe = createServerFn({ method: 'GET' }).handler(() => loadMe(serverFetch()))

/** The signed-in user's display preferences (user-preferences), read with `getMe()` on every page. */
export const getPreferences = createServerFn({ method: 'GET' }).handler(() =>
  loadPreferences(serverFetch()),
)

export const putPreferences = createServerFn({ method: 'POST' })
  .validator((input: Preferences) => {
    if (!isPreferences(input)) throw new Error('not a set of preferences')
    return input
  })
  .handler(({ data }) => savePreferences(serverFetch(), data))

/** Whether the page should load its tracer (observability D7); the client bundle never reads the environment. */
export const getTelemetry = createServerFn({ method: 'GET' }).handler(() => ({
  enabled: telemetryEnabled(),
}))

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
    if (!(CLAIM_OUTCOMES as ReadonlyArray<string>).includes(input.outcome))
      throw new Error('not a claim')
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

/** A finished game's moves and players for the analysis board; null while it is played (analysis-board). */
export const getFinishedGame = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => loadFinishedGame(serverFetch(), data))

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

export const postRematch = createServerFn({ method: 'POST' })
  .validator((gameId: string) => guid(gameId))
  .handler(({ data }) => rematch(serverFetch(), data))

/** Chess news headlines (chess-news); `source` is a feed id. */
export const getNews = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; source?: string; cursor?: string }) => ({
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    source:
      typeof input.source === 'string' && /^[a-z0-9-]{1,32}$/.test(input.source)
        ? input.source
        : undefined,
    cursor: input.cursor,
  }))
  .handler(({ data }) => loadNews(serverFetch(), data))

export const getNewsSources = createServerFn({ method: 'GET' }).handler(() =>
  loadNewsSources(serverFetch()),
)

export const getEvents = createServerFn({ method: 'GET' }).handler(() => loadEvents(serverFetch()))

/** A position key as the API takes it: a FEN's first four fields (game-library). */
const POSITION_KEY = /^[pnbrqkPNBRQK1-8/]+ [wb] [KQkq-]+ [a-h1-8-]+$/
function positionKeyOf(key: string): string {
  if (typeof key !== 'string' || key.length > 100 || !POSITION_KEY.test(key))
    throw new Error('Not a position key.')
  return key
}

/** Library search (game-library): the filters are checked here and sent as a query string. */
export const getLibrary = createServerFn({ method: 'GET' })
  .validator((input: { search: LibrarySearch; limit: number; cursor?: string }) => {
    const s = input.search
    const search: LibrarySearch = {}
    const text = (v: string | undefined) =>
      typeof v === 'string' && v.trim() ? v.slice(0, 100) : null
    const year = (v: number | undefined) =>
      typeof v === 'number' && Number.isInteger(v) && v >= 1400 && v <= 2100 ? v : null
    const player = text(s.player)
    if (player) search.player = player
    const event = text(s.event)
    if (event) search.event = event
    const opening = text(s.opening)
    if (opening) search.opening = opening
    const from = year(s.from)
    if (from) search.from = from
    const to = year(s.to)
    if (to) search.to = to
    if (s.result === '1-0' || s.result === '0-1' || s.result === '1/2-1/2') search.result = s.result
    if (s.wc === true) search.wc = true
    if (typeof s.eco === 'string' && /^[A-Ea-e][0-9]{0,2}$/.test(s.eco)) search.eco = s.eco
    return searchQuery(search, Math.min(Math.max(Math.trunc(input.limit), 1), 50), input.cursor)
  })
  .handler(({ data }) => loadLibrary(serverFetch(), data))

export const getLibraryGame = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => loadLibraryGame(serverFetch(), data))

export const getLibraryPosition = createServerFn({ method: 'GET' })
  .validator((key: string) => positionKeyOf(key))
  .handler(({ data }) => loadPosition(serverFetch(), data))

export const getOpening = createServerFn({ method: 'GET' })
  .validator((key: string) => positionKeyOf(key))
  .handler(({ data }) => loadOpening(serverFetch(), data))

/** One import batch (Admin; the API checks the role). */
export const postImportLibrary = createServerFn({ method: 'POST' })
  .validator((batch: ImportBatch) => {
    if (!batch.source.trim() || !batch.licence.trim())
      throw new Error('Name the source and the licence.')
    if (
      !Array.isArray(batch.games) ||
      batch.games.length === 0 ||
      batch.games.length > IMPORT_BATCH
    ) {
      throw new Error(`1 to ${IMPORT_BATCH} games at a time.`)
    }
    return batch
  })
  .handler(({ data }) => importLibrary(serverFetch(), data))

/** Parked projection records (admin-screens); the API answers 403 to anyone without the Admin role. */
export const getDeadLetters = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; cursor?: string; groupId?: string }) => {
    if (input.groupId !== undefined && !isProjectionGroup(input.groupId)) {
      throw new Error('Not a projection.')
    }
    return {
      limit: Math.min(Math.max(Math.trunc(input.limit), 1), 100),
      cursor: input.cursor,
      groupId: input.groupId,
    }
  })
  .handler(({ data }) => loadDeadLetters(serverFetch(), data))

export const postReplayDeadLetters = createServerFn({ method: 'POST' })
  .validator((input: { groupId: string; aggregateId: string }) => {
    if (!isProjectionGroup(input.groupId) || !isAggregateId(input.aggregateId)) {
      throw new Error('Not a parked aggregate.')
    }
    return input
  })
  .handler(({ data }) => replayDeadLetters(serverFetch(), data.groupId, data.aggregateId))

/** A player id: a `users` id, negative for the computer players. */
function playerId(id: number): number {
  if (!Number.isSafeInteger(id) || id === 0) throw new Error('Not a player id.')
  return id
}

/** A public profile (player-profiles); null for an unknown player. */
export const getPlayer = createServerFn({ method: 'GET' })
  .validator((id: number) => playerId(id))
  .handler(({ data }) => loadPlayer(serverFetch(), data))

export const getPlayerGames = createServerFn({ method: 'GET' })
  .validator((input: { id: number; limit: number; cursor?: string }) => ({
    id: playerId(input.id),
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: input.cursor,
  }))
  .handler(({ data }) => loadPlayerGames(serverFetch(), data.id, data))

/** The lobby (live-home): polled by home every 10 s, answered from a cache the API shares between callers. */
export const getLobby = createServerFn({ method: 'GET' }).handler(() => loadLobby(serverFetch()))

/** Games in play for the Watch page, newest move first. */
export const getLiveGames = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; cursor?: string }) => ({
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: input.cursor,
  }))
  .handler(({ data }) => loadLiveGames(serverFetch(), data))

export const getMyGames = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; cursor?: string; turn?: MyTurn }) => ({
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: input.cursor,
    turn: input.turn === MY_TURN ? MY_TURN : undefined,
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

// ---- studies (studies D6) ----------------------------------------------------------------------------------

export const getMyStudies = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; cursor?: string }) => ({
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: input.cursor,
  }))
  .handler(({ data }) => loadMyStudies(serverFetch(), data))

export const getStudy = createServerFn({ method: 'GET' })
  .validator((id: string) => id)
  .handler(({ data }) => (isGuid(data) ? loadStudy(serverFetch(), data) : null))

export const postCreateStudies = createServerFn({ method: 'POST' })
  .validator((studies: Array<StudyInput>) => {
    if (!Array.isArray(studies) || studies.length === 0 || studies.length > 20)
      throw new Error('1 to 20 studies')
    return studies
  })
  .handler(({ data }) => createStudies(serverFetch(), data))

export const putStudy = createServerFn({ method: 'POST' })
  .validator(
    (input: { id: string; title: string; tree: Array<StudyMoveInput>; version: number }) => ({
      id: guid(input.id),
      title: String(input.title),
      tree: input.tree,
      version: Math.trunc(input.version),
    }),
  )
  .handler(({ data }) => saveStudy(serverFetch(), data))

export const postShareStudy = createServerFn({ method: 'POST' })
  .validator((input: { id: string; shared: boolean }) => ({
    id: guid(input.id),
    shared: input.shared === true,
  }))
  .handler(({ data }) => shareStudy(serverFetch(), data.id, data.shared))

export const postDeleteStudy = createServerFn({ method: 'POST' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => deleteStudy(serverFetch(), data))

export const postStudyFromGame = createServerFn({ method: 'POST' })
  .validator((gameId: string) => guid(gameId))
  .handler(({ data }) => studyFromGame(serverFetch(), data))

export const postAnalysis = createServerFn({ method: 'POST' })
  .validator((input: { fen: string; think: Think }) => {
    if (!(THINK_LEVELS as ReadonlyArray<string>).includes(input.think))
      throw new Error('Not a think time.')
    return { fen: String(input.fen), think: input.think }
  })
  .handler(({ data }) => analysePosition(serverFetch(), data))
