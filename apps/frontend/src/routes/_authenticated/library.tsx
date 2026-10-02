import { useState } from 'react'
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
      ...(search['wc'] === true ? { wc: true } : {}),
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

function SearchForm({ initial }: { initial: LibrarySearch }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    player: initial.player ?? '',
    event: initial.event ?? '',
    opening: initial.opening ?? '',
    eco: initial.eco ?? '',
    from: initial.from ? String(initial.from) : '',
    to: initial.to ? String(initial.to) : '',
    result: initial.result ?? '',
    wc: initial.wc ?? false,
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value })

  function submit() {
    const year = (v: string) => (/^\d{4}$/.test(v) ? Number(v) : undefined)
    const next: Record<string, string | number | boolean> = {}
    for (const k of ['player', 'event', 'opening', 'eco'] as const)
      if (form[k].trim()) next[k] = form[k].trim()
    const from = year(form.from)
    const to = year(form.to)
    if (from) next.from = from
    if (to) next.to = to
    if (form.result) next.result = form.result
    if (form.wc) next.wc = true
    void navigate({ to: '/library', search: next as LibrarySearch })
  }

  return (
    <Panel variant="filled" className="gap-3" testId="library-search">
      <form
        className="grid grid-cols-[repeat(auto-fit,minmax(min(180px,100%),1fr))] gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          aria-label="Player"
          placeholder="Player"
          value={form.player}
          onChange={set('player')}
          className={FIELD}
        />
        <input
          aria-label="Event"
          placeholder="Event"
          value={form.event}
          onChange={set('event')}
          className={FIELD}
        />
        <input
          aria-label="Opening"
          placeholder="Opening"
          value={form.opening}
          onChange={set('opening')}
          className={FIELD}
        />
        <input
          aria-label="ECO"
          placeholder="ECO (C67, C6, C)"
          value={form.eco}
          onChange={set('eco')}
          className={FIELD}
        />
        <input
          aria-label="From year"
          placeholder="From year"
          inputMode="numeric"
          value={form.from}
          onChange={set('from')}
          className={FIELD}
        />
        <input
          aria-label="To year"
          placeholder="To year"
          inputMode="numeric"
          value={form.to}
          onChange={set('to')}
          className={FIELD}
        />
        <select aria-label="Result" value={form.result} onChange={set('result')} className={FIELD}>
          <option value="">Any result</option>
          <option value="1-0">White won</option>
          <option value="1/2-1/2">Draw</option>
          <option value="0-1">Black won</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-fg-body">
          <input
            type="checkbox"
            checked={form.wc}
            onChange={(e) => setForm({ ...form, wc: e.target.checked })}
          />
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
