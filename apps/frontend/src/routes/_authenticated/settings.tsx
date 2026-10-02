import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import type { Preferences } from '#/lib/auth'
import { putPreferences } from '#/lib/server/api'
import { SettingsForm } from '#/components/settings'
import { SectionHeading, useCommand } from '#/components/ui'
import { pageTitle } from '#/lib/feedback'

/** Display preferences (user-preferences): each change is saved at once; a refusal puts the saved value back. */
export const Route = createFileRoute('/_authenticated/settings')({
  head: () => ({ meta: [{ title: pageTitle('Settings') }] }),
  component: SettingsPage,
})

function SettingsPage() {
  const { prefs: saved } = Route.useRouteContext()
  const router = useRouter()
  const [shown, setShown] = useState<Preferences>(saved)
  const saving = useCommand()

  async function change(next: Preferences) {
    setShown(next)
    const stored = await saving.run(() => putPreferences({ data: next }))
    if (!stored) {
      setShown(saved)
      return
    }
    // The Shell (board theme, site theme) and every board read the preferences from the router context.
    await router.invalidate()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">Settings</SectionHeading>
      <SettingsForm prefs={shown} error={saving.error} onChange={(next) => void change(next)} />
    </div>
  )
}
