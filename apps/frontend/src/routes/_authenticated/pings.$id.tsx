import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getPingLive, postPing } from '#/lib/server/api'
import { PingFeed } from '#/components/PingFeed'
import { Button } from '#/components/core/Button'

/**
 * The Part 0 spine, end to end in one page: the loader reads the sharded actor through the BFF
 * (SSR, no spinner), the form sends a command, and the feed watches the same entity over the SSR
 * WebSocket relay. The browser only ever speaks to `app.`.
 */
export const Route = createFileRoute('/_authenticated/pings/$id')({
  loader: ({ params }) => getPingLive({ data: params.id }),
  component: PingPage,
})

function PingPage() {
  const { id } = Route.useParams()
  const state = Route.useLoaderData()
  const router = useRouter()
  const [text, setText] = useState('hello')
  const [sending, setSending] = useState(false)

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSending(true)
    try {
      await postPing({ data: { id, text } })
      await router.invalidate()
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="sm:col-span-2">
        <h1 className="m-0 font-display text-display-md font-normal">
          Ping <span className="font-mono">{id}</span>
        </h1>
        <p className="mt-1 text-sm text-fg-secondary">
          Server-rendered from the actor; updated live through the SSR relay.
        </p>
      </section>

      <form className="flex items-start gap-2" onSubmit={send}>
        <label className="sr-only" htmlFor="ping-text">
          Ping text
        </label>
        <input
          id="ping-text"
          name="text"
          value={text}
          maxLength={200}
          required
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-control border border-line-default bg-surface-inset px-3 py-2 text-sm text-fg-primary"
        />
        <Button type="submit" variant="primary" disabled={sending} data-testid="ping-submit">
          Ping
        </Button>
      </form>

      <PingFeed id={id} initial={state} />
    </div>
  )
}
