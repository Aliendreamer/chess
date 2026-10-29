import { useEffect, useState } from 'react'
import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import type { RouterContext } from '#/lib/app'
import { Shell } from '#/components/layout'
import { getPreferences } from '#/lib/data/settings'

export const Route = createRootRouteWithContext<RouterContext>()({
  // The player's display settings, for the Shell (board and site theme) and every board (animation, coordinates,
  // the engine switches).
  loader: ({ context: { app } }) => getPreferences(app.db),
  component: Root,
})

function Root() {
  const { app } = Route.useRouteContext()
  const prefs = Route.useLoaderData()
  // F11 switches full screen, as in a browser (the window has no such key of its own).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'F11') return
      event.preventDefault()
      void app.toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app])
  // Without a system title bar (Linux), the rail carries minimize and close.
  const [titleBar, setTitleBar] = useState(true)
  useEffect(() => {
    void app
      .hasTitleBar()
      .then(setTitleBar)
      .catch(() => undefined)
  }, [app])
  return (
    <Shell
      prefs={prefs}
      onExternalLink={(url) => void app.openLink(url)}
      onFullscreen={() => void app.toggleFullscreen()}
      onResize={(change) => void app.resizeWindow(change)}
      {...(titleBar
        ? {}
        : {
            windowButtons: {
              onMinimize: () => void app.minimizeWindow(),
              onClose: () => void app.closeWindow(),
            },
          })}
    >
      <Outlet />
    </Shell>
  )
}
