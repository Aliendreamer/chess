import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { StudyMove, StudyView, TreePath } from '#/lib/studies'
import { getStudy, postAnalysis, postShareStudy, putStudy } from '#/lib/server/api'
import {
  addMove,
  childrenAt,
  fenAt,
  lineEnd,
  nextPath,
  nodeAt,
  playMove,
  promote,
  remove,
  toInput,
} from '#/lib/studies'
import { scoreText, useAnalysis } from '#/lib/analysis'
import { clickSquare, legalTargets, needsPromotion } from '#/lib/moveInput'
import { Board, PromotionPicker } from '#/components/games'
import { AnalysisPanel, MoveTree } from '#/components/studies'
import { Button, ErrorText, Panel, SectionHeading, useCommand } from '#/components/ui'

/**
 * A study (studies D7): the board, its move tree and the tools around it. Moves played on the board go into the tree
 * (an existing continuation is followed, anything else becomes a variation); Save sends the tree and the server's
 * replayed tree replaces it. Only the owner edits; a shared study is read-only for others.
 */
export const Route = createFileRoute('/_authenticated/studies/$id')({
  loader: ({ params }) => getStudy({ data: params.id }),
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
  const [tree, setTree] = useState<Array<StudyMove>>(loaded.tree)
  const [title, setTitle] = useState(loaded.title)
  const [path, setPath] = useState<TreePath>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [link, setLink] = useState<string | null>(null)
  const saving = useCommand()
  const sharing = useCommand()
  const analysis = useAnalysis((input) => postAnalysis({ data: input }))
  const editable = saved.mine
  const dirty =
    title !== saved.title || JSON.stringify(toInput(tree)) !== JSON.stringify(toInput(saved.tree))

  const fen = fenAt(saved.startFen, tree, path)
  const current = nodeAt(tree, path)
  const side = fen.split(' ')[1] === 'b' ? 'b' : 'w'

  // The shareable URL needs the page's origin, which only the browser knows.
  useEffect(() => setLink(`${window.location.origin}/studies/${saved.id}`), [saved.id])

  // Arrow keys walk the line: back to the previous move, forward along the first continuation, Home and End.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') setPath((p) => p.slice(0, -1))
      else if (e.key === 'ArrowRight') setPath((p) => nextPath(tree, p) ?? p)
      else if (e.key === 'Home') setPath([])
      else if (e.key === 'End') setPath((p) => lineEnd(tree, p))
      else return
      e.preventDefault()
      setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tree])

  function play(from: string, to: string, piece?: string) {
    const move = playMove(fen, `${from}${to}${piece ?? ''}`)
    if (!move) return
    const next = addMove(tree, path, move)
    setTree(next.tree)
    setPath(next.path)
  }

  /** Plays an engine line from the current position into the tree: existing moves are followed, the rest added. */
  function playLine(moves: ReadonlyArray<StudyMove>) {
    let next = { tree, path }
    for (const move of moves) next = addMove(next.tree, next.path, move)
    setTree(next.tree)
    setPath(next.path)
  }

  function onSquareClick(square: string) {
    const result = clickSquare(fen, side, selected, square)
    setSelected(result.selected)
    if (!result.move) return
    if (needsPromotion(fen, result.move.from, result.move.to)) {
      setPromotion(result.move)
      return
    }
    play(result.move.from, result.move.to)
  }

  async function save() {
    const view = await saving.run(() =>
      putStudy({ data: { id: saved.id, title, tree: toInput(tree), version: saved.version } }),
    )
    if (view) {
      setSaved(view)
      setTree(view.tree) // the server's SAN and FEN replace ours
    }
  }

  async function share(shared: boolean) {
    const view = await sharing.run(() => postShareStudy({ data: { id: saved.id, shared } }))
    if (view) setSaved({ ...saved, shared: view.shared, version: view.version })
  }

  const lastMove = current ? { from: current.uci.slice(0, 2), to: current.uci.slice(2, 4) } : null
  const hasVariations = childrenAt(tree, path.slice(0, -1)).length > 1
  const scoreOf = (at: string) => {
    const best = analysis.evaluationOf(at)?.lines[0]
    return best ? scoreText(best) : null
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] items-start gap-8">
      <div className="flex max-w-(--board-max) flex-col gap-3">
        <Board
          fen={fen}
          orientation="white"
          lastMove={lastMove}
          selected={selected}
          targets={selected ? legalTargets(fen, selected) : []}
          {...(editable ? { onSquareClick } : {})}
        />
        {promotion ? (
          <PromotionPicker
            color={side === 'w' ? 'white' : 'black'}
            onPick={(piece) => {
              setPromotion(null)
              play(promotion.from, promotion.to, piece)
            }}
            onCancel={() => setPromotion(null)}
          />
        ) : null}
        <div className="flex gap-2" role="group" aria-label="Navigation">
          <Button aria-label="Start" onClick={() => setPath([])}>
            |◀
          </Button>
          <Button aria-label="Back" onClick={() => setPath(path.slice(0, -1))}>
            ◀
          </Button>
          <Button aria-label="Forward" onClick={() => setPath(nextPath(tree, path) ?? path)}>
            ▶
          </Button>
          <Button aria-label="End" onClick={() => setPath(lineEnd(tree, path))}>
            ▶|
          </Button>
        </div>
      </div>

      <div className="flex max-w-[420px] flex-col gap-4">
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
          <span className="text-sm text-fg-secondary">
            {[
              saved.white && saved.black ? `${saved.white} – ${saved.black}` : null,
              saved.result,
              editable ? null : `by ${saved.ownerName} · read-only`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </header>

        <MoveTree
          tree={tree}
          startFen={saved.startFen}
          current={path}
          onSelect={setPath}
          scoreOf={scoreOf}
        />

        <AnalysisPanel
          analysis={analysis}
          fen={fen}
          evaluation={analysis.evaluationOf(fen)}
          onPlayLine={editable ? playLine : undefined}
        />

        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!current || !hasVariations}
              onClick={() => setTree(promote(tree, path))}
            >
              Make main line
            </Button>
            <Button
              disabled={!current}
              onClick={() => {
                setTree(remove(tree, path))
                setPath(path.slice(0, -1))
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
      </div>
    </div>
  )
}
