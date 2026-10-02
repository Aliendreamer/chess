import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { LibrarySearch } from '#/lib/library'
import { useLoadMore } from '#/lib/play'
import { getLibrary } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import { LibraryList } from '#/components/library'
import { Button, LoadMore, Panel, SectionHeading } from '#/components/ui'

const PAGE = 30

/** The game library (game-library): famous games searched by details and opening, each opening on the analysis board. */
export const Route = createFileRoute('/_authenticated/library')({
  validateSearch: (search: Record<string, unknown>): LibrarySearch => {
    const text = (k: string) =>
      typeof search[k] === 'string' && search[k] !== '' ? search[k] : undefined
    const year = (k: string) => (typeof search[k] === 'number' ? search[k] : undefined)
    const result = search['result']
    return {
      ...(text('player') ? { player: text('player') } : {}),
      ...(text('event') ? { event: text('event') } : {}),
      ...(text('opening') ? { opening: text('opening') } : {}),
      ...(text('eco') ? { eco: text('eco') } : {}),
      ...(year('from') ? { from: year('from') } : {}),
      ...(year('to') ? { to: year('to') } : {}),
      ...(result === '1-0' || result === '0-1' || result === '1/2-1/2' ? { result } : {}),
      ...(search['wc'] === true || search['wc'] === 'true' ? { wc: true } : {}),
    } as LibrarySearch
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getLibrary({ data: { search: deps, limit: PAGE } }),
  head: () => ({ meta: [{ title: pageTitle('Library') }] }),
  component: LibraryPage,
})

function LibraryPage() {
  const search = Route.useSearch()
  const first = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">Library</SectionHeading>
      <SearchForm initial={search} />
      {/* A new search starts the list over. */}
      <Results key={JSON.stringify(search)} search={search} first={first} />
      <Sources />
    </div>
  )
}

function Results({
  search,
  first,
}: {
  search: LibrarySearch
  first: ReturnType<typeof Route.useLoaderData>
}) {
  const pager = useLoadMore(first, (cursor) =>
    getLibrary({ data: { search, limit: PAGE, cursor } }),
  )
  return (
    <section className="flex flex-col gap-3" aria-label="Results">
      <LibraryList games={pager.items} />
      <LoadMore pager={pager} />
    </section>
  )
}

const FIELD =
  'rounded-control border border-line-default bg-surface-inset px-3 py-2 text-fg-primary placeholder:text-fg-muted'

/**
 * A plain GET form with named fields: before hydration the browser submits it as `/library?…` itself, after it the
 * fields are read from the form, so nothing typed early is lost.
 */
function SearchForm({ initial }: { initial: LibrarySearch }) {
  const navigate = useNavigate()

  function submit(form: HTMLFormElement) {
    const data = new FormData(form)
    const text = (k: string) => String(data.get(k) ?? '').trim()
    const next: Record<string, string | number | boolean> = {}
    for (const k of ['player', 'event', 'opening', 'eco']) if (text(k)) next[k] = text(k)
    for (const k of ['from', 'to']) if (/^\d{4}$/.test(text(k))) next[k] = Number(text(k))
    if (text('result')) next.result = text('result')
    if (data.get('wc')) next.wc = true
    void navigate({ to: '/library', search: next as LibrarySearch })
  }

  return (
    <Panel variant="filled" className="gap-3" testId="library-search">
      <form
        method="get"
        action="/library"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit(e.currentTarget)
        }}
      >
        <input
          name="player"
          aria-label="Player"
          placeholder="Player"
          defaultValue={initial.player}
          className={FIELD}
        />
        <input
          name="event"
          aria-label="Event"
          placeholder="Event"
          defaultValue={initial.event}
          className={FIELD}
        />
        <input
          name="opening"
          aria-label="Opening"
          placeholder="Opening"
          defaultValue={initial.opening}
          className={FIELD}
        />
        <input
          name="eco"
          aria-label="ECO"
          placeholder="ECO (C67, C6, C)"
          defaultValue={initial.eco}
          className={FIELD}
        />
        <input
          name="from"
          aria-label="From year"
          placeholder="From year"
          inputMode="numeric"
          defaultValue={initial.from}
          className={FIELD}
        />
        <input
          name="to"
          aria-label="To year"
          placeholder="To year"
          inputMode="numeric"
          defaultValue={initial.to}
          className={FIELD}
        />
        <select
          name="result"
          aria-label="Result"
          defaultValue={initial.result ?? ''}
          className={FIELD}
        >
          <option value="">Any result</option>
          <option value="1-0">White won</option>
          <option value="1/2-1/2">Draw</option>
          <option value="0-1">Black won</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-fg-body">
          <input type="checkbox" name="wc" value="true" defaultChecked={initial.wc ?? false} />
          World Championship only
        </label>
        <Button type="submit" variant="primary">
          Search
        </Button>
      </form>
    </Panel>
  )
}

/** Where the games come from (game-library D7): every game also shows its own source and licence. */
function Sources() {
  return (
    <Panel variant="quiet" title="About the library" className="gap-2 text-sm text-fg-secondary">
      <p className="m-0">
        Moves and factual headers only — no annotations. Each game names its source and licence.
        World Championship matches come from PGN Mentor (moves treated as facts); recent title
        matches from the lichess broadcasts (CC BY-SA 4.0). Opening names: lichess chess-openings
        (CC0).
      </p>
    </Panel>
  )
}
