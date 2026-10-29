import { useState } from 'react'
import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import {
  Button,
  ColorSwitch,
  DrillLayout,
  ErrorText,
  LearnedBar,
  Panel,
  RunOutcome,
  SectionHeading,
  StudyLinesTable,
  dueText,
  isColor,
  lineState,
  useCommand,
  useDrill,
} from '@chess/ui'
import type { ReactNode } from 'react'
import type { NextStudyLine, RunResult, StudyLine, TrainerColor } from '@chess/ui'
import { nextStudyLine, recordRun, studyDrill } from '#/lib/data/trainer'

/**
 * One of the member's studies drilled line by line (study-repertoire-trainer): the next due line on the board from the
 * study's start, "your other line" when the member plays another line's move here, and every line's state.
 */
export const Route = createFileRoute('/trainer/study/$id')({
  validateSearch: (search: Record<string, unknown>): { color: TrainerColor } => ({
    color: isColor(search['color']) ? search['color'] : 'white',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { app }, params, deps }) => {
    const [drill, next] = await Promise.all([
      studyDrill(app.db, params.id, deps.color),
      nextStudyLine(app.db, params.id, deps.color),
    ])
    if (!drill || !next) throw notFound()
    return { drill, next }
  },
  component: StudyDrillPage,
})

function StudyDrillPage() {
  const { id } = Route.useParams()
  const { color } = Route.useSearch()
  const { drill: study, next: first } = Route.useLoaderData()
  const router = useRouter()
  const { app } = Route.useRouteContext()
  const [next, setNext] = useState<NextStudyLine>(first)
  const [run, setRun] = useState(0)
  const [outcome, setOutcome] = useState<{ result: RunResult; mistakes: number } | null>(null)
  const recording = useCommand()
  const learned = study.lines.filter((l) => lineState(l) === 'learned').length
  const allMoves = study.lines.map((l) => l.moves)

  async function onDone(lineKey: string, mistakes: number) {
    const result = await recording.run(async () => ({
      ok: true as const,
      view: await recordRun(app.db, { lineKey, color, mistakes, studyId: id }),
    }))
    if (result) setOutcome({ result, mistakes })
    void router.invalidate()
  }

  async function nextLine() {
    const answer = await nextStudyLine(app.db, id, color)
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
  // A line never trained opens shown: its first run is for learning it.
  const drill = useDrill(
    { ...line, learn: line.box === null },
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
