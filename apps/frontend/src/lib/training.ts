import { useState } from 'react'
import { clickSquare, legalTargets, needsPromotion, uciSquares } from '@chess/core'
import { lineSans } from './review'
import type { SquarePair } from '@chess/core'

/**
 * Training sessions (training): the API's shapes, the session the page keeps (the API is stateless: the page sends
 * what it has seen), the verdict and source in words, and the answer board. Client-safe; the reads are in
 * `lib/server/training.ts`.
 */

export const TRAINING_MODES = ['games', 'library'] as const
export type TrainingMode = (typeof TRAINING_MODES)[number]

export const TRAINING_PHASES = ['any', 'middlegame', 'endgame'] as const
export type TrainingPhase = (typeof TRAINING_PHASES)[number]

/** Master-game filters (mode library only; the API ignores them for the member's own games). */
export interface TrainingFilters {
  /** An ECO prefix (`B9`, `B90`) or part of an opening's name. */
  opening?: string
  phase?: TrainingPhase
  /** Part of White's or Black's name. */
  player?: string
  from?: number | undefined
  to?: number | undefined
}

export interface TrainingItem {
  id: string
  mode: TrainingMode
  fen: string
  sideToMove: 'white' | 'black'
  /** The member's Leitner box for the position; null = never trained. */
  box: number | null
}

export interface TrainingNext {
  item: TrainingItem | null
  /** How many positions match (mode games: the member's mistakes). */
  pool: number
}

export type TrainingSource =
  | {
      kind: 'library'
      libraryGameId: string
      white: string
      black: string
      event: string | null
      year: number | null
      /** The ply of the position: the master's move is ply + 1. */
      ply: number
    }
  | {
      kind: 'game'
      gameId: string
      /** The ply of the move the member played in the game. */
      ply: number
      opponent: string
    }

export interface TrainingVerdict {
  correct: boolean
  verdict: 'master' | 'engine' | 'both' | 'none'
  masterUci: string | null
  playedUci: string | null
  acceptedUci: Array<string>
  bestLine: Array<string>
  source: TrainingSource
  box: number
  dueAt: string
  learned: boolean
}

export interface TrainingSummary {
  games: { positions: number; learned: number; due: number }
  library: { pool: number; seen: number; learned: number; due: number }
}

export type SessionLength = 10 | 'endless'

export interface TrainingSettings {
  mode: TrainingMode
  filters: TrainingFilters
  length: SessionLength
}

export const DEFAULT_SETTINGS: TrainingSettings = { mode: 'games', filters: {}, length: 10 }

/** Positions per set. */
export const SET_SIZE = 10
/** The most ids the API takes in `exclude`. */
export const MAX_EXCLUDE = 100

// ---- input checks (the server functions use them; nothing a browser sends reaches the API unchecked) ----------

export function isTrainingMode(value: unknown): value is TrainingMode {
  return (TRAINING_MODES as ReadonlyArray<unknown>).includes(value)
}

const GAME_ID = /^g:[0-9a-f]{32}:\d{1,4}$/
const POSITION_ID = /^p:[0-9a-f]{32}$/

/** An item id of the mode: `g:{gameId:N}:{ply}` for the member's games, `p:{positionId:N}` for master games. */
export function isTrainingId(mode: TrainingMode, id: unknown): id is string {
  return typeof id === 'string' && (mode === 'games' ? GAME_ID : POSITION_ID).test(id)
}

export const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/

/** The filters as the API takes them: text trimmed and cut to 100 characters, years 1400–2100, unknown values dropped. */
export function cleanFilters(input: TrainingFilters | undefined): TrainingFilters {
  const out: TrainingFilters = {}
  if (!input || typeof input !== 'object') return out
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null)
  const year = (v: unknown) =>
    typeof v === 'number' && Number.isInteger(v) && v >= 1400 && v <= 2100 ? v : null
  const opening = text(input.opening)
  if (opening) out.opening = opening
  if (input.phase && input.phase !== 'any' && TRAINING_PHASES.includes(input.phase))
    out.phase = input.phase
  const player = text(input.player)
  if (player) out.player = player
  const from = year(input.from)
  if (from) out.from = from
  const to = year(input.to)
  if (to) out.to = to
  return out
}

// ---- the session -----------------------------------------------------------------------------------------------

export interface TrainingAnswer {
  item: TrainingItem
  uci: string
  verdict: TrainingVerdict
}

export interface SessionState {
  stage: 'start' | 'play' | 'summary'
  settings: TrainingSettings
  /** Matching positions, from the latest `next`; null before the first. */
  pool: number | null
  /** The position on the board (stage play). */
  item: TrainingItem | null
  /** The move sent for it, while the answer is on its way and after. */
  played: string | null
  verdict: TrainingVerdict | null
  answers: Array<TrainingAnswer>
  /** The answer shown again from the summary (an index into `answers`). */
  revisit: number | null
  /** The last start found no position. */
  empty: boolean
}

export type SessionAction =
  | { type: 'settings'; settings: TrainingSettings }
  | { type: 'started'; next: TrainingNext }
  | { type: 'played'; uci: string }
  | { type: 'answered'; verdict: TrainingVerdict }
  | { type: 'refused' }
  | { type: 'next'; next: TrainingNext }
  | { type: 'finish' }
  | { type: 'revisit'; index: number | null }

export function initialSession(settings: TrainingSettings = DEFAULT_SETTINGS): SessionState {
  return {
    stage: 'start',
    settings,
    pool: null,
    item: null,
    played: null,
    verdict: null,
    answers: [],
    revisit: null,
    empty: false,
  }
}

/** The page's session: one position at a time, never twice, a set ending after 10 or when the pool runs dry. */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'settings':
      return { ...initialSession(action.settings), pool: state.pool }
    case 'started':
      return action.next.item
        ? {
            ...initialSession(state.settings),
            stage: 'play',
            pool: action.next.pool,
            item: action.next.item,
          }
        : { ...initialSession(state.settings), pool: action.next.pool, empty: true }
    case 'played':
      if (state.stage !== 'play' || state.played !== null) return state
      return { ...state, played: action.uci }
    case 'answered':
      if (state.stage !== 'play' || !state.item || state.played === null || state.verdict)
        return state
      return {
        ...state,
        verdict: action.verdict,
        answers: [
          ...state.answers,
          { item: state.item, uci: state.played, verdict: action.verdict },
        ],
      }
    case 'refused':
      return state.verdict ? state : { ...state, played: null }
    case 'next':
      if (state.stage !== 'play') return state
      if (!action.next.item || setComplete(state))
        return { ...state, stage: 'summary', pool: action.next.pool, item: null }
      return {
        ...state,
        pool: action.next.pool,
        item: action.next.item,
        played: null,
        verdict: null,
      }
    case 'finish':
      return state.answers.length === 0
        ? initialSession(state.settings)
        : { ...state, stage: 'summary', item: null, revisit: null }
    case 'revisit':
      if (state.stage !== 'summary') return state
      return {
        ...state,
        revisit:
          action.index !== null && action.index >= 0 && action.index < state.answers.length
            ? action.index
            : null,
      }
  }
}

/** A set of 10 is over once its tenth answer is in: Next goes to the summary without asking the API. */
export function setComplete(state: SessionState): boolean {
  return state.settings.length === SET_SIZE && state.answers.length >= SET_SIZE
}

/** Every position of the session so far, for `exclude` (the newest 100). */
export function excludeIds(state: SessionState): Array<string> {
  const ids = state.answers.map((a) => a.item.id)
  if (state.item && !ids.includes(state.item.id)) ids.push(state.item.id)
  return ids.slice(-MAX_EXCLUDE)
}

export type Mark = '✓' | '✗' | '·'

/** A set's strip: a mark per answer, a dot per position still to come. Null for an endless session. */
export function progressStrip(state: SessionState): Array<Mark> | null {
  if (state.settings.length !== SET_SIZE) return null
  const marks: Array<Mark> = state.answers.map((a) => (a.verdict.correct ? '✓' : '✗'))
  while (marks.length < SET_SIZE) marks.push('·')
  return marks.slice(0, SET_SIZE)
}

/** "7 / 10": right answers of all given. */
export function scoreText(answers: ReadonlyArray<TrainingAnswer>): string {
  return `${answers.filter((a) => a.verdict.correct).length} / ${answers.length}`
}

/** The indexes of the wrong answers, for the summary. */
export function misses(answers: ReadonlyArray<TrainingAnswer>): Array<number> {
  return answers.flatMap((a, i) => (a.verdict.correct ? [] : [i]))
}

// ---- words -------------------------------------------------------------------------------------------------------

/** "Kasparov" from "Kasparov, Garry" or "Garry Kasparov". */
export function surname(name: string): string {
  const trimmed = name.trim()
  if (trimmed.includes(',')) return trimmed.split(',')[0]!.trim()
  return trimmed.split(/\s+/).at(-1) ?? trimmed
}

/** A UCI move as SAN in the position (the UCI itself when it does not play there). */
export function sanOf(fen: string, uci: string): string {
  return lineSans(fen, [uci])[0] ?? uci
}

/** The first move of a line from a position, numbered: "24.Rxd4", "24...Rxd4". */
export function firstMoveLabel(fen: string, san: string): string {
  const [, side, , , , full] = fen.split(' ')
  const number = Number(full) > 0 ? Number(full) : 1
  return side === 'b' ? `${number}...${san}` : `${number}.${san}`
}

export function promptText(item: Pick<TrainingItem, 'sideToMove'>): string {
  return `${item.sideToMove === 'white' ? 'White' : 'Black'} to move: find the best move`
}

/** Who played the move in the position: the master (by surname) or "you" in the member's own game. */
function mover(item: Pick<TrainingItem, 'sideToMove'>, source: TrainingSource): string {
  if (source.kind === 'game') return 'you'
  return surname(item.sideToMove === 'white' ? source.white : source.black)
}

/**
 * The answer in words: "The move Kasparov played.", "Engine approves (Kasparov played Rxd4).", "The move Kasparov
 * played — the engine agrees.", or the move to find after a wrong one.
 */
export function verdictText(
  item: Pick<TrainingItem, 'fen' | 'sideToMove'>,
  v: Pick<TrainingVerdict, 'correct' | 'verdict' | 'masterUci' | 'playedUci' | 'source'>,
): string {
  const who = mover(item, v.source)
  const master = v.masterUci ? sanOf(item.fen, v.masterUci) : null
  const played = v.playedUci ? sanOf(item.fen, v.playedUci) : null
  if (v.source.kind === 'game') {
    if (v.correct)
      return played ? `Engine approves (you played ${played} in the game).` : 'Engine approves.'
    return played ? `Not this time. You played ${played} in the game.` : 'Not this time.'
  }
  switch (v.verdict) {
    case 'master':
      return `The move ${who} played.`
    case 'both':
      return `The move ${who} played — the engine agrees.`
    case 'engine':
      return master ? `Engine approves (${who} played ${master}).` : 'Engine approves.'
    case 'none':
      return master ? `Not this time. ${who} played ${master}.` : 'Not this time.'
  }
}

/** "Kasparov–Topalov, Wijk aan Zee 1999, move 24"; "Your game against anna, move 12". */
export function sourceText(source: TrainingSource): string {
  if (source.kind === 'game')
    return `Your game against ${source.opponent}, move ${Math.ceil(source.ply / 2)}`
  const where = [source.event?.trim() || null, source.year ? String(source.year) : null]
    .filter(Boolean)
    .join(' ')
  return [
    `${surname(source.white)}–${surname(source.black)}`,
    where || null,
    `move ${Math.ceil((source.ply + 1) / 2)}`,
  ]
    .filter(Boolean)
    .join(', ')
}

/** Arrows after an answer: the engine's best move, and the master's move when it is another. */
export function answerArrows(
  v: Pick<TrainingVerdict, 'bestLine' | 'masterUci' | 'source'>,
): Array<SquarePair> {
  const other = v.source.kind === 'library' ? v.masterUci : null
  const ucis = [v.bestLine[0], other].filter((u): u is string => typeof u === 'string')
  return [...new Set(ucis)].flatMap((u) => {
    const pair = uciSquares(u)
    return pair ? [pair] : []
  })
}

// ---- the answer board ------------------------------------------------------------------------------------------

export interface AnswerBoard {
  selected: string | null
  promotion: { from: string; to: string } | null
  onSquareClick: (square: string) => void
  onDrop: (from: string, to: string) => boolean
  pickPromotion: (piece: 'q' | 'r' | 'b' | 'n') => void
  cancelPromotion: () => void
}

/**
 * One position to answer on the board: the side to move's first legal move (click-click, drag, or a promotion picked)
 * goes to `onPlay` while `enabled`. The board keeps the position; the verdict is shown beside it. A new position
 * needs a new hook (key the component by it).
 */
export function useAnswerBoard(
  fen: string,
  enabled: boolean,
  onPlay: (uci: string) => void,
): AnswerBoard {
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<AnswerBoard['promotion']>(null)
  const mine = fen.split(' ')[1] === 'b' ? 'b' : 'w'

  function play(uci: string) {
    setSelected(null)
    if (enabled) onPlay(uci)
  }

  return {
    selected,
    promotion,
    onSquareClick: (square) => {
      if (!enabled) return
      const result = clickSquare(fen, mine, selected, square)
      setSelected(result.selected)
      if (!result.move) return
      if (needsPromotion(fen, result.move.from, result.move.to)) setPromotion(result.move)
      else play(`${result.move.from}${result.move.to}`)
    },
    onDrop: (from, to) => {
      setSelected(null)
      if (!enabled || !legalTargets(fen, from).includes(to)) return false
      if (needsPromotion(fen, from, to)) {
        setPromotion({ from, to })
        return false
      }
      play(`${from}${to}`)
      return false
    },
    pickPromotion: (piece) => {
      if (!promotion) return
      setPromotion(null)
      play(`${promotion.from}${promotion.to}${piece}`)
    },
    cancelPromotion: () => setPromotion(null),
  }
}
