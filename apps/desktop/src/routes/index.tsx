import { createFileRoute } from '@tanstack/react-router'
import { SectionHeading } from '@chess/ui'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <section className="flex flex-col gap-4">
      <SectionHeading size="xl">Play the computer</SectionHeading>
      <p className="text-fg-secondary">Games, analysis, training and the news, on this machine.</p>
    </section>
  )
}
