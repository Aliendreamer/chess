import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, LoadMore, Panel, SectionHeading } from '@chess/ui'
import type { StudyTraining, TrainerColor } from '#/lib/trainer'
import type { CursorPage } from '#/lib/play'
import { isColor } from '#/lib/trainer'
import { useLoadMore } from '#/lib/play'
import { getTrainerFamilies, getTrainerStudies } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import { ColorSwitch, FamilyColumns, StudyList, TrainerSourceSwitch } from '#/components/trainer'

const PAGE = 30

/**
 * The opening trainer (opening-trainer): the families of the named lines, searched, each with the member's progress;
 * or, with `?source=studies`, the member's own studies (study-repertoire-trainer).
 */
export const Route = createFileRoute('/_authenticated/trainer/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { color: TrainerColor; q?: string; source?: 'studies' } => ({
    color: isColor(search['color']) ? search['color'] : 'white',
    ...(typeof search['q'] === 'string' && search['q'].trim() ? { q: search['q'].trim() } : {}),
    ...(search['source'] === 'studies' ? { source: 'studies' as const } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) =>
    deps.source === 'studies'
      ? {
          studies: await getTrainerStudies({ data: { color: deps.color, limit: PAGE } }),
          families: null,
        }
      : { studies: null, families: await getTrainerFamilies({ data: deps }) },
  head: () => ({ meta: [{ title: pageTitle('Opening trainer') }] }),
  component: TrainerPage,
})

const FIELD =
  'min-w-0 flex-1 rounded-control border border-line-default bg-surface-inset px-3 py-2 text-fg-primary placeholder:text-fg-muted'

function TrainerPage() {
  const { color, q, source } = Route.useSearch()
  const { families, studies } = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <div className="flex min-w-0 flex-col gap-4 shell:h-full" data-layout="wide fill">
      <header className="flex flex-col gap-2">
        <SectionHeading size="xl">Opening trainer</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary">
          Pick an opening, or one of your studies: the board plays the other side of its lines, you
          play yours. A line you know comes back less often; a line you miss comes back first.
        </p>
        <TrainerSourceSwitch source={source === 'studies' ? 'studies' : 'named'} color={color} />
      </header>
      {studies ? (
        <>
          <ColorSwitch color={color} studies />
          <Studies key={color} first={studies} color={color} />
        </>
      ) : (
        <>
          <Panel
            variant="filled"
            className="gap-3 shell:flex-row shell:items-center"
            testId="trainer-search"
          >
            <ColorSwitch color={color} {...(q ? { q } : {})} />
            {/* A plain GET form: before hydration the browser submits it itself. */}
            <form
              method="get"
              action="/trainer"
              className="flex flex-1 flex-wrap gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                const text = String(new FormData(e.currentTarget).get('q') ?? '').trim()
                void navigate({ to: '/trainer', search: { color, ...(text ? { q: text } : {}) } })
              }}
            >
              <input type="hidden" name="color" value={color} />
              <input
                key={q ?? ''}
                name="q"
                aria-label="Opening"
                placeholder="Opening or variation (najdorf, berlin…)"
                defaultValue={q}
                className={FIELD}
              />
              <Button type="submit">Search</Button>
            </form>
          </Panel>
          <FamilyColumns families={families} color={color} />
        </>
      )}
    </div>
  )
}

function Studies({ first, color }: { first: CursorPage<StudyTraining>; color: TrainerColor }) {
  const pager = useLoadMore(first, (cursor) =>
    getTrainerStudies({ data: { color, limit: PAGE, cursor } }),
  )
  return (
    <section className="flex flex-col gap-3 shell:min-h-0 shell:flex-1" aria-label="My studies">
      <StudyList studies={pager.items} color={color} />
      <LoadMore pager={pager} />
    </section>
  )
}
