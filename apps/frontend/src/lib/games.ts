/**
 * The game's wire shapes and the pure rules the game page shows them with. Client-safe (no `lib/server` import):
 * the page and its components use these, and none of it decides legality or outcomes — the server does (D3).
 */

export type Color = 'white' | 'black'

/** Mirrors the API's `GameView`: a command's answer and the `game` live kind's payload. */
export interface GameView {
  gameId: string
  whiteId: number
  blackId: number
  timeControl: string
  status: 'Created' | 'Playing' | 'Ended'
  fen: string
  ply: number
  sideToMove: 'White' | 'Black'
  lastUci: string | null
  lastSan: string | null
  whiteMs: number
  blackMs: number
  clockAt: string
  drawOfferedBy: number | null
  result: string | null
  reason: string | null
  seq: number
}

/** Mirrors `GET /api/games/{id}` (the replica): names are snapshotted per game (D23). */
export interface GameSummary {
  gameId: string
  whiteId: number
  white: string
  blackId: number
  black: string
  timeControl: string
  status: string
  result: string | null
  reason: string | null
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

const RESULTS: Record<string, string> = { '1-0': '1–0', '0-1': '0–1', '1/2-1/2': '½', '*': '—' }

export function resultText(result: string): string {
  return RESULTS[result] ?? result
}

const REASONS: Record<string, string> = {
  FiftyMoveRule: '50-move rule',
  Agreement: 'draw agreed',
  Timeout: 'time',
  TimeoutVsInsufficientMaterial: 'time vs insufficient material',
}

/** `ThreefoldRepetition` → `threefold repetition`; a few read better spelled out. */
export function reasonText(reason: string): string {
  return REASONS[reason] ?? reason.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

/**
 * The clocks `elapsedMs` after the view arrived (D5): only the side to move runs, only while playing and after
 * both first moves (D13), and never below zero. Flag fall is the server's call, not this function's.
 */
export function liveClocks(
  view: Pick<GameView, 'status' | 'ply' | 'sideToMove' | 'whiteMs' | 'blackMs'>,
  elapsedMs: number,
): { whiteMs: number; blackMs: number } {
  if (view.status !== 'Playing' || view.ply < 2)
    return { whiteMs: view.whiteMs, blackMs: view.blackMs }
  return view.sideToMove === 'White'
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

/** Bullet under 3 minutes, blitz under 10, rapid under 30, classical beyond (by the base time). */
export function category(timeControl: string): string {
  const base = Number(timeControl.split('+')[0])
  if (base < 3) return 'Bullet'
  if (base < 10) return 'Blitz'
  if (base < 30) return 'Rapid'
  return 'Classical'
}
