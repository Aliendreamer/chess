import { useEffect, useReducer, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import type { PreviewState } from '#/lib/review'
import type { TrainingItem, TrainingMode, TrainingSettings, TrainingVerdict } from '#/lib/training'
import {
  DEFAULT_SETTINGS,
  answerArrows,
  excludeIds,
  initialSession,
  isTrainingMode,
  progressStrip,
  sessionReducer,
  setComplete,
  useAnswerBoard,
} from '#/lib/training'
import { lineSans, previewLine } from '#/lib/review'
import { uciSquares } from '#/lib/board'
import { getTrainingNext, getTrainingSummary, postTrainingAnswer } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import {
  TrainingBoard,
  TrainingPanel,
  TrainingStart,
  TrainingSummaryView,
  TrainingVerdictView,
} from '#/components/training'
import { Panel, SectionHeading, useCommand } from '#/components/ui'

/**
 * Training (training D5): the member's own mistakes or critical moments from master games, one position at a time.
 * The API is stateless: this page keeps the session (what was seen, the answers) in `sessionReducer`.
 */
export const Route = createFileRoute('/_authenticated/training')({
  validateSearch: (search: Record<string, unknown>): { mode?: TrainingMode } =>
    isTrainingMode(search['mode']) ? { mode: search['mode'] } : {},
  loader: () => getTrainingSummary(),
  head: () => ({ meta: [{ title: pageTitle('Training') }] }),
  component: TrainingPage,
})

const SPLIT =
  'grid grid-cols-1 items-start gap-6 shell:grid-cols-[minmax(0,var(--board-max))_minmax(0,380px)] shell:gap-8'

function TrainingPage() {
  const summary = Route.useLoaderData()
  const { mode } = Route.useSearch()
  const router = useRouter()
  const [state, dispatch] = useReducer(sessionReducer, mode, (m?: TrainingMode) =>
    initialSession(m ? { ...DEFAULT_SETTINGS, mode: m } : DEFAULT_SETTINGS),
  )
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const answering = useCommand()
  const [preview, setPreview] = useState<PreviewState | null>(null)

  async function fetchNext(settings: TrainingSettings, exclude: Array<string>) {
    setLoading(true)
    setLoadError(null)
    try {
      return await getTrainingNext({
        data: { mode: settings.mode, filters: settings.filters, exclude },
      })
    } catch {
      setLoadError('The next position could not be loaded. Try again.')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function start() {
    setPreview(null)
    const first = await fetchNext(state.settings, [])
    if (first) dispatch({ type: 'started', next: first })
  }

  async function next() {
    if (loading) return
    setPreview(null)
    if (setComplete(state)) {
      dispatch({ type: 'finish' })
      void router.invalidate()
      return
    }
    const answer = await fetchNext(state.settings, excludeIds(state))
    if (!answer) return
    dispatch({ type: 'next', next: answer })
    if (!answer.item) void router.invalidate()
  }

  function finish() {
    setPreview(null)
    dispatch({ type: 'finish' })
    void router.invalidate()
  }

  async function play(item: TrainingItem, uci: string) {
    dispatch({ type: 'played', uci })
    const verdict = await answering.run(() =>
      postTrainingAnswer({ data: { mode: item.mode, id: item.id, uci } }),
    )
    dispatch(verdict ? { type: 'answered', verdict } : { type: 'refused' })
  }

  // Enter = Next, once the answer is in.
  const ready = state.stage === 'play' && state.verdict !== null && !loading
  useEffect(() => {
    if (!ready) return
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.defaultPrevented) return
      if ((event.target as HTMLElement | null)?.closest('button, input, a, textarea')) return
      event.preventDefault()
      void next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const revisited = state.revisit !== null ? state.answers[state.revisit] : undefined

  return (
    <div className="flex min-w-0 flex-col gap-4 shell:h-full" data-layout="wide fill">
      <div className="flex flex-col gap-1">
        <SectionHeading size="xl">Training</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary">
          Find the best move: in positions where you went wrong in your games, or at the critical
          moments of master games. A position you solve comes back later, each time after a longer
          gap.
        </p>
      </div>
      <div className="flex flex-col gap-6 shell:min-h-0 shell:flex-1 shell:overflow-y-auto shell:pr-1">
        {state.stage === 'start' ? (
          <TrainingStart
            settings={state.settings}
            summary={summary}
            empty={state.empty}
            busy={loading}
            error={loadError}
            onChange={(settings) => dispatch({ type: 'settings', settings })}
            onStart={() => void start()}
          />
        ) : null}
        {state.stage === 'play' && state.item ? (
          <div className={SPLIT}>
            <Position
              key={state.item.id}
              item={state.item}
              enabled={state.played === null && !answering.busy}
              played={state.played}
              verdict={state.verdict}
              preview={preview}
              onPlay={(uci) => void play(state.item!, uci)}
            />
            <TrainingPanel
              item={state.item}
              marks={progressStrip(state)}
              answers={state.answers}
              pool={state.pool}
              played={state.played}
              verdict={state.verdict}
              busy={loading}
              error={answering.error ?? loadError}
              preview={preview}
              onPreview={setPreview}
              onNext={() => void next()}
              onFinish={finish}
            />
          </div>
        ) : null}
        {state.stage === 'summary' ? (
          <div className={SPLIT}>
            {revisited ? (
              <Position
                key={revisited.item.id}
                item={revisited.item}
                enabled={false}
                played={revisited.uci}
                verdict={revisited.verdict}
                preview={preview}
                onPlay={() => undefined}
              />
            ) : null}
            <div className="flex flex-col gap-4">
              <TrainingSummaryView
                answers={state.answers}
                length={state.settings.length}
                revisit={state.revisit}
                onRevisit={(index) => {
                  setPreview(null)
                  dispatch({ type: 'revisit', index })
                }}
                onAgain={() => void start()}
                onSettings={() => dispatch({ type: 'settings', settings: state.settings })}
              />
              {revisited ? (
                <Panel variant="outlined">
                  <TrainingVerdictView
                    item={revisited.item}
                    answer={revisited.uci}
                    verdict={revisited.verdict}
                    preview={preview}
                    onPreview={setPreview}
                  />
                </Panel>
              ) : null}
              {loadError ? <p className="m-0 text-sm text-status-loss">{loadError}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** One position on the board: answerable until a move is sent; then the move, the arrows and the line clicked. */
function Position({
  item,
  enabled,
  played,
  verdict,
  preview,
  onPlay,
}: {
  item: TrainingItem
  enabled: boolean
  played: string | null
  verdict: TrainingVerdict | null
  preview: PreviewState | null
  onPlay: (uci: string) => void
}) {
  const board = useAnswerBoard(item.fen, enabled, onPlay)
  const shown =
    preview && verdict
      ? previewLine(item.fen, lineSans(item.fen, verdict.bestLine), preview.upTo)
      : null
  return (
    <TrainingBoard
      fen={shown?.fen ?? item.fen}
      orientation={item.sideToMove}
      board={board}
      enabled={enabled && !shown}
      lastMove={shown?.lastMove ?? uciSquares(played)}
      arrows={verdict && !shown ? answerArrows(verdict) : []}
    />
  )
}
