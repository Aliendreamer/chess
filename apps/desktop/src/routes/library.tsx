import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Button, ErrorText, LibraryList, Panel, SectionHeading, useCommand } from '@chess/ui'
import type { LibraryImportReport, LibraryQuery } from '#/lib/data/library'
import { importLibrary, libraryCount, searchLibrary } from '#/lib/data/library'

/**
 * Your game library (game-library, desktop-app): the PGN collections you import, searched by player, event and years;
 * every game opens on the analysis board.
 */
export const Route = createFileRoute('/library')({
  validateSearch: (search: Record<string, unknown>): LibraryQuery => ({
    ...(typeof search['player'] === 'string' && search['player']
      ? { player: search['player'] }
      : {}),
    ...(typeof search['event'] === 'string' && search['event'] ? { event: search['event'] } : {}),
    ...(typeof search['from'] === 'number' ? { from: search['from'] } : {}),
    ...(typeof search['to'] === 'number' ? { to: search['to'] } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { app }, deps }) => ({
    games: await searchLibrary(app.db, deps),
    total: await libraryCount(app.db),
  }),
  component: LibraryPage,
})

function LibraryPage() {
  const { app } = Route.useRouteContext()
  const { games, total } = Route.useLoaderData()
  const query = Route.useSearch()
  const navigate = Route.useNavigate()
  const router = useRouter()
  const importing = useCommand()
  const [report, setReport] = useState<LibraryImportReport | null>(null)
  const [player, setPlayer] = useState(query.player ?? '')
  const [event, setEvent] = useState(query.event ?? '')
  const [from, setFrom] = useState(query.from?.toString() ?? '')
  const [to, setTo] = useState(query.to?.toString() ?? '')

  async function importFile() {
    const pgn = await app.openText(['pgn', 'txt'])
    if (pgn === null) return
    const result = await importing.run(async () => ({
      ok: true as const,
      view: await importLibrary(app.db, pgn, null),
    }))
    if (result) {
      setReport(result)
      await router.invalidate()
    }
  }

  const year = (text: string) => (/^\d{4}$/.test(text.trim()) ? Number(text.trim()) : undefined)

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading size="xl" meta={`${total} games`}>
          Library
        </SectionHeading>
        <Button variant="outline" disabled={importing.busy} onClick={() => void importFile()}>
          Import a PGN file
        </Button>
      </header>
      {importing.error ? <ErrorText>{importing.error}</ErrorText> : null}
      {report ? (
        <p className="m-0 text-sm text-fg-secondary" data-testid="library-report">
          {`Imported ${report.imported}, ${report.duplicates} already in the library, ${report.refused.length} not read.`}
          {report.refused
            .slice(0, 5)
            .map((r) => ` Game ${r.index}: ${r.error}`)
            .join('')}
        </p>
      ) : null}
      <Panel variant="filled" className="gap-3">
        <form
          className="grid grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_6rem_auto] items-end gap-3"
          aria-label="Search the library"
          onSubmit={(e) => {
            e.preventDefault()
            const f = year(from)
            const t = year(to)
            void navigate({
              search: {
                ...(player.trim() ? { player: player.trim() } : {}),
                ...(event.trim() ? { event: event.trim() } : {}),
                ...(f !== undefined ? { from: f } : {}),
                ...(t !== undefined ? { to: t } : {}),
              },
            })
          }}
        >
          {[
            ['Player', player, setPlayer],
            ['Event', event, setEvent],
            ['From', from, setFrom],
            ['To', to, setTo],
          ].map(([label, value, set]) => (
            <label key={label as string} className="flex flex-col gap-1 text-xs text-fg-secondary">
              {label as string}
              <input
                value={value as string}
                onChange={(e) => (set as (v: string) => void)(e.target.value)}
                className="rounded-control border border-line-default bg-surface-inset px-3 py-2 text-sm text-fg-primary"
              />
            </label>
          ))}
          <Button type="submit" variant="primary">
            Search
          </Button>
        </form>
      </Panel>
      {games.length > 0 ? (
        <LibraryList games={games} />
      ) : (
        <p className="text-sm text-fg-muted">
          {total === 0 ? 'Your library is empty: import a PGN file of games.' : 'No game matches.'}
        </p>
      )}
    </div>
  )
}
