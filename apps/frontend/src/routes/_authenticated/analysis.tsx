import { useEffect, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  STANDARD_START,
  fenAt,
  fromGame,
  fromInput,
  isFen,
  lineEnd,
  parsePgn,
  playMove,
  positionKey,
  toInput,
  uciLine,
} from '@chess/core'
import { Button, ErrorText, Panel, SectionHeading, useAdoptTyped, useCommand } from '@chess/ui'
import type { ParsedGame } from '@chess/core'
import type { LibrarySource } from '#/lib/library'
import {
  getFinishedGame,
  getLibraryGame,
  getLibraryPosition,
  getOpening,
  postAnalysis,
  postCreateStudies,
} from '#/lib/server/api'
import { analysisTitle, useMoveTree } from '#/lib/studies'
import { useAnalysis } from '#/lib/analysis'
import {
  BROADCAST_SOURCE,
  isLibrarySource,
  lichessUrl,
  useLibraryPosition,
  useOpeningName,
} from '#/lib/library'
import { PositionPanel } from '#/components/library'
import { pageTitle } from '#/lib/feedback'
import { AnalysisBoard } from '#/components/studies'

/**
 * The open analysis board (analysis-board): any position or game with the study tree and the engine, nothing saved
 * until Save as study. Starts from `?fen=`, `?game={id}`, or what is pasted on the page.
 */
export const Route = createFileRoute('/_authenticated/analysis')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { fen?: string; game?: string; library?: string; ply?: number; src?: LibrarySource } => ({
    ...(typeof search['fen'] === 'string' ? { fen: search['fen'] } : {}),
    ...(typeof search['game'] === 'string' ? { game: search['game'] } : {}),
    ...(typeof search['library'] === 'string' ? { library: search['library'] } : {}),
    ...(typeof search['ply'] === 'number' && Number.isInteger(search['ply']) && search['ply'] >= 0
      ? { ply: search['ply'] }
      : {}),
    // The explorer's source (broadcast-explorer D8); `all` is the default and stays out of the address.
    ...(isLibrarySource(search['src']) && search['src'] !== 'all' ? { src: search['src'] } : {}),
  }),
  // The source only filters the panel: switching it must not reload the board.
  loaderDeps: ({ search: { fen, game, library, ply } }) => ({ fen, game, library, ply }),
  loader: async ({ deps }) => {
    if (deps.library) {
      const found = await getLibraryGame({ data: deps.library }).catch(() => null)
      if (!found) {
        return {
          startFen: STANDARD_START,
          tree: [],
          players: undefined,
          error: 'No such library game.',
        }
      }
      const tree = fromInput(STANDARD_START, uciLine(found.moves))
      const plies = Math.min(deps.ply ?? found.moves.length, found.moves.length)
      return {
        startFen: STANDARD_START,
        tree,
        path: Array.from({ length: plies }, () => 0),
        players: { white: found.game.white, black: found.game.black },
        library: found.game,
        // Rendered as a link: only a lichess page of a broadcast game.
        librarySourceRef:
          found.game.source === BROADCAST_SOURCE ? lichessUrl(found.sourceRef) : null,
        error: null,
      }
    }
    if (deps.game) {
      // Fair play: a game still being played is never put beside the engine through this link.
      const game = await getFinishedGame({ data: deps.game }).catch(() => null)
      return game
        ? {
            startFen: STANDARD_START,
            tree: fromGame(game.moves),
            players: game.players,
            error: null,
          }
        : {
            startFen: STANDARD_START,
            tree: [],
            players: undefined,
            error:
              'That game is still being played (or not found): it can be analysed once it ends.',
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

/** Defined once, so the hooks' effects do not restart on every render. */
const loadOpening = (key: string) => getOpening({ data: key })
const loadPosition = (key: string, source: LibrarySource) =>
  getLibraryPosition({ data: { key, source } })

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
  const editor = useMoveTree(start.startFen, start.tree, start.path ?? lineEnd(start.tree, []))
  // The line's positions (start excluded) name the opening; the last one finds the library's games.
  const keys = editor.path.map((_, i) =>
    positionKey(fenAt(editor.startFen, editor.tree, editor.path.slice(0, i + 1))),
  )
  const opening = useOpeningName(keys, loadOpening)
  const source = Route.useSearch({ select: (search) => search.src ?? 'all' })
  const atPosition = useLibraryPosition(positionKey(editor.fen), source, loadPosition)
  const analysis = useAnalysis((input) => postAnalysis({ data: input }))
  const navigate = useNavigate()
  const saving = useCommand()
  const [players, setPlayers] = useState(start.players)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(start.error)
  const [choices, setChoices] = useState<Array<ParsedGame & { ok: true }>>([])
  const [copied, setCopied] = useState(false)
  const pasteBox = useAdoptTyped<HTMLTextAreaElement>(setPasted)

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
      aside={
        atPosition ? (
          <PositionPanel
            position={atPosition}
            fen={editor.fen}
            onPlay={(uci) => {
              const move = playMove(editor.fen, uci)
              if (move) editor.playLine([move])
            }}
            source={source}
            onSource={(next) =>
              void navigate({
                to: '/analysis',
                search: (prev) => {
                  const rest = { ...prev }
                  delete rest.src
                  return next === 'all' ? rest : { ...rest, src: next }
                },
                replace: true,
              })
            }
          />
        ) : null
      }
      header={
        <header className="flex flex-col gap-1">
          <SectionHeading size="xl">Analysis</SectionHeading>
          <span className="text-sm text-fg-secondary" data-testid="analysis-source">
            {players
              ? `${players.white} vs ${players.black}`
              : 'Not saved until you save it as a study.'}
          </span>
          {start.library ? (
            <span className="text-xs text-fg-muted" data-testid="library-attribution">
              {[
                start.library.event,
                start.library.year,
                `Source: ${start.library.source} — ${start.library.licence}`,
              ]
                .filter(Boolean)
                .join(' · ')}
              {start.librarySourceRef ? (
                <>
                  {' · '}
                  <a
                    href={start.librarySourceRef}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-fg-muted hover:text-fg-accent"
                  >
                    the game on lichess
                  </a>
                </>
              ) : null}
            </span>
          ) : null}
          {opening ? (
            <span className="text-sm text-fg-accent" data-testid="opening-name">
              {`${opening.eco} ${opening.name}`}
            </span>
          ) : null}
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
          ref={pasteBox}
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
