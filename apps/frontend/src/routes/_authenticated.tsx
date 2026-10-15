import { useEffect, useState } from 'react'
import { Outlet, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import type { Challenge } from '#/lib/members'
import type { Me } from '#/lib/auth'
import { getMe, getPreferences, postChallengeAnswer } from '#/lib/server/api'
import { useLiveTopic } from '#/lib/live'
import { isUserView, openChallenges, useNow } from '#/lib/members'
import { Shell } from '#/components/layout'
import { ChallengeBanner } from '#/components/members'

/**
 * Pathless layout: the SSR gate. Anonymous requests never render a child — they are 302'd to the login
 * proxy with the current location as returnTo. `me` and the user's display preferences (user-preferences) go into
 * router context for every child, so the server-rendered page already uses them.
 * This is UX; the API's [Authorize] remains the real boundary (server functions forward the cookie).
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const [me, prefs] = await Promise.all([getMe(), getPreferences()])
    if (!me) {
      throw redirect({ href: `/api/auth/login?returnTo=${encodeURIComponent(location.href)}` })
    }
    return { me, prefs }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const { me, prefs } = Route.useRouteContext()
  return (
    <Shell me={me} prefs={prefs} banner={<Challenges me={me} />}>
      <Outlet />
    </Shell>
  )
}

/**
 * Every page keeps my `user:{me}` topic open: it makes me online (club-members D1) and brings the challenges to me
 * (challenges D2). An expired or answered challenge leaves the banner at once, before its frame arrives.
 */
const ERROR_SHOWN_MS = 6000

function Challenges({ me }: { me: Me }) {
  const user = useLiveTopic({
    kind: 'user',
    id: String(me.id),
    initial: undefined,
    isPayload: isUserView,
  })
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set())
  const pending = user.frame?.payload.challenges.length ?? 0
  const now = useNow(1000, pending > 0)
  const challenges = openChallenges(user.frame?.payload, now, answered)
  const [busy, setBusy] = useState(false)
  // A refusal (it ran out, it was cancelled) is said for a few seconds: the banner is not a page to come back to.
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(() => setError(null), ERROR_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [error])
  const navigate = useNavigate()

  async function answer(challenge: Challenge, kind: 'accept' | 'decline') {
    setBusy(true)
    setError(null)
    try {
      const outcome = await postChallengeAnswer({
        data: { inviteId: challenge.inviteId, answer: kind },
      })
      // Answered or refused: either way it is not mine to answer any more.
      setAnswered((prev) => new Set(prev).add(challenge.inviteId))
      if (!outcome.ok) setError(outcome.error)
      else if (outcome.view.status === 'accepted' && outcome.view.gameId) {
        await navigate({ to: '/games/$id', params: { id: outcome.view.gameId } })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ChallengeBanner
      challenges={challenges}
      now={now}
      busy={busy}
      error={error}
      onAccept={(c) => void answer(c, 'accept')}
      onDecline={(c) => void answer(c, 'decline')}
    />
  )
}
