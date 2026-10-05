import { useState } from 'react'
import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { NextStudyLine, RunResult, StudyLine, TrainerColor } from '#/lib/trainer'
import { isColor, lineState, useDrill } from '#/lib/trainer'
import { getStudyDrill, getStudyNext, postStudyTrainerResult } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import {
  ColorSwitch,
  DrillLayout,
  LearnedBar,
  RunOutcome,
  StudyLinesTable,
  dueText,
} from '#/components/trainer'
import { Button, ErrorText, Panel, SectionHeading, useCommand } from '#/components/ui'

/**
 * One of the member's studies drilled line by line (study-repertoire-trainer): the next due line on the board from the
 * study's start, "your other line" when the member plays another line's move here, and every line's state.
 */
export const Route = createFileRoute('/_authenticated/trainer/study/$id')({
  validateSearch: (search: Record<string, unknown>): { color: TrainerColor } => ({
    color: isColor(search['color']) ? search['color'] : 'white',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    const input = { id: params.id, color: deps.color }
    const [drill, next] = await Promise.all([
      getStudyDrill({ data: input }).catch(() => null),
      getStudyNext({ data: input }).catch(() => null),
    ])
    if (!drill || !next) throw notFound()
    return { drill, next }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: pageTitle(loaderData?.drill.title ?? 'Trainer') }],
  }),
  component: StudyDrillPage,
})

function StudyDrillPage() {
  const { id } = Route.useParams()
  const { color } = Route.useSearch()
  const { drill: study, next: first } = Route.useLoaderData()
  const router = useRouter()
  const [next, setNext] = useState<NextStudyLine>(first)
  const [run, setRun] = useState(0)
  const [outcome, setOutcome] = useState<{ result: RunResult; mistakes: number } | null>(null)
  const recording = useCommand()
  const learned = study.lines.filter((l) => lineState(l) === 'learned').length
  const allMoves = study.lines.map((l) => l.moves)

  async function onDone(lineKey: string, mistakes: number) {
    const result = await recording.run(() =>
      postStudyTrainerResult({ data: { id, lineKey, color, mistakes } }),
    )
    if (result) setOutcome({ result, mistakes })
    void router.invalidate()
  }

  async function nextLine() {
    const answer = await getStudyNext({ data: { id, color } })
    if (answer) setNext(answer)
    setOutcome(null)
    setRun((r) => r + 1)
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <SectionHeading size="xl">{study.title}</SectionHeading>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ColorSwitch color={color} study={id} />
          <LearnedBar learned={learned} lines={study.lines.length} />
        </div>
        <p className="m-0 text-xs text-fg-muted">
          Every line of the study, from its start to the end of a variation. A line you change
          starts again.
        </p>
      </header>
      {next.line ? (
        <StudyDrillBoard
          key={`${next.line.key}|${color}|${run}`}
          line={next.line}
          color={color}
          startFen={study.startFen}
          // This line's own move is checked first, so its entry here never reads as another line.
          others={allMoves}
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
        </StudyDrillBoard>
      ) : (
        <Panel variant="accent" testId="study-done">
          <p className="m-0 text-sm text-fg-primary">
            {next.nextDueAt
              ? `Done for now: every line is known. The next one is due ${dueText(next.nextDueAt)}.`
              : `This study has no line with a move for ${color}.`}
          </p>
          <Link
            to="/trainer"
            search={{ color, source: 'studies' }}
            className="text-sm text-fg-accent"
          >
            Another study
          </Link>
        </Panel>
      )}
      <section className="flex flex-col gap-3">
        <SectionHeading>Lines</SectionHeading>
        <StudyLinesTable lines={study.lines} startFen={study.startFen} />
      </section>
    </div>
  )
}

function StudyDrillBoard({
  line,
  color,
  startFen,
  others,
  onDone,
  children,
}: {
  line: StudyLine
  color: TrainerColor
  startFen: string
  others: ReadonlyArray<ReadonlyArray<string>>
  onDone: (lineKey: string, mistakes: number) => void
  children: ReactNode
}) {
  const drill = useDrill(
    line,
    color,
    (mistakes) => onDone(line.key, mistakes),
    400,
    startFen,
    others,
  )
  return (
    <DrillLayout
      drill={drill}
      color={color}
      title="Your line"
      moves={line.moves}
      startFen={startFen}
    >
      {children}
    </DrillLayout>
  )
}
