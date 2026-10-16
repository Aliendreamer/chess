import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  STANDARD_START,
  engineName,
  fenAt,
  fromGame,
  fromInput,
  isFen,
  lineEnd,
  parsePgn,
  positionKey,
  toInput,
} from '@chess/core'
import {
  AnalysisBoard,
  Button,
  ErrorText,
  Panel,
  SectionHeading,
  analysisTitle,
  useAdoptTyped,
  useAnalysis,
  useCommand,
  useMoveTree,
  useOpeningName,
} from '@chess/ui'
import type { ParsedGame, StudyMove } from '@chess/core'
import { PERSON_NAME, loadGame } from '#/lib/data/play'
import { openingNames } from '#/lib/data/openings'
import { createStudies } from '#/lib/data/studies'

interface Start {
  startFen: string
  tree: Array<StudyMove>
  path?: Array<number>
  players?: { white: string; black: string }
  error: string | null
}

/**
 * The analysis board (analysis-board, desktop-app): any position or game with the move tree and the bundled engine,
 * nothing kept until it is saved as a study. Starts from `?fen=`, `?game={id}` (a finished game), or what is pasted.
 */
export const Route = createFileRoute('/analysis')({
  validateSearch: (search: Record<string, unknown>): { fen?: string; game?: string } => ({
    ...(typeof search['fen'] === 'string' ? { fen: search['fen'] } : {}),
    ...(typeof search['game'] === 'string' ? { game: search['game'] } : {}),
  }),
  loaderDeps: ({ search: { fen, game } }) => ({ fen, game }),
  loader: async ({ context: { app }, deps }): Promise<Start> => {
    if (deps.game) {
      const game = await loadGame(app.db, deps.game)
      if (!game || game.status !== 'ended')
        return {
          startFen: STANDARD_START,
          tree: [],
          error: 'That game can be analysed once it has ended.',
        }
      const engine = engineName(game.level)
      return {
        startFen: STANDARD_START,
        tree: fromGame(game.moves),
        players: {
          white: game.personColor === 'white' ? PERSON_NAME : engine,
          black: game.personColor === 'black' ? PERSON_NAME : engine,
        },
        error: null,
      }
    }
    if (deps.fen !== undefined && !isFen(deps.fen))
      return { startFen: STANDARD_START, tree: [], error: 'That is not a legal position.' }
    return { startFen: deps.fen ?? STANDARD_START, tree: [], error: null }
  },
  component: AnalysisPage,
})

function AnalysisPage() {
  const start = Route.useLoaderData()
  // A new starting point starts a new board.
  return (
    <Analysis
      key={`${start.startFen}|${start.tree.length}|${start.players?.white ?? ''}`}
      start={start}
    />
  )
}

function Analysis({ start }: { start: Start }) {
  const { app } = Route.useRouteContext()
  const editor = useMoveTree(start.startFen, start.tree, start.path ?? lineEnd(start.tree, []))
  // The line's positions (start excluded) name the opening.
  const keys = editor.path.map((_, i) =>
    positionKey(fenAt(editor.startFen, editor.tree, editor.path.slice(0, i + 1))),
  )
  const [loadOpening] = useState(
    () => (key: string) => openingNames(app.db, [key]).then((names) => names.get(key) ?? null),
  )
  const opening = useOpeningName(keys, loadOpening)
  const [request] = useState(
    () => (input: Parameters<typeof app.evaluator.request>[0]) => app.evaluator.request(input),
  )
  const analysis = useAnalysis(request)
  const [players, setPlayers] = useState(start.players)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(start.error)
  const [choices, setChoices] = useState<Array<ParsedGame & { ok: true }>>([])
  const pasteBox = useAdoptTyped<HTMLTextAreaElement>(setPasted)
  const navigate = useNavigate()
  const saving = useCommand()

  async function save() {
    const result = await saving.run(async () => ({
      ok: true as const,
      view: await createStudies(app.db, [
        {
          title: analysisTitle(players),
          startFen: editor.startFen,
          tree: toInput(editor.tree),
          white: players?.white ?? null,
          black: players?.black ?? null,
        },
      ]),
    }))
    const created = result?.created[0]
    if (created) void navigate({ to: '/studies/$id', params: { id: created.id } })
  }

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
              : 'Not kept until you save it as a study.'}
          </span>
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
