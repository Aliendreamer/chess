import { createFileRoute } from '@tanstack/react-router'
import { SectionHeading } from '#/components/core/Panel'

/** Home. Quick pairing, play a friend and recent games arrive with part1-ui group 3. */
export const Route = createFileRoute('/_authenticated/')({
  component: HomePage,
})

function HomePage() {
  const { me } = Route.useRouteContext()
  return (
    <div className="flex flex-col gap-8">
      <header>
        <SectionHeading size="xl">{`Hello, ${me.username}.`}</SectionHeading>
      </header>
    </div>
  )
}
