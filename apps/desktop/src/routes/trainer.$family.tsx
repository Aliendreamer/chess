import { useState } from 'react'
import { Link, createFileRoute, notFound, useRouter } from '@tanstack/react-router'
import {
  Button,
  ColorSwitch,
  DrillLayout,
  ErrorText,
  LearnedBar,
  LinesTable,
  Panel,
  RunOutcome,
  SectionHeading,
  dueText,
  isColor,
  lineState,
  useCommand,
  useDrill,
} from '@chess/ui'
import type { ReactNode } from 'react'
import type { NextLine, RunResult, TrainerColor, TrainerLine } from '@chess/ui'
import { familyLines, nextFamilyLine, recordRun } from '#/lib/data/trainer'

/** One family's drill (opening-trainer): the next due line on the board, the outcome of each run, and every line's state. */
export const Route = createFileRoute('/trainer/$family')({
  validateSearch: (search: Record<string, unknown>): { color: TrainerColor } => ({
    color: isColor(search['color']) ? search['color'] : 'white',
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { app }, params, deps }) => {
    const [lines, next] = await Promise.all([
      familyLines(app.db, params.family, deps.color),
      nextFamilyLine(app.db, params.family, deps.color),
    ])
    if (!lines || !next) throw notFound()
    return { lines, next }
  },
  component: FamilyPage,
})

function FamilyPage() {
  const { family } = Route.useParams()
  const { color } = Route.useSearch()
  const { lines, next: first } = Route.useLoaderData()
  const router = useRouter()
  const { app } = Route.useRouteContext()
  // The line on the board; a new run (even of the same line) is a new drill.
  const [next, setNext] = useState<NextLine>(first)
  const [run, setRun] = useState(0)
  const [outcome, setOutcome] = useState<{ result: RunResult; mistakes: number } | null>(null)
  const recording = useCommand()
  const learned = lines.filter((l) => lineState(l) === 'learned').length

  // Recorded once per run: the drill calls it once when the line ends.
  async function onDone(lineKey: string, mistakes: number) {
    const result = await recording.run(async () => ({
      ok: true as const,
      view: await recordRun(app.db, { lineKey, color, mistakes }),
    }))
    if (result) setOutcome({ result, mistakes })
    void router.invalidate()
  }

  async function nextLine() {
    const answer = await nextFamilyLine(app.db, family, color)
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
    <DrillLayout drill={drill} color={color} title={`${line.eco} ${line.name}`} moves={line.moves}>
      {children}
    </DrillLayout>
  )
}
