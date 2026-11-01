import { AccessibilityInfo, Animated } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { DEFAULT_PREFERENCES } from '@chess/core'
import type { Preferences } from '@chess/core'
import { ThemeProvider } from '../theme/theme'
import { BOARDS } from '../theme/tokens'
import { Board, squareAt, type BoardProps } from './board'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const PROMOTE = '7k/P7/8/8/8/8/8/K7 w - - 0 1'
const CHECK = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
const SIZE = 320
const CELL = SIZE / 8

async function show(props: Partial<BoardProps>, preferences: Preferences = DEFAULT_PREFERENCES) {
  await render(
    <ThemeProvider preferences={preferences}>
      <Board fen={START} orientation="white" size={SIZE} {...props} />
    </ThemeProvider>,
  )
}

/** Where a square's centre is on the board as `orientation` shows it. */
function centre(square: string, orientation: 'white' | 'black' = 'white') {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  const col = orientation === 'white' ? file : 7 - file
  const row = orientation === 'white' ? 8 - rank : rank - 1
  return { locationX: col * CELL + CELL / 2, locationY: row * CELL + CELL / 2 }
}

function touch(name: string, at: { locationX: number; locationY: number }) {
  return fireEvent(screen.getByLabelText('Chess board'), name, { nativeEvent: at })
}

async function tap(square: string, orientation: 'white' | 'black' = 'white') {
  await touch('responderGrant', centre(square, orientation))
  await touch('responderRelease', centre(square, orientation))
}

async function drag(from: string, to: string) {
  await touch('responderGrant', centre(from))
  await touch('responderMove', centre(to))
  await touch('responderRelease', centre(to))
}

const square = (name: string) => screen.getByLabelText(new RegExp(`^${name}(,|$)`))

test('a tap on a piece and a tap on its target plays the move', async () => {
  const onMove = jest.fn()
  await show({ onMove })
  await tap('e2')
  await tap('e4')
  expect(onMove).toHaveBeenCalledWith('e2e4')
})

test('the picked piece shows where it can go', async () => {
  await show({ onMove: jest.fn() })
  await tap('g1')
  expect(square('g1').props.accessibilityState).toMatchObject({ selected: true })
  expect(screen.getByLabelText('f3, move here')).toBeTruthy()
  expect(screen.getByLabelText('h3, move here')).toBeTruthy()
  expect(screen.queryByLabelText('g3, move here')).toBeNull()
})

test('a tap elsewhere drops the piece, and an illegal target plays nothing', async () => {
  const onMove = jest.fn()
  await show({ onMove })
  await tap('e2')
  await tap('e5')
  expect(onMove).not.toHaveBeenCalled()
  expect(square('e2').props.accessibilityState).toMatchObject({ selected: false })
})

test('a piece dragged to a target plays the move', async () => {
  const onMove = jest.fn()
  await show({ onMove })
  await drag('g1', 'f3')
  expect(onMove).toHaveBeenCalledWith('g1f3')
})

test('a piece dragged back to its square stays picked, and one dragged off a target plays nothing', async () => {
  const onMove = jest.fn()
  await show({ onMove })
  await drag('e2', 'e2')
  expect(square('e2').props.accessibilityState).toMatchObject({ selected: true })
  await drag('e2', 'd5')
  expect(onMove).not.toHaveBeenCalled()
})

test('only the side to move may move, and without onMove nothing can', async () => {
  const onMove = jest.fn()
  await show({ fen: AFTER_E4, onMove, side: 'white' })
  await tap('d2')
  expect(square('d2').props.accessibilityState).toMatchObject({ selected: false })
  await screen.unmount()
  await show({})
  await tap('e2')
  expect(screen.queryByLabelText('e4, move here')).toBeNull()
})

test('a pawn reaching the last rank asks what it becomes', async () => {
  const onMove = jest.fn()
  await show({ fen: PROMOTE, onMove })
  await tap('a7')
  await tap('a8')
  expect(onMove).not.toHaveBeenCalled()
  await fireEvent.press(screen.getByRole('button', { name: 'Knight' }))
  expect(onMove).toHaveBeenCalledWith('a7a8n')
  expect(screen.queryByRole('button', { name: 'Queen' })).toBeNull()
})

test('the promotion can be called off', async () => {
  const onMove = jest.fn()
  await show({ fen: PROMOTE, onMove })
  await drag('a7', 'a8')
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
  expect(onMove).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Queen' })).toBeNull()
})

test('flipped, the top-left square is h1', async () => {
  const onMove = jest.fn()
  await show({ orientation: 'black', onMove })
  expect(squareAt(CELL / 2, CELL / 2, SIZE, 'black')).toBe('h1')
  await tap('g1', 'black')
  await tap('f3', 'black')
  expect(onMove).toHaveBeenCalledWith('g1f3')
})

test('a screen reader picks and moves through the squares', async () => {
  const onMove = jest.fn()
  await show({ onMove })
  const activate = { nativeEvent: { actionName: 'activate' } }
  await fireEvent(square('e2'), 'accessibilityAction', activate)
  await fireEvent(screen.getByLabelText('e4, move here'), 'accessibilityAction', activate)
  expect(onMove).toHaveBeenCalledWith('e2e4')
})

test('the squares name their pieces', async () => {
  await show({})
  expect(screen.getByLabelText('e1, white king')).toBeTruthy()
  expect(screen.getByLabelText('d8, black queen')).toBeTruthy()
  expect(screen.getByLabelText('e4')).toBeTruthy()
})

test('the last move, the check and the board theme show', async () => {
  await show(
    { fen: CHECK, lastMove: { from: 'd8', to: 'h4' } },
    {
      ...DEFAULT_PREFERENCES,
      boardTheme: 'green',
    },
  )
  expect(screen.getByTestId('last-h4')).toHaveStyle({ backgroundColor: BOARDS.green.last })
  expect(screen.getByTestId('last-d8')).toBeTruthy()
  expect(screen.getByTestId('check-e1')).toBeTruthy()
  expect(square('a1')).toHaveStyle({ backgroundColor: BOARDS.green.dark })
  expect(square('h1')).toHaveStyle({ backgroundColor: BOARDS.green.light })
})

test('coordinates follow the preference', async () => {
  await show({})
  expect(screen.getByText('a')).toBeTruthy()
  expect(screen.getByText('8')).toBeTruthy()
  await screen.unmount()
  await show({}, { ...DEFAULT_PREFERENCES, coordinates: false })
  expect(screen.queryByText('a')).toBeNull()
})

test('while the other side is to move, taps queue a premove', async () => {
  const onPremove = jest.fn()
  await show({ fen: AFTER_E4, side: 'white', onMove: jest.fn(), onPremove })
  await tap('g1')
  await tap('f3')
  expect(onPremove).toHaveBeenCalledWith({ from: 'g1', to: 'f3' })
})

test('a queued premove is tinted', async () => {
  await show({ fen: AFTER_E4, premove: { from: 'g1', to: 'f3' } })
  expect(screen.getByTestId('premove-f3')).toHaveStyle({
    backgroundColor: BOARDS.brown.premove,
  })
})

describe('the last move slides in', () => {
  const played = { fen: AFTER_E4, lastMove: { from: 'e2', to: 'e4' } }

  async function replay(preferences: Preferences = DEFAULT_PREFERENCES) {
    const timing = jest.spyOn(Animated, 'timing')
    await show({}, preferences)
    await screen.rerender(
      <ThemeProvider preferences={preferences}>
        <Board orientation="white" size={SIZE} {...played} />
      </ThemeProvider>,
    )
    return timing
  }

  afterEach(() => jest.restoreAllMocks())

  test('for as long as the animation preference says', async () => {
    const timing = await replay()
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: 200 }),
    )
  })

  test('not at all with animation off', async () => {
    const timing = await replay({ ...DEFAULT_PREFERENCES, animation: 'off' })
    expect(timing).not.toHaveBeenCalled()
  })

  test('not at all when the system asks for less motion', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const timing = await replay()
    expect(timing).not.toHaveBeenCalled()
  })

  test('not when the player dropped the piece there', async () => {
    const timing = jest.spyOn(Animated, 'timing')
    const onMove = jest.fn()
    await show({ onMove })
    await drag('e2', 'e4')
    await screen.rerender(
      <ThemeProvider preferences={DEFAULT_PREFERENCES}>
        <Board orientation="white" size={SIZE} onMove={onMove} {...played} />
      </ThemeProvider>,
    )
    expect(timing).not.toHaveBeenCalled()
  })
})
