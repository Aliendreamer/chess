import { useState } from 'react'
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { STANDARD_START, parsePgn } from '@chess/core'
import {
  Button,
  ErrorText,
  Panel,
  SectionHeading,
  StudyList,
  useAdoptTyped,
  useCommand,
} from '@chess/ui'
import { createStudies, listStudies } from '#/lib/data/studies'

/** Your studies, a new one, and the PGN import (studies D3). */
export const Route = createFileRoute('/studies/')({
  loader: ({ context: { app } }) => listStudies(app.db),
  component: StudiesPage,
})

function StudiesPage() {
  const { app } = Route.useRouteContext()
  const studies = Route.useLoaderData()
  const navigate = useNavigate()
  const creating = useCommand()

  async function newStudy() {
    const made = await creating.run(async () => ({
      ok: true as const,
      view: await createStudies(app.db, [
        { title: 'Untitled study', startFen: STANDARD_START, tree: [] },
      ]),
    }))
    const first = made?.created[0]
    if (first) void navigate({ to: '/studies/$id', params: { id: first.id } })
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading size="xl">Studies</SectionHeading>
        <Button variant="outline" disabled={creating.busy} onClick={() => void newStudy()}>
          New study
        </Button>
      </header>
      {creating.error ? <ErrorText>{creating.error}</ErrorText> : null}
      <section className="flex flex-col gap-3.5">
        <SectionHeading>Import PGN</SectionHeading>
        <ImportForm />
      </section>
      <section className="flex flex-col gap-3.5">
        <SectionHeading meta={`${studies.length}`}>My studies</SectionHeading>
        <StudyList studies={studies} />
      </section>
    </div>
  )
}

/** Paste PGN or open a file; each game becomes a study, and what could not be read is listed by its number. */
function ImportForm() {
  const { app } = Route.useRouteContext()
  const router = useRouter()
  const [text, setText] = useState('')
  const [report, setReport] = useState<Array<string>>([])
  const box = useAdoptTyped<HTMLTextAreaElement>(setText)
  const importing = useCommand()

  async function importPgn(pgn: string) {
    const games = parsePgn(pgn)
    const ok = games.flatMap((g) => (g.ok ? [g.study] : []))
    const unread = games.flatMap((g) => (g.ok ? [] : [g.error]))
    if (ok.length === 0) {
      setReport(unread.length > 0 ? unread : ['No games found in that PGN.'])
      return
    }
    const result = await importing.run(async () => ({
      ok: true as const,
      view: await createStudies(app.db, ok),
    }))
    if (!result) return
    setReport([
      `Imported ${result.created.length} ${result.created.length === 1 ? 'study' : 'studies'}.`,
      ...unread,
      ...result.refused.map((r) => `${ok[r.index]?.title ?? `Game ${r.index + 1}`}: ${r.error}`),
    ])
    setText('')
    await router.invalidate()
  }

  return (
    <Panel variant="filled" className="gap-3" testId="import-form">
      <textarea
        ref={box}
        aria-label="PGN"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={'[Event "…"]\n\n1. e4 e5 2. Nf3 …'}
        className="w-full rounded-control border border-line-default bg-surface-inset p-3 font-mono text-sm text-fg-primary"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void app.openText(['pgn', 'txt']).then(async (file) => {
              if (file !== null) await importPgn(file)
            })
          }
        >
          Open a .pgn file
        </Button>
        <Button
          variant="primary"
          disabled={importing.busy || text.trim() === ''}
          onClick={() => void importPgn(text)}
        >
          Import
        </Button>
      </div>
      {importing.error ? <ErrorText>{importing.error}</ErrorText> : null}
      {report.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm" data-testid="import-report">
          {report.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}
