import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Button,
  ColorSwitch,
  FamilyColumns,
  Panel,
  SectionHeading,
  TrainerSourceSwitch,
  TrainerStudyList,
  isColor,
} from '@chess/ui'
import type { TrainerColor } from '@chess/ui'
import { trainerFamilies, trainerStudies } from '#/lib/data/trainer'

/**
 * The opening trainer (opening-trainer): the families of the named lines, searched, each with the member's progress;
 * or, with `?source=studies`, the member's own studies (study-repertoire-trainer).
 */
export const Route = createFileRoute('/trainer/')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { color: TrainerColor; q?: string; source?: 'studies' } => ({
    color: isColor(search['color']) ? search['color'] : 'white',
    ...(typeof search['q'] === 'string' && search['q'].trim() ? { q: search['q'].trim() } : {}),
    ...(search['source'] === 'studies' ? { source: 'studies' as const } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { app }, deps }) =>
    deps.source === 'studies'
      ? { studies: await trainerStudies(app.db, deps.color), families: null }
      : { studies: null, families: await trainerFamilies(app.db, deps.color, deps.q) },
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
          <section
            className="flex flex-col gap-3 shell:min-h-0 shell:flex-1"
            aria-label="My studies"
          >
            <TrainerStudyList studies={studies} color={color} />
          </section>
        </>
      ) : (
        <>
          <Panel
            variant="filled"
            className="gap-3 shell:flex-row shell:items-center"
            testId="trainer-search"
          >
            <ColorSwitch color={color} {...(q ? { q } : {})} />
            <form
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
