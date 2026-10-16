import { createServerFn } from '@tanstack/react-start'
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server'
import { THINK_LEVELS, isPreferences } from '@chess/core'
import {
  IMPORT_BATCH,
  MAX_EXCLUDE,
  UCI_MOVE,
  cleanFilters,
  isColor,
  isLibrarySource,
  isTrainingId,
  isTrainingMode,
  searchQuery,
} from '@chess/ui'
import { CLAIM_OUTCOMES, PRESETS } from '../games'
import { checkNewMember, isAggregateId, isProjectionGroup } from '../admin'
import { loadMe, loadPreferences, savePreferences } from './auth'
import { apiUrl, clientIp, forwardClientIp, isGuid } from './upstream'
import { cookiesAreSecure, forwardCookieHeader } from './cookies'
import { telemetryEnabled } from './telemetry'
import { loadPingLive, sendPing } from './pings'
import {
  changeMember,
  createMember,
  loadAdminMembers,
  loadDeadLetters,
  replayDeadLetters,
  resetMemberPassword,
} from './admin'
import { answerChallenge, loadMembers, sendChallenge } from './members'
import { loadEvents, loadNews, loadNewsSources } from './news'
import {
  importLibrary,
  loadBroadcastRuns,
  loadLibrary,
  loadLibraryGame,
  loadOpening,
  loadPosition,
  startBroadcastImport,
} from './library'
import { loadPlayer, loadPlayerGames } from './players'
import {
  loadFamilies,
  loadFamily,
  loadMyTraining,
  loadNextLine,
  loadNextStudyLine,
  loadStudyDrill,
  loadTrainerStudies,
  recordRun,
  recordStudyRun,
} from './trainer'
import { loadReview, startReview } from './review'
import { answerTraining, loadTrainingNext, loadTrainingSummary } from './training'
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
import { joinQueue, leaveQueue, loadLobby, loadMyGames, rematch } from './play'
import type {
  ImportBatch,
  LibrarySearch,
  LibrarySource,
  TrainerColor,
  TrainingFilters,
  TrainingMode,
} from '@chess/ui'
import type { ColourChoice, Preferences, StudyInput, StudyMoveInput, Think } from '@chess/core'
import type { MemberAction, NewMember } from '../admin'
import type { ChallengeAnswer } from './members'
import type { GameCommand } from '../games'

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
const COLORS: ReadonlyArray<ColourChoice> = ['white', 'black', 'random']

function preset(tc: string): string {
  if (!(PRESETS as ReadonlyArray<string>).includes(tc))
    throw new Error(`not a preset time control: ${tc}`)
  return tc
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
    if (isLibrarySource(s.source)) search.source = s.source
    return searchQuery(search, Math.min(Math.max(Math.trunc(input.limit), 1), 50), input.cursor)
  })
  .handler(({ data }) => loadLibrary(serverFetch(), data))

export const getLibraryGame = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => loadLibraryGame(serverFetch(), data))

export const getLibraryPosition = createServerFn({ method: 'GET' })
  .validator((input: { key: string; source: LibrarySource }) => ({
    key: positionKeyOf(input.key),
    source: isLibrarySource(input.source) ? input.source : 'all',
  }))
  .handler(({ data }) => loadPosition(serverFetch(), data.key, data.source))

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

/** The latest lichess broadcast imports (broadcast-explorer; Admin, the API checks the role). */
export const getBroadcastRuns = createServerFn({ method: 'GET' }).handler(() =>
  loadBroadcastRuns(serverFetch()),
)

export const postStartBroadcastImport = createServerFn({ method: 'POST' })
  .validator((month: string) => {
    if (typeof month !== 'string' || !/^20\d\d-(0[1-9]|1[0-2])$/.test(month)) {
      throw new Error('A month as YYYY-MM.')
    }
    return month
  })
  .handler(({ data }) => startBroadcastImport(serverFetch(), data))

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

/** A member's id: a positive `users` id (the computer players are negative and never members). */
function memberId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Not a member id.')
  return id
}

/** Every active member with their state (club-members). */
export const getMembers = createServerFn({ method: 'GET' }).handler(() =>
  loadMembers(serverFetch()),
)

/** Challenges an online member to a preset game (challenges). */
export const postChallenge = createServerFn({ method: 'POST' })
  .validator((input: { opponentId: number; timeControl: string; color: ColourChoice }) => {
    if (!COLORS.includes(input.color)) throw new Error('Not a colour.')
    return {
      opponentId: memberId(input.opponentId),
      timeControl: preset(input.timeControl),
      color: input.color,
    }
  })
  .handler(({ data }) => sendChallenge(serverFetch(), data))

const CHALLENGE_ANSWERS: ReadonlyArray<ChallengeAnswer> = ['accept', 'decline', 'cancel']

/** Accepts or declines a challenge to me, or cancels mine. */
export const postChallengeAnswer = createServerFn({ method: 'POST' })
  .validator((input: { inviteId: string; answer: ChallengeAnswer }) => {
    if (!CHALLENGE_ANSWERS.includes(input.answer)) throw new Error('Not an answer.')
    return { inviteId: guid(input.inviteId), answer: input.answer }
  })
  .handler(({ data }) => answerChallenge(serverFetch(), data.inviteId, data.answer))

/** Every member, for the admin's Members section (member-admin); the API answers 403 to anyone but an Admin. */
export const getAdminMembers = createServerFn({ method: 'GET' }).handler(() =>
  loadAdminMembers(serverFetch()),
)

export const postCreateMember = createServerFn({ method: 'POST' })
  .validator((input: NewMember) => {
    const checked = checkNewMember(input)
    if (!checked.ok) throw new Error(checked.error)
    return checked.member
  })
  .handler(({ data }) => createMember(serverFetch(), data))

const MEMBER_ACTIONS: ReadonlyArray<Exclude<MemberAction, 'reset-password'>> = [
  'deactivate',
  'reactivate',
  'make-admin',
  'remove-admin',
]

export const postMemberAction = createServerFn({ method: 'POST' })
  .validator((input: { id: number; action: Exclude<MemberAction, 'reset-password'> }) => {
    if (!MEMBER_ACTIONS.includes(input.action)) throw new Error('Not a member action.')
    return { id: memberId(input.id), action: input.action }
  })
  .handler(({ data }) => changeMember(serverFetch(), data.id, data.action))

export const postResetMemberPassword = createServerFn({ method: 'POST' })
  .validator((id: number) => memberId(id))
  .handler(({ data }) => resetMemberPassword(serverFetch(), data))

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

/** A colour to train (opening-trainer). */
function trainerColor(color: TrainerColor): TrainerColor {
  if (!isColor(color)) throw new Error('Not a colour.')
  return color
}

/** A family (or a narrower prefix of one) as the API takes it. */
function familyName(name: string): string {
  if (typeof name !== 'string' || !name.trim() || name.length > 200)
    throw new Error('Not an opening.')
  return name.trim()
}

/** The opening families with the member's progress, searched by part of a name. */
export const getTrainerFamilies = createServerFn({ method: 'GET' })
  .validator((input: { color: TrainerColor; q?: string }) => ({
    color: trainerColor(input.color),
    q: typeof input.q === 'string' ? input.q.trim().slice(0, 100) : '',
  }))
  .handler(({ data }) => loadFamilies(serverFetch(), data.color, data.q))

export const getTrainerFamily = createServerFn({ method: 'GET' })
  .validator((input: { name: string; color: TrainerColor }) => ({
    name: familyName(input.name),
    color: trainerColor(input.color),
  }))
  .handler(({ data }) => loadFamily(serverFetch(), data.name, data.color))

export const getTrainerNext = createServerFn({ method: 'GET' })
  .validator((input: { name: string; color: TrainerColor }) => ({
    name: familyName(input.name),
    color: trainerColor(input.color),
  }))
  .handler(({ data }) => loadNextLine(serverFetch(), data.name, data.color))

export const postTrainerResult = createServerFn({ method: 'POST' })
  .validator((input: { lineKey: string; color: TrainerColor; mistakes: number }) => {
    if (typeof input.lineKey !== 'string' || !input.lineKey || input.lineKey.length > 100)
      throw new Error('Not a line.')
    return {
      lineKey: input.lineKey,
      color: trainerColor(input.color),
      mistakes: Math.min(Math.max(Math.trunc(input.mistakes), 0), 1000),
    }
  })
  .handler(({ data }) => recordRun(serverFetch(), data))

/** The member's own studies to drill (study-repertoire-trainer). */
export const getTrainerStudies = createServerFn({ method: 'GET' })
  .validator((input: { color: TrainerColor; limit: number; cursor?: string }) => ({
    color: trainerColor(input.color),
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: typeof input.cursor === 'string' ? input.cursor.slice(0, 200) : undefined,
  }))
  .handler(({ data }) => loadTrainerStudies(serverFetch(), data))

export const getStudyDrill = createServerFn({ method: 'GET' })
  .validator((input: { id: string; color: TrainerColor }) => ({
    id: guid(input.id),
    color: trainerColor(input.color),
  }))
  .handler(({ data }) => loadStudyDrill(serverFetch(), data.id, data.color))

export const getStudyNext = createServerFn({ method: 'GET' })
  .validator((input: { id: string; color: TrainerColor }) => ({
    id: guid(input.id),
    color: trainerColor(input.color),
  }))
  .handler(({ data }) => loadNextStudyLine(serverFetch(), data.id, data.color))

export const postStudyTrainerResult = createServerFn({ method: 'POST' })
  .validator((input: { id: string; lineKey: string; color: TrainerColor; mistakes: number }) => {
    if (
      typeof input.lineKey !== 'string' ||
      !input.lineKey.startsWith('study:') ||
      input.lineKey.length > 100
    )
      throw new Error('Not a study line.')
    return {
      id: guid(input.id),
      run: {
        lineKey: input.lineKey,
        color: trainerColor(input.color),
        mistakes: Math.min(Math.max(Math.trunc(input.mistakes), 0), 1000),
      },
    }
  })
  .handler(({ data }) => recordStudyRun(serverFetch(), data.id, data.run))

/** The families the member has trained, for their own profile. */
export const getMyTraining = createServerFn({ method: 'GET' }).handler(() =>
  loadMyTraining(serverFetch()),
)

/** A game's engine review (game-review): anyone signed in reads it; a game in play has none. */
export const getReview = createServerFn({ method: 'GET' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => loadReview(serverFetch(), data))

/** Asks the engine to review a finished game (its players only; the API checks). */
export const postStartReview = createServerFn({ method: 'POST' })
  .validator((id: string) => guid(id))
  .handler(({ data }) => startReview(serverFetch(), data))

// ---- training (training D4) ------------------------------------------------------------------------------------

function trainingMode(mode: TrainingMode): TrainingMode {
  if (!isTrainingMode(mode)) throw new Error('Not a training mode.')
  return mode
}

/** The next position of a session: the mode, the master-game filters and the ids already seen (at most 100). */
export const getTrainingNext = createServerFn({ method: 'GET' })
  .validator(
    (input: { mode: TrainingMode; filters?: TrainingFilters; exclude?: Array<string> }) => {
      const mode = trainingMode(input.mode)
      const exclude = Array.isArray(input.exclude) ? input.exclude : []
      if (exclude.length > MAX_EXCLUDE || !exclude.every((id) => isTrainingId(mode, id)))
        throw new Error('Not a list of positions.')
      return { mode, filters: mode === 'library' ? cleanFilters(input.filters) : {}, exclude }
    },
  )
  .handler(({ data }) => loadTrainingNext(serverFetch(), data))

/** One answer; the API judges it and moves the position in the member's boxes. */
export const postTrainingAnswer = createServerFn({ method: 'POST' })
  .validator((input: { mode: TrainingMode; id: string; uci: string }) => {
    const mode = trainingMode(input.mode)
    if (!isTrainingId(mode, input.id)) throw new Error('Not a position.')
    if (typeof input.uci !== 'string' || !UCI_MOVE.test(input.uci))
      throw new Error('Not a UCI move.')
    return { mode, id: input.id, uci: input.uci }
  })
  .handler(({ data }) => answerTraining(serverFetch(), data))

/** The member's own training counts (the start panel, their own profile). */
export const getTrainingSummary = createServerFn({ method: 'GET' }).handler(() =>
  loadTrainingSummary(serverFetch()),
)

/** The lobby (live-home): polled by home every 10 s, answered from a cache the API shares between callers. */
export const getLobby = createServerFn({ method: 'GET' }).handler(() => loadLobby(serverFetch()))

export const getMyGames = createServerFn({ method: 'GET' })
  .validator((input: { limit: number; cursor?: string }) => ({
    limit: Math.min(Math.max(Math.trunc(input.limit), 1), 50),
    cursor: input.cursor,
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
  .validator((input: { level: string; color: ColourChoice }) => {
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
