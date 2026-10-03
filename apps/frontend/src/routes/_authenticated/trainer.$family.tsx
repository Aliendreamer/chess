import { useState } from 'react'
import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { NextLine, RunResult, TrainerColor, TrainerLine } from '#/lib/trainer'
import { isColor, lineState, lineText, useDrill } from '#/lib/trainer'
import { getTrainerFamily, getTrainerNext, postTrainerResult } from '#/lib/server/api'
import { uciSquares } from '#/lib/board'
import { legalTargets } from '#/lib/moveInput'
import { pageTitle } from '#/lib/feedback'
import { Board, PromotionPicker } from '#/components/games'
import {
  ColorSwitch,
  DrillStatus,
  LearnedBar,
  LinesTable,
  RunOutcome,
  dueText,
} from '#/components/trainer'
import { Button, ErrorText, Panel, SectionHeading, useCommand } from '#/components/ui'

/** One family's drill (opening-trainer): the next due line on the board, the outcome of each run, and every line's state. */
export const Route = createFileRoute('/_authenticated/trainer/$family')({
  validateSearch: (search: Record<string, unknown>): { color: TrainerColor } => ({
    color: isColor(search['color']) ? search['color'] : 'white',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const input = { name: params.family, color: deps.color }
    const [lines, next] = await Promise.all([
      getTrainerFamily({ data: input }),
      getTrainerNext({ data: input }),
    ])
    if (!lines || !next) throw notFound()
    return { lines, next }
  },
  head: ({ params }) => ({ meta: [{ title: pageTitle(params.family) }] }),
  component: FamilyPage,
})

function FamilyPage() {
  const { family } = Route.useParams()
  const { color } = Route.useSearch()
  const { lines, next: first } = Route.useLoaderData()
  const router = useRouter()
  // The line on the board; a new run (even of the same line) is a new drill.
  const [next, setNext] = useState<NextLine>(first)
  const [run, setRun] = useState(0)
  const [outcome, setOutcome] = useState<{ result: RunResult; mistakes: number } | null>(null)
  const recording = useCommand()
  const learned = lines.filter((l) => lineState(l) === 'learned').length

  // Recorded once per run: the drill calls it once when the line ends.
  async function onDone(lineKey: string, mistakes: number) {
    const result = await recording.run(() =>
      postTrainerResult({ data: { lineKey, color, mistakes } }),
    )
    if (result) setOutcome({ result, mistakes })
    void router.invalidate()
  }

  async function nextLine() {
    const answer = await getTrainerNext({ data: { name: family, color } })
    if (answer) setNext(answer)
    setOutcome(null)
    setRun((r) => r + 1)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <SectionHeading size="xl">{family}</SectionHeading>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ColorSwitch color={color} family={family} />
          <LearnedBar learned={learned} lines={lines.length} />
        </div>
      </header>
      {next.line ? (
        <DrillBoard
          key={`${next.line.key}|${color}|${run}`}
          line={next.line}
          color={color}
          onDone={(key, mistakes) => void onDone(key, mistakes)}
        >
          {outcome ? (
            <>
              <RunOutcome result={outcome.result} mistakes={outcome.mistakes} />
              <Button variant="primary" onClick={() => void nextLine()}>
                Next line
              </Button>
            </>
          ) : null}
          {recording.error ? <ErrorText>{recording.error}</ErrorText> : null}
        </DrillBoard>
      ) : (
        <Panel variant="accent" testId="family-done">
          <p className="m-0 text-sm text-fg-primary">
            {next.nextDueAt
              ? `Done for now: every line is known. The next one is due ${dueText(next.nextDueAt)}.`
              : 'This opening has no line to train.'}
          </p>
          <Link to="/trainer" search={{ color }} className="text-sm text-fg-accent">
            Another opening
          </Link>
        </Panel>
      )}
      <section className="flex flex-col gap-3">
        <SectionHeading>Lines</SectionHeading>
        <LinesTable lines={lines} />
      </section>
    </div>
  )
}

function DrillBoard({
  line,
  color,
  onDone,
  children,
}: {
  line: TrainerLine
  color: TrainerColor
  onDone: (lineKey: string, mistakes: number) => void
  children: ReactNode
}) {
  const drill = useDrill(line, color, (mistakes) => onDone(line.key, mistakes))
  return (
    <div className="grid grid-cols-1 items-start gap-6 shell:grid-cols-[minmax(0,var(--board-max))_minmax(0,360px)] shell:gap-8">
      <div className="flex max-w-(--board-max) flex-col gap-3" data-testid="drill-board">
        <Board
          fen={drill.fen}
          orientation={color}
          lastMove={uciSquares(line.moves[drill.ply - 1])}
          selected={drill.selected}
          targets={drill.selected ? legalTargets(drill.fen, drill.selected) : []}
          {...(drill.yourMove ? { onSquareClick: drill.onSquareClick, onDrop: drill.onDrop } : {})}
        />
        {drill.promotion ? (
          <PromotionPicker
            color={color}
            onPick={drill.pickPromotion}
            onCancel={drill.cancelPromotion}
          />
        ) : null}
      </div>
      <Panel variant="filled" className="gap-3" testId="drill">
        <p className="m-0 font-display text-display-xs" data-testid="drill-line">
          {`${line.eco} ${line.name}`}
        </p>
        <p className="m-0 min-h-5 font-mono text-sm text-fg-body" data-testid="drill-moves">
          {lineText(line.moves, drill.ply)}
        </p>
        {drill.done ? null : (
          <DrillStatus line={line} ply={drill.ply} yourMove={drill.yourMove} wrong={drill.wrong} />
        )}
        {children}
      </Panel>
    </div>
  )
}
