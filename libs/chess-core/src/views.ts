/**
 * The view shapes (mobile-app D1): what the local data layer returns and the screens of every app take. They are
 * plain types with no React, so the data layer can name them; the hooks that use them are in the apps' UI libraries.
 */
import type { Evaluation, Think } from './analysis.ts'
import type { ReviewResult } from './review.ts'
import type { TrainingMode } from './training.ts'
import type { StudyMove } from './tree.ts'

// Was in @chess/ui's analysis.ts.

/** `POST /api/analysis`: the position, with its evaluation once one at this think time or longer is known. */
export interface AnalysisView {
  key: string
  fen: string
  think: Think
  thinkMs: number
  evaluation: Evaluation | null
}

// Was in @chess/ui's library-model.ts.

export interface LibraryGameItem {
  id: string
  white: string
  black: string
  event: string | null
  site: string | null
  round: string | null
  date: string | null
  year: number | null
  result: string
  eco: string | null
  opening: string | null
  worldChampionship: boolean
  ply: number
  source: string
  licence: string
}

export interface LibraryGameView {
  game: LibraryGameItem
  moves: Array<string>
  sourceRef: string | null
}

export interface PositionGame {
  id: string
  white: string
  black: string
  year: number | null
  event: string | null
  result: string
  ply: number
  /** Where it came from, e.g. "lichess broadcasts". */
  source: string
  /** The source's own link: a broadcast game's lichess page (its attribution). */
  sourceRef: string | null
}

/** A move played from the position in the library's games (library-explorer). */
export interface ExplorerMove {
  uci: string
  games: number
  whiteWins: number
  draws: number
  blackWins: number
  eco: string | null
  opening: string | null
}

export interface LibraryPosition {
  games: number
  whiteWins: number
  draws: number
  blackWins: number
  items: Array<PositionGame>
  /** Most played first. */
  moves: Array<ExplorerMove>
}

// Was in @chess/ui's news-model.ts.

export interface NewsItem {
  id: string
  source: string
  sourceName: string
  title: string
  url: string
  publishedAt: string
}

export interface NewsSource {
  id: string
  name: string
}

export interface ChessEvent {
  id: string
  name: string
  url: string
  roundName: string | null
  roundUrl: string | null
  ongoing: boolean
  location: string | null
  fideTc: string | null
  startsAt: string | null
  endsAt: string | null
}

// Was in @chess/ui's review-model.ts.

/** `GET /api/games/{id}/review`: the review as far as it goes, and whether the engine is still at it. */
export interface ReviewView extends ReviewResult {
  status: 'none' | 'running' | 'complete'
}

// Was in @chess/ui's studies-model.ts.

export interface StudyView {
  id: string
  ownerId: number
  ownerName: string
  title: string
  startFen: string
  tree: Array<StudyMove>
  white: string | null
  black: string | null
  result: string | null
  date: string | null
  shared: boolean
  version: number
  mine: boolean
  createdAt: string
  updatedAt: string
}

export interface StudyListItem {
  id: string
  title: string
  white: string | null
  black: string | null
  shared: boolean
  createdAt: string
  updatedAt: string
}

export interface ImportResult {
  created: Array<Pick<StudyListItem, 'id' | 'title'>>
  refused: Array<{ index: number; error: string }>
}

// Was in @chess/ui's trainer-model.ts.

/** One line of a family with the member's progress on it (box null = never trained). */
export interface TrainerLine {
  key: string
  name: string
  eco: string
  moves: Array<string>
  box: number | null
  dueAt: string | null
}

export interface FamilyProgress {
  name: string
  lines: number
  learned: number
}

export interface NextLine {
  line: TrainerLine | null
  /** When nothing is due: when the next line is. */
  nextDueAt: string | null
}

export interface RunResult {
  lineKey: string
  box: number
  dueAt: string
  learned: boolean
}

/** One of the member's studies in the trainer (study-repertoire-trainer), for one side. */
export interface StudyTraining {
  id: string
  title: string
  lines: number
  learned: number
  createdAt: string
}

/** A study line with the member's state (box null = never trained); the moves run from the study's start. */
export interface StudyLineState {
  key: string
  moves: Array<string>
  box: number | null
  dueAt: string | null
}

export interface StudyDrill {
  id: string
  title: string
  startFen: string
  /** Tree order: the main line first. */
  lines: Array<StudyLineState>
}

export interface NextStudyLine {
  line: StudyLineState | null
  nextDueAt: string | null
}

// Was in @chess/ui's training-model.ts.

export const TRAINING_MODES = ['games', 'library'] as const

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
