import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import { startServices } from './lib/app'
import './styles.css'

const root = createRoot(document.getElementById('app')!)
root.render(<p className="p-10 text-fg-secondary">Starting…</p>)

// The database opens and the openings load before the first page; a failure is shown, not a blank window.
startServices().then(
  (app) =>
    root.render(
      <StrictMode>
        <RouterProvider router={getRouter(app)} />
      </StrictMode>,
    ),
  (error: unknown) =>
    root.render(
      <p className="p-10 text-status-loss">
        The app could not start: {error instanceof Error ? error.message : String(error)}
      </p>,
    ),
)
