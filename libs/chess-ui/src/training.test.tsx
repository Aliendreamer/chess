import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ProgressStrip,
  TrainingCounts,
  TrainingPanel,
  TrainingStart,
  TrainingSummaryView,
  TrainingVerdictView,
  poolText,
} from './training.tsx'
import type { ReactNode } from 'react'
import type {
  TrainingAnswer,
  TrainingItem,
  TrainingSettings,
  TrainingSummary,
  TrainingVerdict,
} from './training-model.ts'

afterEach(cleanup)

const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2'

const SUMMARY: TrainingSummary = {
  games: { positions: 12, learned: 3, due: 2 },
  library: { pool: 1, seen: 40, learned: 5, due: 1 },
}

const item: TrainingItem = {
  id: `p:${'a'.repeat(32)}`,
  mode: 'library',
  fen: FEN,
  sideToMove: 'white',
  box: null,
}

const verdict = (over: Partial<TrainingVerdict> = {}): TrainingVerdict => ({
  correct: false,
  verdict: 'none',
  masterUci: 'b1c3',
  playedUci: null,
  acceptedUci: ['d2d4'],
  bestLine: ['d2d4', 'e5d4', 'd1d4'],
  source: {
    kind: 'library',
    libraryGameId: '0192f0c1-1111-7aaa-8bbb-123456789abc',
    white: 'Kasparov, Garry',
    black: 'Topalov, Veselin',
    event: 'Wijk aan Zee',
    year: 1999,
    ply: 2,
  },
  box: 0,
  dueAt: '2026-10-10T00:00:00Z',
  learned: false,
  ...over,
})

const start = (props: Partial<Parameters<typeof TrainingStart>[0]> = {}) => {
  const settings: TrainingSettings = { mode: 'games', filters: {}, length: 10 }
  return (
    <TrainingStart
      settings={settings}
      summary={SUMMARY}
      empty={false}
      busy={false}
      error={null}
      onChange={vi.fn()}
      onStart={vi.fn()}
      {...props}
    />
  )
}

describe('TrainingStart', () => {
  it('shows the pool of the mode and switches modes', () => {
    const onChange = vi.fn()
    render(start({ onChange }))
    expect(screen.getByTestId('training-pool').textContent).toBe(
      '12 positions from your games · 3 learned · 2 due',
    )
    expect(screen.queryByTestId('training-filters')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Master games' }))
    expect(onChange).toHaveBeenCalledWith({ mode: 'library', filters: {}, length: 10 })
    fireEvent.click(screen.getByRole('button', { name: 'Endless' }))
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'games', filters: {}, length: 'endless' })
  })

  it('filters master games by opening, phase, player and years', () => {
    const onChange = vi.fn()
    const settings: TrainingSettings = {
      mode: 'library',
      filters: { phase: 'endgame' },
      length: 10,
    }
    render(start({ settings, onChange }))
    expect(screen.getByTestId('training-pool').textContent).toBe(
      '1 master position · 40 seen · 5 learned · 1 due',
    )
    const phase = screen.getByRole('group', { name: 'Phase' })
    expect(
      within(phase).getByRole('button', { name: 'Endgame' }).getAttribute('aria-pressed'),
    ).toBe('true')
    fireEvent.click(within(phase).getByRole('button', { name: 'Middlegame' }))
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, filters: { phase: 'middlegame' } })
    fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'Carlsen' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      filters: { phase: 'endgame', player: 'Carlsen' },
    })
    fireEvent.change(screen.getByLabelText('Opening'), { target: { value: 'B90' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      filters: { phase: 'endgame', opening: 'B90' },
    })
    fireEvent.change(screen.getByLabelText('From year'), { target: { value: '1990' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      filters: { phase: 'endgame', from: 1990 },
    })
    fireEvent.change(screen.getByLabelText('To year'), { target: { value: 'x' } })
    expect(onChange).toHaveBeenLastCalledWith({
      ...settings,
      filters: { phase: 'endgame', to: undefined },
    })
  })

  it('says when nothing matched, and starts', () => {
    const onStart = vi.fn()
    const { rerender } = render(start({ empty: true, onStart }))
    expect(screen.getByTestId('training-empty').textContent).toContain('No mistakes to train yet.')
    rerender(
      start({ empty: true, settings: { mode: 'library', filters: {}, length: 10 }, onStart }),
    )
    expect(screen.getByTestId('training-empty').textContent).toBe(
      'No master position matches these filters.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(onStart).toHaveBeenCalled()
  })

  it('counts the pool in words', () => {
    expect(poolText('games', { ...SUMMARY, games: { positions: 1, learned: 0, due: 1 } })).toBe(
      '1 position from your games · 0 learned · 1 due',
    )
  })
})

describe('TrainingVerdictView', () => {
  it('names the master’s move, plays the engine’s line onto the board and links the game', () => {
    const onPreview = vi.fn()
    const { rerender } = render(
      <TrainingVerdictView
        item={item}
        answer="g2g4"
        verdict={verdict()}
        preview={null}
        onPreview={onPreview}
      />,
    )
    expect(screen.getByTestId('training-verdict-text').textContent).toBe(
      'Not this time. Kasparov played Nc3.',
    )
    expect(screen.getByText('You played 2.g4.')).toBeTruthy()
    const line = screen.getByRole('group', { name: 'Engine line' })
    expect(line.textContent).toBe('Engine:2.d4exd4Qxd4')
    fireEvent.click(within(line).getByRole('button', { name: 'exd4' }))
    expect(onPreview).toHaveBeenCalledWith({ ply: 0, upTo: 2 })
    rerender(
      <TrainingVerdictView
        item={item}
        answer="g2g4"
        verdict={verdict()}
        preview={{ ply: 0, upTo: 2 }}
        onPreview={onPreview}
      />,
    )
    expect(screen.getByRole('button', { name: 'exd4' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Back to the position' }))
    expect(onPreview).toHaveBeenLastCalledWith(null)
    expect(screen.getByTestId('training-source').textContent).toBe(
      'Kasparov–Topalov, Wijk aan Zee 1999, move 2 · the game',
    )
    expect(screen.getByRole('link', { name: 'the game' }).getAttribute('href')).toBe(
      '/analysis?library=0192f0c1-1111-7aaa-8bbb-123456789abc&ply=2',
    )
  })

  it('links the member’s own game', () => {
    render(
      <TrainingVerdictView
        item={{ ...item, mode: 'games' }}
        answer="d2d4"
        verdict={verdict({
          correct: true,
          verdict: 'engine',
          masterUci: null,
          playedUci: 'g2g4',
          source: { kind: 'game', gameId: 'abc', ply: 3, opponent: 'anna' },
        })}
        preview={null}
        onPreview={vi.fn()}
      />,
    )
    expect(screen.getByTestId('training-verdict-text').textContent).toBe(
      'Engine approves (you played g4 in the game).',
    )
    expect(screen.getByRole('link', { name: 'the game' }).getAttribute('href')).toBe('/games/abc')
  })
})

describe('TrainingPanel', () => {
  const panel = (props: Partial<Parameters<typeof TrainingPanel>[0]> = {}) => (
    <TrainingPanel
      item={item}
      marks={['✓', '✗', '·']}
      answers={[]}
      pool={30}
      played={null}
      verdict={null}
      busy={false}
      error={null}
      preview={null}
      onPreview={vi.fn()}
      onNext={vi.fn()}
      onFinish={vi.fn()}
      {...props}
    />
  )

  it('asks for the move with the progress strip, then shows the verdict and Next', () => {
    const onNext = vi.fn()
    const { rerender } = render(panel({ onNext }))
    expect(screen.getByTestId('training-prompt').textContent).toBe(
      'White to move: find the best move',
    )
    expect(screen.getByRole('img', { name: '1 right, 1 wrong, 1 to go' })).toBeTruthy()
    expect(screen.getByText('New position · 30 in the pool')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    rerender(panel({ onNext, played: 'g2g4', verdict: verdict() }))
    expect(screen.getByTestId('training-verdict')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onNext).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull()
  })

  it('an endless session shows the running score and can finish', () => {
    const onFinish = vi.fn()
    const answers: Array<TrainingAnswer> = [
      { item, uci: 'b1c3', verdict: verdict({ correct: true }) },
      { item, uci: 'g2g4', verdict: verdict() },
    ]
    render(panel({ marks: null, answers, played: 'g2g4', verdict: verdict(), onFinish }))
    expect(screen.getByTestId('training-score').textContent).toBe('1 / 2')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(onFinish).toHaveBeenCalled()
  })
})

describe('ProgressStrip', () => {
  it('marks each answer', () => {
    render(<ProgressStrip marks={['✓', '·']} />)
    expect(screen.getByTestId('training-progress').textContent).toBe('✓·')
  })
})

describe('TrainingSummaryView', () => {
  it('scores the set, revisits a miss and offers another set or other settings', () => {
    const onRevisit = vi.fn()
    const onAgain = vi.fn()
    const onSettings = vi.fn()
    const answers: Array<TrainingAnswer> = [
      { item, uci: 'b1c3', verdict: verdict({ correct: true }) },
      { item: { ...item, id: `p:${'b'.repeat(32)}` }, uci: 'g2g4', verdict: verdict() },
    ]
    render(
      <TrainingSummaryView
        answers={answers}
        length={10}
        revisit={null}
        onRevisit={onRevisit}
        onAgain={onAgain}
        onSettings={onSettings}
      />,
    )
    expect(screen.getByTestId('training-final-score').textContent).toBe('1 / 2')
    const list = screen.getByRole('list', { name: 'Misses' })
    fireEvent.click(within(list).getByRole('button', { name: /Kasparov–Topalov/ }))
    expect(onRevisit).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Another 10' }))
    expect(onAgain).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Change settings' }))
    expect(onSettings).toHaveBeenCalled()
  })

  it('a clean set has no misses', () => {
    render(
      <TrainingSummaryView
        answers={[{ item, uci: 'b1c3', verdict: verdict({ correct: true }) }]}
        length="endless"
        revisit={null}
        onRevisit={vi.fn()}
        onAgain={vi.fn()}
        onSettings={vi.fn()}
      />,
    )
    expect(screen.getByText('No misses.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Again' })).toBeTruthy()
  })
})

describe('TrainingCounts', () => {
  it('shows the member’s counts and links the page', () => {
    render(<TrainingCounts summary={SUMMARY} />)
    expect(screen.getByTestId('training-counts-games').textContent).toBe(
      'My games: 12 mistakes · 3 learned · 2 due',
    )
    expect(screen.getByTestId('training-counts-library').textContent).toBe(
      'Master games: 40 seen · 5 learned · 1 due',
    )
    expect(screen.getByRole('link', { name: 'Train' }).getAttribute('href')).toBe('/training')
  })
})
