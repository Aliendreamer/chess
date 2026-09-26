import { Link, createFileRoute } from '@tanstack/react-router'
import { Panel, SectionHeading } from '#/components/core/Panel'

export const Route = createFileRoute('/_authenticated/forbidden')({
  component: Forbidden,
})

function Forbidden() {
  return (
    <Panel variant="filled" className="max-w-xl gap-3 p-6">
      <SectionHeading size="xl">Not allowed</SectionHeading>
      <p className="text-fg-body">Your account does not have the role this page needs.</p>
      <Link to="/">Back home</Link>
    </Panel>
  )
}
