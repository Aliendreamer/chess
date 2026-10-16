import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { DEFAULT_PREFERENCES } from '@chess/core'
import {
  AppLink,
  Button,
  Chip,
  ErrorText,
  Panel,
  SectionHeading,
  SettingsForm,
  useCommand,
} from '@chess/ui'
import type { Preferences } from '@chess/core'
import { FEEDS, enabledSources, setSourceEnabled } from '#/lib/data/news'
import { getSetting, setSetting } from '#/lib/data/settings'
import { backupTo, restoreFrom } from '#/lib/data/backup'

/** The app's settings (user-preferences, desktop-app): applied at once and kept between starts. */
export const Route = createFileRoute('/settings')({
  loader: async ({ context: { app } }) => ({
    prefs: {
      ...DEFAULT_PREFERENCES,
      ...(await getSetting<Preferences>(app.db, 'preferences', DEFAULT_PREFERENCES)),
    },
    miner: await getSetting(app.db, 'training.miner', true),
    sources: await enabledSources(app.db),
  }),
  component: SettingsPage,
})

function SettingsPage() {
  const { app } = Route.useRouteContext()
  const saved = Route.useLoaderData()
  const router = useRouter()
  const [shown, setShown] = useState<Preferences>(saved.prefs)
  const saving = useCommand()

  async function change(next: Preferences) {
    setShown(next)
    await saving.run(async () => {
      await setSetting(app.db, 'preferences', next)
      return { ok: true as const, view: next }
    })
    // The Shell (board theme, site theme) and every board read the preferences from the root route.
    await router.invalidate()
  }

  async function toggle(write: () => Promise<void>) {
    await write()
    await router.invalidate()
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading size="xl">Settings</SectionHeading>
      <SettingsForm prefs={shown} error={saving.error} onChange={(next) => void change(next)} />
      <div className="grid grid-cols-2 items-start gap-8">
        <Panel title="Training" className="gap-3">
          <p className="m-0 text-sm text-fg-secondary">
            The app looks for critical moments in your library's games in the background, when the
            engine is free.
          </p>
          <div className="flex gap-2" role="group" aria-label="Find critical moments">
            <Chip
              selected={saved.miner}
              onClick={() => void toggle(() => setSetting(app.db, 'training.miner', true))}
            >
              On
            </Chip>
            <Chip
              selected={!saved.miner}
              onClick={() => void toggle(() => setSetting(app.db, 'training.miner', false))}
            >
              Off
            </Chip>
          </div>
        </Panel>
        <Panel title="News" className="gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="News sources">
            {[...FEEDS, { id: 'events', name: 'Tournaments' }].map((s) => {
              const on = saved.sources.includes(s.id)
              return (
                <Chip
                  key={s.id}
                  selected={on}
                  onClick={() => void toggle(() => setSourceEnabled(app.db, s.id, !on))}
                >
                  {s.name}
                </Chip>
              )
            })}
          </div>
        </Panel>
      </div>
      <BackupPanel />
      <AppLink to="/about" className="text-sm text-fg-accent">
        About this app
      </AppLink>
    </div>
  )
}

/** Backup and restore (desktop-app D10): all the data to one file, and back; a restore asks first. */
function BackupPanel() {
  const { app } = Route.useRouteContext()
  const router = useRouter()
  const working = useCommand()
  const [message, setMessage] = useState<string | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)

  async function backup() {
    const path = await app.backups.chooseSave(
      `chess-${new Date().toISOString().slice(0, 10)}.chessbackup`,
    )
    if (!path) return
    const done = await working.run(async () => {
      await backupTo(app.db, path)
      return { ok: true as const, view: path }
    })
    if (done) setMessage(`Backed up to ${done}.`)
  }

  async function restore(path: string) {
    setRestoring(null)
    const done = await working.run(async () =>
      restoreFrom(
        app.db,
        { path, open: () => app.backups.open(path) },
        await app.backups.asidePath(),
      ),
    )
    if (done) {
      setMessage('Restored. Your previous data was kept beside the database.')
      await router.invalidate()
    }
  }

  return (
    <Panel title="Backup" className="gap-3" testId="backup-panel">
      <p className="m-0 text-sm text-fg-secondary">
        Everything — games, studies, progress, library, news and settings — in one file, to keep or
        to move to another computer.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={working.busy} onClick={() => void backup()}>
          Back up…
        </Button>
        <Button
          disabled={working.busy}
          onClick={() => void app.backups.chooseOpen().then((path) => path && setRestoring(path))}
        >
          Restore…
        </Button>
      </div>
      {restoring ? (
        <div
          className="flex flex-col gap-2 rounded-card border border-line-accent p-3"
          role="alertdialog"
          aria-label="Restore"
        >
          <p className="m-0 text-sm text-fg-primary">
            This replaces all your data with the backup's. Your current data is kept aside first.
          </p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => void restore(restoring)}>
              Replace my data
            </Button>
            <Button onClick={() => setRestoring(null)}>Cancel</Button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p className="m-0 text-sm text-fg-secondary" role="status">
          {message}
        </p>
      ) : null}
      {working.error ? <ErrorText>{working.error}</ErrorText> : null}
    </Panel>
  )
}
