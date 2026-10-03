import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { TrainerColor } from '#/lib/trainer'
import { isColor } from '#/lib/trainer'
import { getTrainerFamilies } from '#/lib/server/api'
import { pageTitle } from '#/lib/feedback'
import { ColorSwitch, FamilyList } from '#/components/trainer'
import { Button, Panel, SectionHeading } from '#/components/ui'

/** The opening trainer (opening-trainer): the families of the named lines, searched, each with the member's progress. */
export const Route = createFileRoute('/_authenticated/trainer/')({
  validateSearch: (search: Record<string, unknown>): { color: TrainerColor; q?: string } => ({
    color: isColor(search['color']) ? search['color'] : 'white',
    ...(typeof search['q'] === 'string' && search['q'].trim() ? { q: search['q'].trim() } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getTrainerFamilies({ data: deps }),
  head: () => ({ meta: [{ title: pageTitle('Opening trainer') }] }),
  component: TrainerPage,
})

const FIELD =
  'min-w-0 flex-1 rounded-control border border-line-default bg-surface-inset px-3 py-2 text-fg-primary placeholder:text-fg-muted'

function TrainerPage() {
  const { color, q } = Route.useSearch()
  const families = Route.useLoaderData()
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <SectionHeading size="xl">Opening trainer</SectionHeading>
        <p className="m-0 text-sm text-fg-secondary">
          Pick an opening: the board plays the other side of its lines, you play yours. A line you
          know comes back less often; a line you miss comes back first.
        </p>
      </header>
      <Panel variant="filled" className="gap-3" testId="trainer-search">
        <ColorSwitch color={color} {...(q ? { q } : {})} />
        {/* A plain GET form: before hydration the browser submits it itself. */}
        <form
          method="get"
          action="/trainer"
          className="flex flex-wrap gap-3"
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
      <FamilyList families={families} color={color} />
    </div>
  )
}
