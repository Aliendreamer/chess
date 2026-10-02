import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { ParsedGame } from '#/lib/studies'
import { getGameMoves, getGameSummary, postAnalysis, postCreateStudies } from '#/lib/server/api'
import {
  STANDARD_START,
  analysisTitle,
  fromGame,
  fromInput,
  isFen,
  lineEnd,
  parsePgn,
  toInput,
  useMoveTree,
} from '#/lib/studies'
import { useAnalysis } from '#/lib/analysis'
import { pageTitle } from '#/lib/feedback'
import { AnalysisBoard } from '#/components/studies'
import { Button, ErrorText, Panel, SectionHeading, useCommand } from '#/components/ui'

/**
 * The open analysis board (analysis-board): any position or game with the study tree and the engine, nothing saved
 * until Save as study. Starts from `?fen=`, `?game={id}`, or what is pasted on the page.
 */
export const Route = createFileRoute('/_authenticated/analysis')({
  validateSearch: (search: Record<string, unknown>): { fen?: string; game?: string } => ({
    ...(typeof search['fen'] === 'string' ? { fen: search['fen'] } : {}),
    ...(typeof search['game'] === 'string' ? { game: search['game'] } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    if (deps.game) {
      const [moves, summary] = await Promise.all([
        getGameMoves({ data: deps.game }),
        getGameSummary({ data: deps.game }),
      ])
      // Fair play: a game still being played is never put beside the engine through this link.
      if (summary?.status !== 'ended') {
        return {
          startFen: STANDARD_START,
          tree: [],
          players: undefined,
          error: 'That game is still being played (or not found): it can be analysed once it ends.',
        }
      }
      return {
        startFen: STANDARD_START,
        tree: fromGame(moves),
        players: { white: summary.white, black: summary.black },
        error: null,
      }
    }
    if (deps.fen !== undefined && !isFen(deps.fen)) {
      return {
        startFen: STANDARD_START,
        tree: [],
        players: undefined,
        error: 'That link has no legal position.',
      }
    }
    return { startFen: deps.fen ?? STANDARD_START, tree: [], players: undefined, error: null }
  },
  head: () => ({ meta: [{ title: pageTitle('Analysis') }] }),
  component: AnalysisPage,
})

function AnalysisPage() {
  const start = Route.useLoaderData()
  // A new starting point from the link starts a new board.
  return (
    <Analysis
      key={`${start.startFen}|${start.tree.length}|${start.players?.white ?? ''}`}
      start={start}
    />
  )
}

function Analysis({ start }: { start: ReturnType<typeof Route.useLoaderData> }) {
  const editor = useMoveTree(start.startFen, start.tree, lineEnd(start.tree, []))
  const analysis = useAnalysis((input) => postAnalysis({ data: input }))
  const navigate = useNavigate()
  const saving = useCommand()
  const [players, setPlayers] = useState(start.players)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(start.error)
  const [choices, setChoices] = useState<Array<ParsedGame & { ok: true }>>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => setCopied(false), [editor.fen])

  /** A FEN replaces the position; a PGN its moves (one game at once, several offered to pick from). */
  function load(text: string) {
    const trimmed = text.trim()
    setChoices([])
    if (isFen(trimmed)) {
      editor.reset(trimmed, [])
      setPlayers(undefined)
      setPasteError(null)
      return
    }
    const games = parsePgn(trimmed).filter((g): g is ParsedGame & { ok: true } => g.ok)
    if (games.length === 0) {
      setPasteError('That is neither a legal FEN nor a PGN game.')
      return
    }
    setPasteError(null)
    if (games.length === 1) open(games[0]!)
    else setChoices(games)
  }

  function open(game: ParsedGame & { ok: true }) {
    const startFen = game.study.startFen ?? STANDARD_START
    const tree = fromInput(startFen, game.study.tree)
    editor.reset(startFen, tree, lineEnd(tree, []))
    setPlayers(
      game.study.white && game.study.black
        ? { white: game.study.white, black: game.study.black }
        : undefined,
    )
    setChoices([])
  }

  async function save() {
    const result = await saving.run(() =>
      postCreateStudies({
        data: [
          { title: analysisTitle(players), startFen: editor.startFen, tree: toInput(editor.tree) },
        ],
      }),
    )
    const created = result?.created[0]
    if (created) void navigate({ to: '/studies/$id', params: { id: created.id } })
  }

  async function copyLink() {
    const url = `${window.location.origin}/analysis?fen=${encodeURIComponent(editor.fen)}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <AnalysisBoard
      editor={editor}
      analysis={analysis}
      editable
      header={
        <header className="flex flex-col gap-1">
          <SectionHeading size="xl">Analysis</SectionHeading>
          <span className="text-sm text-fg-secondary" data-testid="analysis-source">
            {players
              ? `${players.white} vs ${players.black}`
              : 'Not saved until you save it as a study.'}
          </span>
        </header>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={saving.busy} onClick={() => void save()}>
          Save as study
        </Button>
        <Button onClick={() => void copyLink()}>{copied ? 'Link copied' : 'Copy link'}</Button>
      </div>
      {saving.error ? <ErrorText>{saving.error}</ErrorText> : null}

      <Panel variant="outlined" title="Start from" className="gap-3">
        <textarea
          aria-label="FEN or PGN"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={3}
          placeholder="Paste a FEN or a PGN"
          className="w-full rounded-control border border-line-default bg-surface-inset p-3 font-mono text-sm text-fg-primary"
        />
        <div className="flex flex-wrap gap-2">
          <Button disabled={pasted.trim() === ''} onClick={() => load(pasted)}>
            Load
          </Button>
          <Button
            onClick={() => {
              editor.reset(STANDARD_START, [])
              setPlayers(undefined)
              setPasteError(null)
            }}
          >
            Start position
          </Button>
        </div>
        {pasteError ? <ErrorText testId="paste-error">{pasteError}</ErrorText> : null}
        {choices.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Games in the PGN">
            {choices.map((g, i) => (
              <li key={i}>
                <Button size="sm" onClick={() => open(g)}>
                  {g.study.title}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
    </AnalysisBoard>
  )
}
