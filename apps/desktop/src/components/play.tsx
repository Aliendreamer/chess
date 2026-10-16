import { ENGINE_LEVELS, THINK_SECONDS, engineName, reasonLabel } from '@chess/core'
import { AppLink, Button, Chip, ColourPicker, ErrorText, OptionTile, Panel } from '@chess/ui'
import type { ColourChoice, EngineLevel, ThinkSeconds } from '@chess/core'
import type { DesktopGame, GameListItem } from '#/lib/data/play'
import { PERSON_NAME } from '#/lib/data/play'

/** A level, your colour and the engine's think time, then an untimed game against Stockfish (desktop-app D5). */
export function EngineForm({
  level,
  color,
  think,
  busy,
  error,
  onLevel,
  onColor,
  onThink,
  onStart,
}: {
  level: string
  color: ColourChoice
  think: ThinkSeconds
  busy: boolean
  error: string | null
  onLevel: (level: string) => void
  onColor: (color: ColourChoice) => void
  onThink: (think: ThinkSeconds) => void
  onStart: () => void
}) {
  return (
    <Panel variant="filled" className="gap-4" testId="engine-form">
      <div className="grid grid-cols-5 gap-2" role="group" aria-label="Level">
        {ENGINE_LEVELS.map((l) => (
          <OptionTile
            key={l.level}
            compact
            figure={l.label}
            figureSize="sm"
            label={`Level ${l.label}`}
            align="center"
            selected={l.level === level}
            onClick={() => onLevel(l.level)}
          />
        ))}
      </div>
      <ColourPicker value={color} onChange={onColor} />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Think time">
        <span className="text-sm text-fg-secondary">The computer thinks</span>
        {THINK_SECONDS.map((s) => (
          <Chip key={s} mono selected={s === think} onClick={() => onThink(s)}>
            {s} s
          </Chip>
        ))}
        <span className="text-sm text-fg-secondary">a move.</span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-fg-secondary">Untimed: no clocks, no draw offers.</span>
        <Button variant="primary" disabled={busy} onClick={onStart}>
          Play the computer
        </Button>
      </div>
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Panel>
  )
}

/** "1–0", "0–1", "½–½" as people write a result. */
export function resultMark(result: string | null): string {
  if (result === '1-0') return '1–0'
  if (result === '0-1') return '0–1'
  if (result === '1/2-1/2') return '½–½'
  return '…'
}

/** The person's outcome of a finished game: won, lost or drawn. */
export function outcome(
  game: Pick<DesktopGame, 'result' | 'personColor'>,
): 'win' | 'loss' | 'draw' | null {
  if (game.result === '1/2-1/2') return 'draw'
  if (game.result === '1-0') return game.personColor === 'white' ? 'win' : 'loss'
  if (game.result === '0-1') return game.personColor === 'black' ? 'win' : 'loss'
  return null
}

const OUTCOME_TEXT = { win: 'You won', loss: 'You lost', draw: 'Drawn' } as const
const OUTCOME_TONE = {
  win: 'text-status-win',
  loss: 'text-status-loss',
  draw: 'text-status-draw',
} as const

/** A player's line above or below the board: the name and their colour, the side to move marked. */
export function PlayerLine({
  name,
  color,
  toMove,
  detail,
}: {
  name: string
  color: 'white' | 'black'
  toMove: boolean
  detail?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3" data-testid={`player-${color}`}>
      <div className="flex min-w-0 flex-col">
        <span className="font-medium text-fg-primary">{name}</span>
        <span className="text-xs text-fg-secondary">
          {color}
          {toMove ? ' · to move' : ''}
          {detail ? ` · ${detail}` : ''}
        </span>
      </div>
    </div>
  )
}

/** How a finished game ended, and what to do next. */
export function GameEndPanel({
  game,
  onNewGame,
  onSavePgn,
  onAnalyse,
}: {
  game: DesktopGame
  onNewGame: () => void
  onSavePgn: () => void
  onAnalyse: () => void
}) {
  const result = outcome(game)
  return (
    <Panel variant="accent" className="gap-3" testId="game-end">
      <p className={`m-0 font-display text-display-sm ${result ? OUTCOME_TONE[result] : ''}`}>
        {result ? OUTCOME_TEXT[result] : 'Game over'} · {resultMark(game.result)}
      </p>
      {game.reason ? (
        <p className="m-0 text-sm text-fg-secondary">{reasonLabel(game.reason)}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onNewGame}>
          New game
        </Button>
        <Button onClick={onAnalyse}>Analyse</Button>
        <Button onClick={onSavePgn}>Save PGN</Button>
      </div>
    </Panel>
  )
}

/** The person's games, newest first: result, opponent, moves, and a link to each. */
export function GameRows({
  games,
  empty = 'No games yet: play the computer.',
}: {
  games: ReadonlyArray<GameListItem>
  empty?: string
}) {
  if (games.length === 0) return <p className="text-sm text-fg-muted">{empty}</p>
  return (
    <ul className="m-0 flex list-none flex-col p-0" aria-label="Games">
      {games.map((g) => {
        const result = outcome(g)
        return (
          <li
            key={g.id}
            data-testid="game-row"
            className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 border-b border-line-divider py-2.5"
          >
            <span
              className={`font-mono text-sm ${result ? OUTCOME_TONE[result] : 'text-fg-muted'}`}
            >
              {g.status === 'playing' ? 'Live' : resultMark(g.result)}
            </span>
            <AppLink
              to={`/games/${g.id}`}
              className="truncate text-fg-primary no-underline hover:text-fg-accent"
            >
              {versus(g.personColor, g.level)}
            </AppLink>
            <span className="text-xs text-fg-secondary">
              {Math.ceil(g.ply / 2)} moves{g.reason ? ` · ${reasonLabel(g.reason)}` : ''}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** "You – Stockfish (Casual)" with White first. */
export function versus(personColor: 'white' | 'black', level: EngineLevel): string {
  const engine = engineName(level)
  return personColor === 'white' ? `${PERSON_NAME} – ${engine}` : `${engine} – ${PERSON_NAME}`
}
