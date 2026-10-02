import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { StudyView } from '#/lib/studies'
import { getStudy, postAnalysis, postShareStudy, putStudy } from '#/lib/server/api'
import { childrenAt, promote, remove, studyByline, toInput, useMoveTree } from '#/lib/studies'
import { useAnalysis } from '#/lib/analysis'
import { AnalysisBoard } from '#/components/studies'
import { Button, ErrorText, Panel, SectionHeading, useCommand } from '#/components/ui'
import { pageTitle } from '#/lib/feedback'

/**
 * A study (studies D7): the board, its move tree and the tools around it. Moves played on the board go into the tree
 * (an existing continuation is followed, anything else becomes a variation); Save sends the tree and the server's
 * replayed tree replaces it. Only the owner edits; a shared study is read-only for others.
 */
export const Route = createFileRoute('/_authenticated/studies/$id')({
  loader: ({ params }) => getStudy({ data: params.id }),
  head: ({ loaderData }) => ({ meta: [{ title: pageTitle(loaderData?.title ?? 'Study') }] }),
  component: StudyPage,
})

function StudyPage() {
  const { id } = Route.useParams()
  const study = Route.useLoaderData()
  if (!study) {
    return (
      <Panel variant="filled" className="max-w-xl gap-3 p-6">
        <SectionHeading size="xl">No such study</SectionHeading>
        <p className="m-0 text-fg-body">The link is wrong, or the study is not shared with you.</p>
        <Link to="/studies">Your studies</Link>
      </Panel>
    )
  }
  return <Study key={id} loaded={study} />
}

function Study({ loaded }: { loaded: StudyView }) {
  const [saved, setSaved] = useState(loaded)
  const [title, setTitle] = useState(loaded.title)
  const [link, setLink] = useState<string | null>(null)
  const editor = useMoveTree(loaded.startFen, loaded.tree)
  const { tree, path, current } = editor
  const saving = useCommand()
  const sharing = useCommand()
  const analysis = useAnalysis((input) => postAnalysis({ data: input }))
  const editable = saved.mine
  const dirty =
    title !== saved.title || JSON.stringify(toInput(tree)) !== JSON.stringify(toInput(saved.tree))

  // The shareable URL needs the page's origin, which only the browser knows.
  useEffect(() => setLink(`${window.location.origin}/studies/${saved.id}`), [saved.id])

  async function save() {
    const view = await saving.run(() =>
      putStudy({ data: { id: saved.id, title, tree: toInput(tree), version: saved.version } }),
    )
    if (view) {
      setSaved(view)
      editor.setTree(view.tree) // the server's SAN and FEN replace ours
    }
  }

  async function share(shared: boolean) {
    const view = await sharing.run(() => postShareStudy({ data: { id: saved.id, shared } }))
    if (view) setSaved({ ...saved, shared: view.shared, version: view.version })
  }

  const hasVariations = childrenAt(tree, path.slice(0, -1)).length > 1

  return (
    <AnalysisBoard
      editor={editor}
      analysis={analysis}
      editable={editable}
      header={
        <header className="flex flex-col gap-1">
          {editable ? (
            <input
              aria-label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="rounded-control border border-line-default bg-surface-inset px-3 py-2 font-display text-display-xs text-fg-primary"
            />
          ) : (
            <SectionHeading size="xl">{saved.title}</SectionHeading>
          )}
          <span className="text-sm text-fg-secondary">{studyByline(saved, editable)}</span>
        </header>
      }
    >
      {editable ? (
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
      ) : null}
      {saving.error ? <ErrorText testId="study-error">{saving.error}</ErrorText> : null}

      <Panel variant="outlined" className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a href={`/pgn/study/${saved.id}`} download className="text-sm" data-testid="study-pgn">
            Download PGN
          </a>
          {editable ? (
            <Button disabled={sharing.busy} onClick={() => void share(!saved.shared)}>
              {saved.shared ? 'Stop sharing' : 'Share'}
            </Button>
          ) : null}
        </div>
        {editable && saved.shared ? (
          <code
            className="truncate rounded-control bg-surface-inset px-3 py-2 font-mono text-sm text-fg-primary"
            data-testid="study-link"
          >
            {link ?? `/studies/${saved.id}`}
          </code>
        ) : null}
        {sharing.error ? <ErrorText>{sharing.error}</ErrorText> : null}
      </Panel>
    </AnalysisBoard>
  )
}
