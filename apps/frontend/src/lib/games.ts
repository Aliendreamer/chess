import { useEffect, useState } from 'react'
/**
 * The game's wire shapes and the pure rules the game page shows them with. Client-safe (no `lib/server` import):
 * the page and its components use these, and none of it decides legality or outcomes — the server does (D3).
 */

export type Color = 'white' | 'black'

/** A colour someone may ask for: yours in an invite or a game against the computer. */
export type ColourChoice = Color | 'random'

/** A result as PGN writes it, which is how the API carries it. */
export const PGN_RESULT = {
  whiteWins: '1-0',
  blackWins: '0-1',
  draw: '1/2-1/2',
  none: '*',
} as const
export type PgnResult = (typeof PGN_RESULT)[keyof typeof PGN_RESULT]

/** What the remaining player may claim when the opponent has gone (presence-and-abandonment D5). */
export const CLAIM_OUTCOMES = ['win', 'draw'] as const
export type ClaimOutcome = (typeof CLAIM_OUTCOMES)[number]

/** Why a game ended: the API's `EndReason`, camel-cased on the wire. */
export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficientMaterial'
  | 'threefoldRepetition'
  | 'fiftyMoveRule'
  | 'resignation'
  | 'agreement'
  | 'timeout'
  | 'timeoutVsInsufficientMaterial'
  | 'aborted'
  | 'abandonment'

/** A live game's status (the API's `GameStatus`, lower-case on the wire). */
export type GameStatus = 'created' | 'playing' | 'ended'

/** A listed game's status (`rm_games`): a game is listed from its first event, so never `created`. */
export type ListStatus = Exclude<GameStatus, 'created'>

/** Mirrors the API's `GameView`: a command's answer and the `game` live kind's payload. */
export interface GameView {
  gameId: string
  whiteId: number
  blackId: number
  timeControl: string
  status: GameStatus
  fen: string
  ply: number
  sideToMove: Color
  lastUci: string | null
  lastSan: string | null
  whiteMs: number
  blackMs: number
  clockAt: string
  drawOfferedBy: number | null
  result: PgnResult | null
  reason: EndReason | null
  seq: number
  /** A player counted away (presence-and-abandonment); nobody's UI shows it, the claim panel keys off `claimableBy`. */
  absentId?: number | null
  /** Who may end the game by abandonment right now. */
  claimableBy?: number | null
  /** In a game against the computer: its side and level (engine-play D3); absent between people. */
  engineSide?: Color | null
  engineLevel?: string | null
  /** A correspondence game's deadline for the player to move; absent otherwise. */
  deadlineAt?: string | null
}

/** A level the computer plays at, as `GET /api/engine-levels` lists it. */
export interface EngineLevel {
  level: string
  /** What people see: Casual, Club, Expert, Master, Maximum. */
  label: string
  name: string
}

/** Games against the computer have no clocks (engine-play D4). */
export const UNTIMED = 'untimed'

/** A correspondence game: a week per move, reset after every move (correspondence-games D1). */
export const CORRESPONDENCE = '7d'

/** A running clock with flag and increment; untimed and correspondence games have none. */
export function hasClock(timeControl: string): boolean {
  return timeControl !== UNTIMED && timeControl !== CORRESPONDENCE
}

/**
 * How long until a deadline: "7 days left" (days to the nearest, so a fresh week is not "6 days"), then "5 hours left"
 * and "12 minutes left" rounded down, so the last day never promises more than there is.
 */
export function timeLeft(deadline: string, nowMs: number): string {
  const ms = Date.parse(deadline) - nowMs
  if (ms <= 60_000) return 'less than a minute left'
  const minutes = Math.floor(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.round(ms / 86_400_000)
  const [n, unit] = hours >= 24 ? [days, 'day'] : hours >= 1 ? [hours, 'hour'] : [minutes, 'minute']
  return `${n} ${unit}${n === 1 ? '' : 's'} left`
}

/** The computer's turn in a game against it: the page shows it thinking and takes no clicks. */
export function engineToMove(
  view: Pick<GameView, 'engineSide' | 'status' | 'sideToMove'>,
): boolean {
  return (
    view.engineSide != null &&
    view.status !== 'ended' &&
    view.sideToMove.toLowerCase() === view.engineSide
  )
}

/** Mirrors `GET /api/games/{id}` (the replica): names are snapshotted per game (D23). */
export interface GameSummary {
  gameId: string
  whiteId: number
  white: string
  blackId: number
  black: string
  timeControl: string
  status: ListStatus
  result: PgnResult | null
  reason: EndReason | null
  ply: number
  lastFen: string
  createdAt: string
  endedAt: string | null
  hasPgn: boolean
}

/** Mirrors a row of `GET /api/games/{id}/moves`. */
export interface MoveItem {
  ply: number
  uci: string
  san: string
  fenAfter: string
  whiteMs: number
  blackMs: number
  at: string
}

/** What a command answers (D8): refusals (403/404/409/422) are shown in the page, not thrown. */
export type CommandOutcome<T> = { ok: true; view: T } | { ok: false; status: number; error: string }

/** A command on a game, as the page sends it; `lib/server/api.ts` checks it again before it reaches the API. */
export type GameCommand =
  | { kind: 'move'; uci: string }
  | { kind: 'claim'; outcome: ClaimOutcome }
  | { kind: 'resign' | 'draw-offer' | 'draw-accept' | 'draw-decline' | 'abort' }

export function isGameView(value: unknown): value is GameView {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['gameId'] === 'string' &&
    typeof v['fen'] === 'string' &&
    typeof v['ply'] === 'number' &&
    typeof v['whiteMs'] === 'number' &&
    typeof v['blackMs'] === 'number' &&
    typeof v['seq'] === 'number'
  )
}

/** `m:ss` (or `h:mm:ss`); under ten seconds `0:0s.t`, because that is when tenths matter. Never negative. */
export function formatClock(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped < 10000) {
    const tenths = Math.floor(clamped / 100)
    if (clamped === 0) return '0:00'
    return `0:0${Math.floor(tenths / 10)}.${tenths % 10}`
  }
  const total = Math.floor(clamped / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}

/** SAN list → numbered rows `[white, black?]`. */
export function pairMoves(sans: ReadonlyArray<string>): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  for (let i = 0; i < sans.length; i += 2) rows.push(sans.slice(i, i + 2))
  return rows
}

export function myColor(view: Pick<GameView, 'whiteId' | 'blackId'>, meId: number): Color | null {
  if (meId === view.whiteId) return 'white'
  if (meId === view.blackId) return 'black'
  return null
}

/** Players see their own side at the bottom; spectators see White's (D20). */
export function orientation(view: Pick<GameView, 'whiteId' | 'blackId'>, meId: number): Color {
  return myColor(view, meId) ?? 'white'
}

const RESULTS: Record<PgnResult, string> = {
  [PGN_RESULT.whiteWins]: '1–0',
  [PGN_RESULT.blackWins]: '0–1',
  [PGN_RESULT.draw]: '½',
  [PGN_RESULT.none]: '—',
}

/** A value newer than this page (a later API) is shown as sent rather than as nothing. */
const known = (texts: Record<string, string>, value: string): string => texts[value] ?? value

export function resultText(result: PgnResult): string {
  return known(RESULTS, result)
}

/** Every reason, spelled for people; the type makes a new reason need its text here. */
const REASONS: Record<EndReason, string> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  insufficientMaterial: 'insufficient material',
  threefoldRepetition: 'threefold repetition',
  fiftyMoveRule: '50-move rule',
  resignation: 'resignation',
  agreement: 'draw agreed',
  timeout: 'time',
  timeoutVsInsufficientMaterial: 'time vs insufficient material',
  aborted: 'aborted',
  abandonment: 'abandonment',
}

export function reasonText(reason: EndReason): string {
  return known(REASONS, reason)
}

/**
 * The clocks `elapsedMs` after the view arrived (D5): only the side to move runs, only while playing and after
 * both first moves (D13), and never below zero. Flag fall is the server's call, not this function's.
 */
export function liveClocks(
  view: Pick<GameView, 'status' | 'ply' | 'sideToMove' | 'whiteMs' | 'blackMs'>,
  elapsedMs: number,
): { whiteMs: number; blackMs: number } {
  if (view.status !== 'playing' || view.ply < 2)
    return { whiteMs: view.whiteMs, blackMs: view.blackMs }
  return view.sideToMove === 'white'
    ? { whiteMs: Math.max(0, view.whiteMs - elapsedMs), blackMs: view.blackMs }
    : { whiteMs: view.whiteMs, blackMs: Math.max(0, view.blackMs - elapsedMs) }
}

export type MovesMerge =
  | { kind: 'same' }
  | { kind: 'append'; sans: Array<string> }
  | { kind: 'refetch' }

/** A frame one ply ahead extends the list with its SAN; any other jump means the list must be refetched (D4). */
export function mergeMoves(
  sans: ReadonlyArray<string>,
  view: Pick<GameView, 'ply' | 'lastSan'>,
): MovesMerge {
  if (view.ply === sans.length) return { kind: 'same' }
  if (view.ply === sans.length + 1 && view.lastSan)
    return { kind: 'append', sans: [...sans, view.lastSan] }
  return { kind: 'refetch' }
}

/** A game or invite id as the live topics spell it: 32 lower-case hex, no dashes (routes accept both). */
export function topicId(id: string): string {
  return id.replaceAll('-', '').toLowerCase()
}

/** The D12 presets, in the order Home shows them. */
export const PRESETS = [
  '1+0',
  '2+1',
  '3+0',
  '3+2',
  '5+0',
  '5+3',
  '10+0',
  '10+5',
  '15+10',
  '30+20',
  '90+30',
] as const

export const CATEGORIES = [
  'bullet',
  'blitz',
  'rapid',
  'classical',
  'correspondence',
  'computer',
] as const
export type Category = (typeof CATEGORIES)[number]

const CATEGORY_LABELS: Record<Category, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  classical: 'Classical',
  correspondence: 'Correspondence',
  computer: 'Untimed',
}

/**
 * Bullet under 3 minutes, blitz under 10, rapid under 30, classical beyond (by the base time); `7d` is
 * correspondence and `untimed` is a game against the computer. The key picks the game type's colour (site-themes).
 */
export function categoryOf(timeControl: string): Category {
  if (timeControl === UNTIMED) return 'computer'
  if (timeControl === CORRESPONDENCE) return 'correspondence'
  const base = Number(timeControl.split('+')[0])
  if (base < 3) return 'bullet'
  if (base < 10) return 'blitz'
  if (base < 30) return 'rapid'
  return 'classical'
}

/** The category's name for people: "Blitz", "Untimed". */
export function category(timeControl: string): string {
  return CATEGORY_LABELS[categoryOf(timeControl)]
}

/** The clocks, counted down locally since the view arrived (D5); re-based on every new view. */
export function useLocalClocks(view: GameView): { whiteMs: number; blackMs: number } {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    setElapsed(0)
    if (view.status !== 'playing' || view.ply < 2) return
    const arrived = performance.now()
    const timer = setInterval(() => setElapsed(performance.now() - arrived), 100)
    return () => clearInterval(timer)
  }, [view.seq, view.status, view.ply])
  return liveClocks(view, elapsed)
}
