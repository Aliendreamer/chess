import { memorySql } from '@chess/local/testing'
import type { AppServices } from '#/lib/app'

// The node-only helpers live with the data layer; re-exported so the desktop's tests keep one import.
export { memorySql, openingFiles, processChannel } from '@chess/local/testing'

/** Services for page tests: an in-memory database, a scripted engine, and dialogs that record what they were given. */
export async function fakeServices(moves: Array<string> = []): Promise<
  AppServices & {
    saved: Array<{ name: string; text: string }>
    opened: Array<string>
    close: () => void
  }
> {
  const { openDb } = await import('@chess/local')
  const { AnalysisQueue, EngineSupervisor } = await import('@chess/local')
  const sql = memorySql()
  const db = await openDb(sql)
  const idle = new EngineSupervisor(() => Promise.reject(new Error('no engine in this test')))
  const saved: Array<{ name: string; text: string }> = []
  const opened: Array<string> = []
  const { Evaluator } = await import('@chess/local')
  const queue = new AnalysisQueue(idle)
  return {
    db,
    player: { bestMove: () => Promise.resolve(moves.shift() ?? null) },
    analysis: queue,
    evaluator: new Evaluator(db, queue),
    engines: { play: idle, analysis: idle },
    saveText: (name, text) => {
      saved.push({ name, text })
      return Promise.resolve(true)
    },
    openText: () => Promise.resolve(null),
    toggleFullscreen: () => Promise.resolve(),
    resizeWindow: () => Promise.resolve(),
    hasTitleBar: () => Promise.resolve(true),
    minimizeWindow: () => Promise.resolve(),
    closeWindow: () => Promise.resolve(),
    openLink: (url) => {
      opened.push(url)
      return Promise.resolve()
    },
    fetchText: () => Promise.reject(new Error('offline')),
    backups: {
      chooseSave: () => Promise.resolve(null),
      chooseOpen: () => Promise.resolve(null),
      open: (path) => Promise.resolve(memorySql(path)),
      asidePath: async () => {
        const { mkdtempSync } = await import('node:fs')
        const { tmpdir } = await import('node:os')
        const { join } = await import('node:path')
        return join(mkdtempSync(join(tmpdir(), 'chess-aside-')), 'chess.db.before-restore')
      },
    },
    opened,
    saved,
    close: () => sql.close(),
  }
}

/** The whole app at `path`, on a memory history, with the given services. */
export async function renderApp(path: string, app: AppServices) {
  const { render } = await import('@testing-library/react')
  const { RouterProvider, createMemoryHistory, createRouter } =
    await import('@tanstack/react-router')
  const { routeTree } = await import('#/routeTree.gen')
  const router = createRouter({
    routeTree,
    context: { app },
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  return { router, ...render(<RouterProvider router={router} />) }
}
