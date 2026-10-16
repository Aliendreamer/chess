import { useState } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { childrenAt, promote, remove, toInput } from '@chess/core'
import {
  AnalysisBoard,
  AppLink,
  Button,
  ErrorText,
  Panel,
  href,
  useAnalysis,
  useCommand,
  useMoveTree,
} from '@chess/ui'
import type { StudyView } from '@chess/ui'
import { loadStudy, saveStudy, studyAsPgn } from '#/lib/data/studies'

/**
 * A study (studies D7): the board, its move tree and the tools around it. Moves played on the board go into the tree;
 * Save keeps it, replayed, and a stale save is refused.
 */
export const Route = createFileRoute('/studies/$id')({
  loader: async ({ context: { app }, params }) => {
    const study = await loadStudy(app.db, params.id)
    if (!study) throw notFound()
    return study
  },
  component: StudyPage,
})

function StudyPage() {
  const study = Route.useLoaderData()
  return <Study key={study.id} loaded={study} />
}

function Study({ loaded }: { loaded: StudyView }) {
  const { app } = Route.useRouteContext()
  const [saved, setSaved] = useState(loaded)
  const [title, setTitle] = useState(loaded.title)
  const editor = useMoveTree(loaded.startFen, loaded.tree)
  const { tree, path, current } = editor
  const saving = useCommand()
  const [request] = useState(
    () => (input: Parameters<typeof app.evaluator.request>[0]) => app.evaluator.request(input),
  )
  const analysis = useAnalysis(request)
  const dirty =
    title !== saved.title || JSON.stringify(toInput(tree)) !== JSON.stringify(toInput(saved.tree))

  async function save() {
    const next = await saving.run(() =>
      saveStudy(app.db, { id: saved.id, title, tree: toInput(tree), version: saved.version }),
    )
    if (next) {
      setSaved(next)
      editor.setTree(next.tree)
    }
  }

  const hasVariations = childrenAt(tree, path.slice(0, -1)).length > 1

  return (
    <AnalysisBoard
      editor={editor}
      analysis={analysis}
      editable
      header={
        <header className="flex flex-col gap-1">
          <input
            aria-label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="rounded-control border border-line-default bg-surface-inset px-3 py-2 font-display text-display-xs text-fg-primary"
          />
          {saved.white && saved.black ? (
            <span className="text-sm text-fg-secondary">{`${saved.white} – ${saved.black}`}</span>
          ) : null}
        </header>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!current || !hasVariations}
          onClick={() => editor.setTree(promote(tree, path))}
        >
          Make main line
        </Button>
        <Button
          disabled={!current}
          onClick={() => {
            editor.setTree(remove(tree, path))
            editor.setPath(path.slice(0, -1))
          }}
        >
          Delete move
        </Button>
        <Button variant="primary" disabled={!dirty || saving.busy} onClick={() => void save()}>
          {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>
      {saving.error ? <ErrorText testId="study-error">{saving.error}</ErrorText> : null}
      <Panel variant="outlined" className="flex-row flex-wrap items-center justify-between gap-2">
        <Button
          size="sm"
          onClick={() =>
            void app.saveText(
              `${saved.title.replace(/[^\w -]+/g, '').trim() || 'study'}.pgn`,
              studyAsPgn(saved),
            )
          }
        >
          Save PGN
        </Button>
        <AppLink
          to={href(`/trainer/study/${saved.id}`, { color: 'white' })}
          className="text-sm"
          data-testid="study-train"
        >
          Train this study
        </AppLink>
      </Panel>
    </AnalysisBoard>
  )
}
